# raw 逃生舱（reply.raw）+ 框架能力对齐

- 日期：2026-06-29
- 分支：`feat/adapter-setcookie-error-align`
- 状态：设计已确认，待 plan
- 关联：依赖 v3.0 架构（`adapters/types.ts` 的 Context/Reply/Middleware）；错误处理对齐已由 commit `727b2c0` 完成（三框架统一 re-throw 给 app 级错误中间件）

## 目标

v3.0 的标准化抽象（Context/Reply/Middleware）让 before/middleware/handler 能跨框架复用，但 `Reply` 只有 `status/json/send` 三个方法，导致 setCookie、redirect、setHeader、流式响应、文件下载等底层能力在 `registerTyped` 的 handler 里**完全无法访问**。逐个给 Reply 补方法的方案不可行——Express `res.cookie()`、Koa `ctx.cookies.set()`、leizmweb 各不相同，永远对不齐。

本次设计引入一个**框架泛型驱动的 raw 逃生舱**（`reply.raw`），让 handler 能拿到强类型的框架原生对象；同时审计三框架的其它能力差异，提供可选的统一错误响应格式器。

> 范围限定：raw 逃生舱 + 能力对齐审计。错误处理（re-throw 语义）已对齐，本次不动。

---

## §1 — 核心设计：reply.raw + 全自动 Raw 泛型

### 当前问题（证据）

- `Reply` 接口（`src/lib/adapters/types.ts:72-79`）只有 `status/json/send`，无原生对象访问入口
- 三框架 adapter 的 `nativeMiddleware` 闭包内**本就持有原生对象**（Express 的 `req/res`、Koa 的 `ctx`、leizmweb 的 `ctx`），构造标准 Context 时却没把它暴露出来——这是纯粹的接口缺口，不是能力缺口
- `reply.json()` → `expressRes.json()`（`packages/erest-express/src/index.ts:141`）；同理 Koa/leizmweb，均无 raw 注入点
- 现有泛型 `ERest<T>` 的 `T` 表示 handler/中间件类型（`DEFAULT_HANDLER`），三框架下 `T` 同值，框架差异未进类型层

### 1.1 Reply 接口加泛型与 raw 字段

```ts
// src/lib/adapters/types.ts
export interface Reply<Raw = unknown> {
  status(code: number): this;
  json(body: unknown): void;
  send(body: string): void;
  /** 框架原生对象逃生舱（setCookie/redirect/stream/文件下载等） */
  readonly raw: Raw;
}
```

`Context.reply` 类型随之变为 `Reply<unknown>`（核心层框架无关）。**Context 本身不加 raw**——仅 handler 拿 raw，before/middleware/hook 保持纯标准 Context。

### 1.2 TypeScript 硬约束：Raw 必须在构造时锁定

`bind()` 是运行时方法，无法反向修改 `this` 的泛型参数：

```ts
const api = new ERest();                       // 这一刻 Raw 定死成 unknown
api.bind({ adapter: new ExpressAdapter() });   // 这一步无法把 Raw 收紧成 ExpressRaw
```

故「自动」唯一可行的落点是**构造时锁定**，由子包提供工厂函数：

```ts
import { createERest } from "@erest/express";
const api = createERest({ info, groups, forceGroup });
//    ^? ERest<Middleware, ExpressRaw>  ← Raw 已自动锁定
```

### 1.3 泛型透传链路（重构 6 处）

```
ERest<T, Raw>     API<T, Raw>     IGroup<T, Raw>
    │                 │                │
    └─ group() ──→ get/post() ──→ registerTyped(handler 的 reply: Reply<Raw>)

子包工厂 createERest(): ERest<Middleware, ExpressRaw>
```

| 位置 | 改动 |
|------|------|
| `types.ts` | `Reply<Raw>` 加 `raw: Raw` 字段；`FrameworkAdapter<T, Raw>` 加 Raw 维度 |
| `api.ts` | `API<T>` → `API<T, Raw>`；`registerTyped` 的 handler reply 类型 `Reply` → `Reply<Raw>`（Raw 从类泛型透传，**不污染**现有 TQuery/TBody/TParams/THeaders/TResponse 5 个方法级泛型，两者正交） |
| `index.ts` | `ERest<T>` → `ERest<T, Raw>`；`IGroup<T>` → `IGroup<T, Raw>`；`group()` 透传 Raw |
| 3 子包 | `createXxxReply` 塞 raw 值；新增 `createERest()` 工厂 + 导出 `ExpressRaw`/`KoaRaw`/`LeizmWebRaw` 类型 |

### 1.4 使用形态

```ts
// 入口：子包工厂，Raw 自动锁定
import { createERest } from "@erest/express";
const api = createERest({ info: API_INFO, groups: GROUPS, forceGroup: true });

// handler：零标注，reply.raw 自动强类型
api.group("auth").post("/login")
  .registerTyped(
    { body: LoginSchema },
    (req, reply) => {
      const user = authenticate(req.body);
      reply.raw.res.cookie("token", sign(user), { httpOnly: true });
      //     ^? { req: Request; res: Response }  ← 自动推导
      reply.status(201).json({ ok: true });
    }
  );

// 过渡期兼容：直接 new ERest() 仍可用（标记 @deprecated），Raw 退化为 unknown
import { ERest } from "erest";
const api2 = new ERest({ ... });   // reply.raw 类型为 unknown，需手动断言；新代码请用 createERest()
```

### 1.5 三框架 adapter 改动（热路径零分配）

```ts
// express: packages/erest-express/src/index.ts
export type ExpressRaw = { req: Request; res: Response };
export class ExpressAdapter<T = unknown> implements FrameworkAdapter<T, ExpressRaw> { ... }

function createExpressReply(req, res): Reply<ExpressRaw> {
  const reply: Reply<ExpressRaw> = { /* status/json/send 不变 */ };
  reply.raw = { req, res };   // 闭包本就持有 req/res，多挂一个引用
  return reply;
}

// Koa:  reply.raw = ctx;        (KoaRaw = KoaContext)
// leizmweb: reply.raw = ctx;    (LeizmWebRaw = LeiContext)

// 子包工厂（构造时锁定 Raw）
export function createERest(options): ERest<Middleware, ExpressRaw> {
  return new ERest<Middleware, ExpressRaw>(options);
}
```

### 1.6 兼容策略

废弃裸 `new ERest()`（标记 `@deprecated`，过渡期保留）。裸构造时 `Raw = unknown`，`reply.raw` 可用但需断言。现有 examples 和用户代码**零改动**通过；新代码引导到子包 `createERest()`。

---

## §2 — 能力对齐审计

raw 逃生舱天然覆盖了大部分「对不齐」的能力（stream/cookie/headersSent/redirect），因为本质都是「需要原生对象」。本次**不补 Reply 方法、不抹平差异**，仅通过 raw 暴露 + 文档标注。

### 2.1 原生能力差异速查表（文档新增）

| 能力 | Express (`reply.raw`) | Koa (`reply.raw`) | @leizm/web (`reply.raw`) |
|------|------|------|------|
| 设置 cookie | `.res.cookie(name, val, opts)` | `.cookies.set(name, val, opts)` | `.response.cookie(...)` |
| 读取 cookie | 需 `cookie-parser`，`.req.cookies` | `.cookies.get(name)` | `.request.cookies` |
| 重定向 | `.res.redirect(code, url)` | `.redirect(url)` / `ctx.status=302` | `.response.redirect(...)` |
| 流式响应 | `.res.write()` / `.res.end()` | `.body = stream` | `.response.send()` |
| 响应头已发送 | `.res.headersSent` | `.res.headersSent` | 查原生 |

### 2.2 已对齐项（本次不动）

- **错误处理**：三框架统一 re-throw 给 app 级错误中间件（commit `727b2c0`）
- **404 未匹配**：各框架默认行为，erest 不干预
- **校验失败**：统一走 `compileValidate` 抛 ERestError 后 re-throw
- **reply.send 写入**：三框架 adapter 已封装（`res.end()` / `ctx.body=` / `ctx.response.send()`）

### 2.3 可选统一错误格式器

erest 核心**新增**一个可选的错误响应格式化器，用户 opt-in 后三框架错误响应体格式一致。不强制、不改现有 examples、不触碰 adapter。

```ts
// src/lib/error.ts 新增
export interface ErrorFormatter {
  (err: ERestError | Error): { status: number; body: unknown };
}

/** 内置默认格式器（与现有 examples 一致），可直接用或自定义 */
export const defaultErrorFormatter: ErrorFormatter = (err) => {
  const e = err as ERestError;
  const status = e.statusCode || (err as { status?: number }).status || 400;
  return {
    status,
    body: { error: err.message, code: e.code ?? "INTERNAL_ERROR" },
  };
};
```

**接入方式：工具函数（不改 adapter）**。三框架一行替换，与刚对齐的 re-throw 链路零冲突：

```ts
// Express
app.use((err, _req, res, _next) => {
  const { status, body } = defaultErrorFormatter(err);
  res.status(status).json(body);
});

// Koa
app.use(async (ctx, next) => {
  try { await next(); }
  catch (err) {
    const { status, body } = defaultErrorFormatter(err);
    ctx.status = status; ctx.body = body;
  }
});
```

> 不采用「adapter 内置格式化」方案——那会破坏 commit `727b2c0` 的 re-throw 对齐，且让 adapter 承担响应职责，违背「adapter 只做桥接」原则。

---

## §3 — 生命周期与 raw 的一致性

### 3.1 生命周期 hook 不暴露 raw

| hook | 入参 | 拿 raw？ | 说明 |
|------|------|---------|------|
| `onRequest` | `Context` | ❌ | 请求进入，handler 执行前 |
| `onValidate` | `Context` | ❌ | Zod 校验后 |
| `onError` | `Context + err` | ❌ | 错误发生时（仅观察，错误已 re-throw） |
| `onResponse` | `Context` | ❌ | 响应前 |

理由：onError 场景下错误已 re-throw 给 app 级中间件，若 onError 能通过 raw 写响应，将与 re-throw 语义冲突（双重写入风险）。保持 hook 为纯观察者，符合 AGENTS.md 约定 4（hook 是观察者、不参与控制流）。

### 3.2 raw 与 reply 方法的写入顺序约束

raw 操作（cookie/header）写响应头区，`reply.json()` 写响应体。HTTP 协议下「头先于体发送」，故：

- ✅ `reply.raw.res.cookie(...)` 然后 `reply.json(...)` —— 安全
- ⚠️ `reply.json(...)` 然后 `reply.raw.res.cookie(...)` —— **可能失败**（body 写入后再设 header 会被忽略/警告）

这是 raw 逃生舱的固有约束（任何 escape hatch 都有），文档明确标注：**「raw 的头部/cookie 操作应在 reply.json()/send() 之前调用」**。不代码强制。

### 3.3 Context 不加 raw 的一致性收益

before/middleware/hook 三处保持纯框架无关签名，可跨框架复用。现有 `examples/src/hooks.js` 的 authBefore/logMiddleware 等**零改动**。raw 是 handler 专属的「逃生舱」，职责清晰：标准链负责跨框架复用，raw 负责框架特有能力。

---

## §4 — 测试策略

| 层面 | 测试 |
|------|------|
| **类型层** | `reply.raw` 在 `createERest()` 后自动推导为正确类型；`new ERest()` 时为 unknown |
| **运行时（三框架）** | 各跑一个 setCookie handler，断言响应 `Set-Cookie` 头 |
| **错误格式器** | `defaultErrorFormatter` 对 ERestError / 普通 Error 输出一致 `{status, body}` 结构 |
| **向后兼容** | 现有 examples（裸 `new ERest` + 无 raw handler）零改动通过 |
| **生命周期** | onError hook 不因 raw 引入而产生双重写入 |
| **文档生成** | 带 raw 的 registerTyped 仍能正常生成 OpenAPI/Markdown（schema 还在） |

---

## §5 — 决策记录

| 决策点 | 结论 | 理由 |
|--------|------|------|
| 范围 | raw 逃生舱 + 能力对齐审计 | setCookie 等底层能力的根本缺口 |
| raw 形态 | 复用 builder 链，`reply.raw` 透传 | 不另起平行 API，最小侵入 |
| raw 与 schema | 保留 Zod 校验 + 文档生成 | erest 核心价值不能丢 |
| middleware 触点 | 仅 handler 拿 raw | before/middleware/hook 保持跨框架复用 |
| raw 类型 | 框架泛型强类型，全自动推导 | 类型安全最好，体验最佳 |
| 泛型路径 | `ERest<T, Raw>` 双泛型，构造时锁定 | TS 硬约束：运行时无法收紧类泛型 |
| 工厂位置 | 子包 `createERest()` | 构造时锁定 Raw 的唯一落点 |
| 兼容策略 | 废弃裸 `new ERest()`（过渡） | 推动升级，保留过渡期 |
| 原生能力对齐 | 仅 raw + 文档标注 | 不补 Reply 方法，尊重框架原生习惯 |
| 错误格式器 | 工具函数 `defaultErrorFormatter` | 不改 adapter，不破坏 re-throw 对齐 |
| 生命周期 | hook 不暴露 raw | 保持纯观察者，避免双重写入 |

## §6 — 不在本次范围（YAGNI）

- ❌ 给 Reply 补 cookie()/redirect()/setHeader() 等方法（三框架签名永远对不齐）
- ❌ 在 raw 之上抽象「统一原生能力层」（工作量大且与原生习惯冲突）
- ❌ 让 adapter 内置错误格式化（破坏 re-throw 对齐）
- ❌ 重新设计 Context/Reply 抽象边界（本次只加 raw 字段，不动既有结构）
