# 类型安全 state + 全局响应信封 + 便利 schema

- 日期：2026-06-30
- 分支：`feat/typed-state-envelope`（待创建）
- 状态：设计已确认，待 plan
- 关联：依赖 v3.1（`adapters/types.ts` 的 Context/Reply/Middleware + 子包 `createERest` 工厂，见 `2026-06-29-raw-escape-hatch-and-capability-alignment.md`）；由 one-api phase2-server dogfooding 暴露的痛点驱动

## 目标

erest v3.1 的 `registerTyped` 让 handler 框架无关、Zod 校验自动完成，但在 one-api（真实消费者）的实施过程中暴露了三类**框架侧缺口**：中间件协作丢类型、响应格式要手写包装、便利 schema 缺失。本次设计在 erest 框架层补齐这三块，让 `registerTyped` 成为「声明 schema → 纯函数 return data → 框架自动校验/包装/类型推导」的完整闭环。

> 范围限定：erest 框架改进（主）+ one-api phase2-server 同步适配（验证）。**不**改动 handler chain 执行顺序、**不**改动校验时机（before 钩子仍在校验前跑——见 §4 遗留）。

### 设计哲学

`registerTyped` 收敛为**纯函数式风格**：`(req, ctx) => data`，handler 只产出数据，框架负责包装响应。需要框架原生能力（setCookie/redirect/stream）时退回 `register`（配合 `reply.raw` 逃生舱，已由 v3.1 提供）。

---

## §1 — 驱动证据（one-api phase2-server 痛点）

### 痛点 1：`ctx.state` 丢类型，鉴权值靠 `as` 断言取回

`Context.state` 当前是 `Record<string, unknown>`（`src/lib/adapters/types.ts:115`）。before 钩子注入的鉴权结果，handler 取回时类型全失：

```ts
// one-api: hooks.ts:34 — 注入（写）
ctx.state['currentToken'] = { id, name, permissions } satisfies CurrentToken;
// one-api: auth.ts:46 — 取回（读，丢类型，手写断言）
const cu = ctx.state['currentUser'] as CurrentAdmin;
```

全局 grep：`ctx.state[...] as ` 出现在 `hooks.ts`、`auth.ts`、`admins.ts` 共 6 处。

### 痛点 4：响应信封要手写包装，测试还得单独桥接

one-api 用统一信封 `{success, data|error}`。当前实现：

- `utils/response.ts` 手写 `ok()/fail()` 工具
- **每个** handler 末尾 `reply.json(ok(x))`（data.ts / token.ts / table.ts / admin-data.ts / admins.ts / auth.ts 全量）
- `api/format.ts` 的 `applyEnvelopeFormat` 调 `setFormatOutput`，**只**让测试脚手架识别信封，**真实响应仍要 handler 自己包**
- `app.ts` 的 app 级错误中间件手写错误信封分支

框架缺一个「handler return data → 自动包装 envelope」的响应层。

### 痛点 3 + 6：便利 schema 缺失 + 测试返回 `unknown`

- 痛点 3：「任意动态字段 body」写成 `z.object({}).catchall(z.unknown())`（data.ts:67、admin-data.ts:60、data-schema.ts:47 共 4 处），Zod 黑话。
- 痛点 6：`TestAgent.success()` / `error()` 返回 `Promise<unknown>`（`src/lib/agent.ts:265/273`），one-api 测试每个用例都 `(await ...success()) as {...}`（data.test.ts 全量）。声明了 `response` schema 却没串到测试返回类型。

---

## §2 — 改进 1：类型安全的 state（ERest 实例级泛型 StateMap）

### 2.1 方案：ERest 增加第三个泛型参数 `State`

```ts
// src/lib/index.ts
class ERest<T = DEFAULT_HANDLER, Raw = unknown, State extends Record<string, unknown> = Record<string, unknown>> {
  // ...
}
```

`State` 默认 `Record<string, unknown>`，**向后兼容**：存量 `new ERest()` / `createERest()` 不传 State 时，行为与类型与 v3.1 完全一致。

### 2.2 Context.state 收紧类型

```ts
// src/lib/adapters/types.ts
export interface Context<State extends Record<string, unknown> = Record<string, unknown>> {
  // ...
  readonly state: State;  // 原 Record<string, unknown>
  // ...
}
```

`Middleware` 类型同步带 `State` 泛型默认值，避免破坏现有中间件签名：

```ts
export type Middleware<State extends Record<string, unknown> = Record<string, unknown>> = (
  ctx: Context<State>,
  next: () => Promise<void> | void
) => Promise<void> | void;
```

### 2.3 子包 createERest 工厂透传 State

```ts
// packages/erest-leizmweb/src/index.ts（express/koa 同理）
export function createERest<
  State extends Record<string, unknown> = Record<string, unknown>
>(options: ConstructorParameters<typeof ERestCtor>[0]): ERest<Middleware<State>, LeizmWebRaw, State> {
  return new ERestCtor<Middleware<State>, LeizmWebRaw, State>(options);
}
```

### 2.4 泛型透传链路

需把 `State` 从 `ERest` → `group()` → `API` → `registerTyped`/`register` 的 handler `ctx` 全程透传。涉及：

- `ERest.group()` 返回的 `IGroup<T, Raw>` 加 `State`（`src/lib/index.ts`）
- `API<T, Raw>` 加 `State`，`register`/`registerTyped` 的 handler ctx 类型用 `Context<State>`（`src/lib/api.ts`）
- `FrameworkAdapter<T>` 的 `Middleware` 用 `Middleware<State>`——但 adapter 接口本身不感知 State（adapter 装配的 `nativeMiddleware` 构造 `stdCtx` 时 `state: {}`，运行时不变，仅类型层收紧）

### 2.5 消费侧用法（one-api 验证）

```ts
// one-api: api/instance.ts
interface AppState {
  currentToken?: CurrentToken;
  currentUser?: CurrentAdmin;
}
export const api = createERest<AppState>({ info: API_INFO, groups: GROUPS, forceGroup: true });

// hooks.ts — 注入（类型安全，satisfies 校验 shape）
ctx.state.currentToken = { id, name, permissions } satisfies CurrentToken;

// auth.ts / handlers — 取回（类型安全，无 as）
const user = ctx.state.currentUser; // CurrentAdmin | undefined
```

---

## §3 — 改进 2：全局 response envelope + registerTyped 强制 return

### 3.1 新增 enveloper 注册 API

```ts
// src/lib/index.ts —— ERest 新方法
public setResponseEnvelopers(envelopers: {
  success: (data: unknown, ctx: Context) => unknown;
  error: (err: unknown, ctx: Context) => { body: unknown; status: number };
}): void;
```

- `success`：handler return 的 data → 响应体（如 `data => ({ success: true, data })`）
- `error`：抛出的错误 → `{ body, status }`（如 `e => ({ body: { success: false, error: { code, message } }, status: e.statusCode })`）

内部存到 `apiInfo.successEnveloper` / `errorEnveloper`。

### 3.2 registerTyped handler 改为 return data

当**已注册 success enveloper**时，`registerTyped` 的 handler 进入「return 模式」：

```ts
// 当前（v3.1）
registerTyped({ body: Schema }, async (req, reply) => {
  reply.json(ok(await engine().create(req.params.table, req.body)));
});

// 改进后
registerTyped({ body: Schema, response: VoSchema }, async (req) => {
  return engine().create(req.params.table, req.body);  // return data，框架自动包信封
});
```

handler 签名变为 `(req, ctx) => data | Promise<data>`：

- `req`：分层校验后的参数（params/query/body/headers，与 §2 改进无关，沿用 v3.1）
- `ctx`：即 §2 的 `Context<State>`——读 `ctx.state.currentUser`（类型安全，改进 1 的产物）/ 注入日志等

> enveloper 模式下不再暴露 `reply` 给 registerTyped（handler 只产出 data，由框架写入）。需要原生响应能力（setCookie/redirect/stream）时退回 `register`（配合 v3.1 的 `reply.raw` 逃生舱）。

**dispatcher 改动**（`adapters/utils.ts` 的 `compose` 或各 adapter 的 `nativeMiddleware`）：

1. handler 返回值 `result` → `successEnveloper(result, ctx)` → `reply.json(wrapped)` + `reply.status(default)`
2. handler 抛错 / 链中任意抛错 → dispatcher catch → `errorEnveloper(err, ctx)` → `reply.json(body).status(status)`

### 3.3 错误信封接管 app 级中间件

enveloper 模式下，错误由 dispatcher 内部 catch + `errorEnveloper` 统一包装，**不再依赖 app 级错误中间件写信封**。one-api 的 `app.ts` 错误中间件可大幅简化（仅保留兜底 log，信封逻辑下沉到框架）。

> 注意：dispatcher catch 仍需 re-throw 给 app 级中间件的场景（非 enveloper 模式，向后兼容）保留。即「注册了 errorEnveloper → dispatcher 内部消费；未注册 → re-throw（v3.1 现状不变）」。

### 3.4 setFormatOutput（测试）复用 success enveloper

`setFormatOutput` 当前独立设。改进后：若设了 successEnveloper，测试的 `formatOutputReverse` 默认从 successEnveloper 反推（one-api 的 `applyEnvelopeFormat` 整个文件删除）。

具体：`formatOutputReverse` 默认行为改为「用 successEnveloper 的逆——已知响应体是 `enveloper(data)` 形态，从中取回 data」。one-api 不再需要手写 `format.ts`。

### 3.5 向后兼容（硬约束）

- **未注册 enveloper**：`registerTyped` handler 仍可用 `reply`（v3.1 现状，存量用户不破）
- **注册了 enveloper**：handler 必须 return，调 reply 在类型层被禁止（签名不带 reply）

### 3.6 消费侧用法（one-api 验证）

```ts
// one-api: app/instance 装配处
api.setResponseEnvelopers({
  success: (data) => ({ success: true, data }),
  error: (e: unknown) => {
    const err = e as AppError;
    return {
      body: { success: false, error: { code: err.code ?? 'INTERNAL_ERROR', message: err.message } },
      status: err.statusCode ?? 500,
    };
  },
});

// handler 全部改为 return
admin.get('/tokens').registerTyped({ response: z.array(TokenVO) }, async () => store.list());
```

---

## §4 — 改进 3：便利 schema 别名 + 测试返回类型推导

### 4.1 语义化 schema 别名

erest 已 re-export `z`（`src/lib/index.ts`）。Zod 4 提供顶层函数形式（如 `z.strictObject(shape)`，见 Zod 4 `schemas.ts`），故可直接挂顶层工厂函数 `z.anyObject()`，与 Zod 4 自身风格一致：

```ts
// src/lib/params.ts（erest 内部）
import { z } from "zod";

/** 接受任意键值的对象（动态字段 body 用）：等价 z.object({}).catchall(z.unknown()) */
export const anyObject = () => z.object({}).catchall(z.unknown());

// src/lib/index.ts re-export
import { anyObject as _anyObject } from "./params.js";
// 挂到 z 命名空间（z 是值，可扩展属性）
(z as { anyObject?: typeof _anyObject }).anyObject = _anyObject;
// 同时独立具名导出（供 import { zAnyObject } 用）
export const zAnyObject = _anyObject();
```

> 落地选择「挂到 z + 独立导出常量」双轨：`z.anyObject()` 用法直观（与 `z.object()` 风格一致）；`zAnyObject` 常量避免每次调用工厂。消费侧按偏好选用。

消费侧：

```ts
// one-api: data.ts（替换 z.object({}).catchall(z.unknown())）
registerTyped(
  { params: TableParam, body: z.anyObject() },
  async (req) => engine().create(req.params.table, req.body),
);
```

### 4.2 测试返回类型从 response schema 推导

```ts
// src/lib/agent.ts + api.ts
// registerTyped 声明了 response schema 时：
admin.get('/tokens').registerTyped(
  { response: z.array(TokenVO) },
  async () => store.list(),
);

// 测试里 success() 返回类型自动推导
const list = await session().get('/admin/tokens').success();
//    ^? TokenVO[]  （告别 as 断言）
```

实现要点：

- `registerTyped` 已有 `TResponse` 泛型（`src/lib/api.ts:336`），需把它透传到 `API` 实例的 `options.responseType`（运行时占位，仅类型层用）
- `TestAgent` 的 `success<T>(): Promise<T>` 增加泛型，`IAPITest.buildTest` 在 `findApi` 后从 `api.options.responseType` 推导 T 并传入 TestAgent
- **未声明 response schema** 时 `success()` 返回 `Promise<unknown>`（向后兼容，one-api 老测试不破）

> 注：测试返回类型推导依赖 `findApi` 返回的 API 实例携带 responseType。`findApi` 当前返回 `API | undefined`（`src/lib/extend/test.ts:140`），类型链可串通。

---

## §5 — one-api 同步适配清单（验证）

| 文件 | 改动 |
|---|---|
| `api/instance.ts` | `createERest<AppState>()` 声明 state 类型；注册 `setResponseEnvelopers` |
| `api/format.ts` | **删除**（success enveloper 接管测试格式化） |
| `utils/response.ts` | **删除** `ok()/fail()`（enveloper 接管） |
| `hooks.ts` | `ctx.state['x'] = ... satisfies T` → `ctx.state.x = ...` |
| `routes/*.ts` | 全量 `reply.json(ok(x))` → `return x`；`ctx.state['x'] as T` → `ctx.state.x`；`z.object({}).catchall(z.unknown())` → `z.anyObject()` |
| `routes/auth.ts` | `/me`、`/password` 的 `register` + 手写 `z.parse(ctx.body)` 改回 `registerTyped`（enveloper 模式下 handler 拿 ctx 读 state，body 校验回归框架） |
| `app.ts` | 错误中间件简化（errorEnveloper 接管信封，仅留兜底 log） |
| `__tests__/*.test.ts` | 声明 response schema 的 API，`success()` 去 `as` 断言 |

---

## §6 — 风险与边界

### 向后兼容（硬约束）

1. **State 默认 `Record<string, unknown>`**：`new ERest()` / `createERest()` 不传时行为不变
2. **未注册 enveloper 时**：`registerTyped` 维持 v3.1 的 `(req, reply)` 签名与 reply 写响应行为
3. **未声明 response schema 时**：`success()` 返回 `Promise<unknown>`
4. **breaking change 登记 MIGRATION.md**（符合 erest AGENTS.md §约定 5）：注册了 enveloper 后，registerTyped handler 签名从 `(req, reply)` 变为 `(req, ctx)` 且必须 return

### 不在本次范围

- **校验时机**（before 钩子拿校验值，原痛点 2）：不改 handler chain 顺序。one-api 的 `checkPermission` 在 enveloper 模式下改为从 `ctx.state` 或 `req.params`（enveloper 模式下 handler 拿得到校验后的 req，但 before 仍在校验前——`checkPermission` 这类 before 钩子继续读 `ctx.params` 原始值，one-api 侧已用 `opts.tableKey` 从 params 取，可接受）。如后续确需，另开 spec 做「分层校验钩子」。
- **register 与 registerTyped 风格统一**（原痛点 5）：不动 register 签名，保持双轨。

### 测试与验收

- erest 侧：单测覆盖①State 类型透传（消费侧 typecheck 通过）②enveloper 包装成功/错误③z.anyObject 语义④response schema → 测试返回类型
- one-api 侧：phase2 e2e 全绿（`pnpm --filter @1api/server test`）作为集成验证
- `pnpm -r typecheck` + `pnpm lint` 全绿

---

## §7 — 实现顺序（供 plan 阶段参考）

1. **改进 3（便利 schema + 测试返回类型）**：最小、最独立，先落地
2. **改进 1（typed state）**：泛型透传，纯类型层改动（运行时几乎不变）
3. **改进 2（envelope + return）**：改动面最大（dispatcher + handler 签名），放最后
4. **one-api 同步适配**：每块 erest 改完即适配验证

每块独立 commit，改进 2 拆为「enveloper 注册 + dispatcher 接入」+「测试 formatOutput 复用」两个子提交。
