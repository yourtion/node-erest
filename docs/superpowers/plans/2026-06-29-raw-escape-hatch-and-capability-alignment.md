# raw 逃生舱（reply.raw）+ 框架能力对齐 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 registerTyped handler 增加 `reply.raw` 逃生舱，通过框架泛型在构造时锁定原生对象类型；并提供可选统一错误格式器。

**Architecture:** `Reply` 接口加泛型 `Reply<Raw>` 与 `raw` 字段；`ERest<T, Raw>` / `API<T, Raw>` / `IGroup<T, Raw>` 透传 Raw 维度；三框架 adapter 在 `createXxxReply` 时把原生对象塞进 `raw`（热路径零分配，仅多挂一个已有闭包变量的引用）；子包新增 `createERest()` 工厂在构造时锁定 Raw。

**Tech Stack:** TypeScript 5、Zod 4、vitest、Express 5 / Koa 3 / @leizm/web 2

**关联 spec:** `docs/superpowers/specs/2026-06-29-raw-escape-hatch-and-capability-alignment.md`

---

## 文件结构

**核心库（src/lib/）：**
- `adapters/types.ts` — 修改：`Reply<Raw>` 加 raw 字段；`FrameworkAdapter<T, Raw>` 加 Raw 维度；`Context.reply` 类型标注
- `error.ts` — 修改：新增 `ErrorFormatter` 接口与 `defaultErrorFormatter` 导出
- `api.ts` — 修改：`API<T>` → `API<T, Raw>`；`registerTyped` handler reply 类型用 `Reply<Raw>`
- `index.ts` — 修改：`ERest<T>` → `ERest<T, Raw>`；`IGroup<T>` → `IGroup<T, Raw>`；`group()` 透传 Raw

**子包（packages/erest-*/src/index.ts）：** 三个均修改
- 导出 `XxxRaw` 类型别名
- `createXxxReply` 塞 `raw` 值
- 新增并导出 `createERest()` 工厂

**测试（src/test/）：**
- `test-raw.ts` — 新建：raw 运行时集成测试（三框架 setCookie）
- `test-builder-types.ts` — 修改：增加 reply.raw 类型推导测试

---

## Task 1: Reply 接口加泛型与 raw 字段

**Files:**
- Modify: `src/lib/adapters/types.ts:60-79`（Reply 接口）、`:25-58`（FrameworkAdapter 接口）、`:90-124`（Context 接口的 reply 字段）

- [ ] **Step 1: 修改 Reply 接口，加 Raw 泛型与 raw 字段**

将 `src/lib/adapters/types.ts` 中 Reply 接口（72-79 行）替换为：

```ts
/**
 * 框架无关的响应接口。
 *
 * 由各 adapter 注入到请求对象（`$reply`），让 registerTyped 的 handler 用统一的
 * `reply.json()/status()` 写响应，从而与具体框架解耦——同一份 handler 可被
 * Express / Koa / @leizm/web 三个框架复用。
 *
 * `raw` 是逃生舱：当需要框架特有能力（setCookie/redirect/stream/文件下载等）时，
 * 通过 `reply.raw` 访问框架原生对象。类型由 `ERest<T, Raw>` 的 Raw 泛型驱动，
 * 经子包 `createERest()` 工厂在构造时锁定。
 */
export interface Reply<Raw = unknown> {
  /** 设置 HTTP 状态码并返回自身，支持链式调用 */
  status(code: number): this;
  /** 以 JSON 写入响应体 */
  json(body: unknown): void;
  /** 以纯文本写入响应体 */
  send(body: string): void;
  /** 框架原生对象逃生舱（setCookie/redirect/stream/文件下载等） */
  readonly raw: Raw;
}
```

- [ ] **Step 2: FrameworkAdapter 接口加 Raw 泛型维度**

将 `FrameworkAdapter`（25-58 行）的签名与方法内的 `T` 引用保留，仅给接口加第二个泛型参数。把第 25 行：

```ts
export interface FrameworkAdapter<T = unknown> {
```

改为：

```ts
export interface FrameworkAdapter<T = unknown, Raw = unknown> {
```

接口体内其它方法签名（`makeParamsChecker`/`bindRoute` 等）**不改**——它们只依赖 `T`，Raw 由 adapter 实现类通过 `implements FrameworkAdapter<T, ExpressRaw>` 声明，不进方法签名。

- [ ] **Step 3: Context.reply 类型标注为 Reply<unknown>**

将 Context 接口中（105-106 行）：

```ts
  /** 框架无关响应接口（复用 Reply；中间件可提前响应/终止） */
  readonly reply: Reply;
```

改为：

```ts
  /** 框架无关响应接口（复用 Reply；中间件可提前响应/终止） */
  readonly reply: Reply<unknown>;
```

> Context 是框架无关的核心抽象，before/middleware/hook 不暴露 raw（spec §3.1）。reply 字段类型为 `Reply<unknown>`，仅 registerTyped 的 handler 通过类泛型 Raw 拿到强类型 reply。

- [ ] **Step 4: 运行类型检查，确认无破坏**

Run: `npx tsc --noEmit`
Expected: 编译通过（reply.raw 此时还是 unknown，三框架 createReply 还没塞值，但接口已含 raw 字段，已构造的 reply 对象字面量缺 raw 会报错——这些在 Task 4 修复；若此处报错，先确认错误都来自三框架的 createXxxReply 函数，属于预期）

> 若 tsc 报 `Property 'raw' is missing in type ...` 指向 `packages/erest-*/src/index.ts` 的 createXxxReply，这是预期的——Task 4 会修复。把这类错误记录下来，确保 Task 4 全部覆盖。

- [ ] **Step 5: Commit**

```bash
git add src/lib/adapters/types.ts
git commit -m "feat(types): Reply 加 Raw 泛型与 raw 逃生舱字段

- Reply<Raw> 接口新增 readonly raw 字段
- FrameworkAdapter<T, Raw> 加 Raw 维度（方法签名不变）
- Context.reply 标注 Reply<unknown>（before/middleware 不暴露 raw）"
```

---

## Task 2: API 类透传 Raw 泛型

**Files:**
- Modify: `src/lib/api.ts:9`（import）、`:72`（class API）、`:316-338`（registerTyped handler 类型）

- [ ] **Step 1: import 处补 Reply 的泛型用法说明（无需改 import）**

`src/lib/api.ts:9` 已是 `import type { Middleware, Reply } from "./adapters/types.js";`，Reply 现在是泛型，import 不变。无需改动此行。

- [ ] **Step 2: API 类加 Raw 泛型维度**

将 `src/lib/api.ts:72`：

```ts
class API<T = DEFAULT_HANDLER> {
```

改为：

```ts
class API<T = DEFAULT_HANDLER, Raw = unknown> {
```

- [ ] **Step 3: registerTyped handler 的 reply 类型用 Reply<Raw>**

将 `src/lib/api.ts:330-338` 的 handler 参数类型中的 `reply: Reply`：

```ts
    handler: (
      req: {
        query: z.infer<z.ZodObject<TQuery>>;
        body: z.infer<z.ZodObject<TBody>>;
        params: z.infer<z.ZodObject<TParams>>;
        headers: z.infer<z.ZodObject<THeaders>>;
      },
      reply: Reply
    ) => z.infer<TResponse> | Promise<z.infer<TResponse>> | void | Promise<void>
```

改为（仅 `reply: Reply` → `reply: Reply<Raw>`）：

```ts
    handler: (
      req: {
        query: z.infer<z.ZodObject<TQuery>>;
        body: z.infer<z.ZodObject<TBody>>;
        params: z.infer<z.ZodObject<TParams>>;
        headers: z.infer<z.ZodObject<THeaders>>;
      },
      reply: Reply<Raw>
    ) => z.infer<TResponse> | Promise<z.infer<TResponse>> | void | Promise<void>
```

> 关键：`registerTyped` 现有的 `TQuery/TBody/TParams/THeaders/TResponse` 5 个方法级泛型**完全不变**。Raw 是类级泛型，从 `API<T, Raw>` 透传到 handler 的 reply 类型，两者正交。

- [ ] **Step 4: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: 编译通过（API 类的其它方法如 `init(parent: ERest<unknown>)` 不涉及 Raw，无需改；registerTyped 内部 `wrappedHandler` 用的是 `ctx.reply` 即 `Reply<unknown>`，运行时无影响）

- [ ] **Step 5: 运行现有测试确认无回归**

Run: `npm run test:lib`
Expected: 全部通过（reply.raw 在运行时此时还是 undefined，但现有测试不访问 raw，不受影响）

- [ ] **Step 6: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat(api): API<T, Raw> 透传 Raw，registerTyped reply 类型用 Reply<Raw>

类级加 Raw 泛型维度（默认 unknown），透传到 registerTyped handler 的 reply。
现有 5 个方法级 Zod 泛型不变，Raw 与之正交。"
```

---

## Task 3: ERest 类与 IGroup 透传 Raw 泛型

**Files:**
- Modify: `src/lib/index.ts:36-43`（IGroup）、`:46-54`（IApiInfo）、`:124`（class ERest）、`:315-334`（registAPI）、`:463-485`（group）

- [ ] **Step 1: IGroup 接口加 Raw 维度**

将 `src/lib/index.ts:39-43`：

```ts
export interface IGroup<T> extends Record<string, unknown>, genSchema<T> {
  define: (opt: APIDefine<T>) => API<T>;
  before: (...fn: T[]) => IGroup<T>;
  middleware: (...fn: T[]) => IGroup<T>;
}
```

改为：

```ts
export interface IGroup<T, Raw = unknown> extends Record<string, unknown>, genSchema<T> {
  define: (opt: APIDefine<T>) => API<T, Raw>;
  before: (...fn: T[]) => IGroup<T, Raw>;
  middleware: (...fn: T[]) => IGroup<T, Raw>;
}
```

> `genSchema<T>` 返回 `(path) => API<T>`，API 现在是 `API<T, Raw>`。需要同步更新 `genSchema` 定义（`:36`）。

- [ ] **Step 2: genSchema 类型加 Raw 维度**

将 `src/lib/index.ts:36`：

```ts
export type genSchema<T> = Readonly<ISupportMethds<(path: string) => API<T>>>;
```

改为：

```ts
export type genSchema<T, Raw = unknown> = Readonly<ISupportMethds<(path: string) => API<T, Raw>>>;
```

- [ ] **Step 3: IApiInfo 接口加 Raw 维度**

将 `src/lib/index.ts:46-54`：

```ts
export interface IApiInfo<T> extends Record<string, unknown>, genSchema<T> {
  readonly $apis: Map<string, API<T>>;
  define: (opt: APIDefine<T>) => API<T>;
  beforeHooks: Set<T>;
  afterHooks: Set<T>;
  docs?: IAPIDoc;
  formatOutputReverse?: (out: unknown) => [Error | null, unknown];
  docOutputFormat?: (out: unknown) => unknown;
}
```

改为：

```ts
export interface IApiInfo<T, Raw = unknown> extends Record<string, unknown>, genSchema<T, Raw> {
  readonly $apis: Map<string, API<T, Raw>>;
  define: (opt: APIDefine<T>) => API<T, Raw>;
  beforeHooks: Set<T>;
  afterHooks: Set<T>;
  docs?: IAPIDoc;
  formatOutputReverse?: (out: unknown) => [Error | null, unknown];
  docOutputFormat?: (out: unknown) => unknown;
}
```

- [ ] **Step 4: ERest 类加 Raw 维度**

将 `src/lib/index.ts:124`：

```ts
class ERest<T = DEFAULT_HANDLER> {
```

改为：

```ts
class ERest<T = DEFAULT_HANDLER, Raw = unknown> {
```

- [ ] **Step 5: registAPI 内 new API 加 Raw 透传**

将 `src/lib/index.ts:322`：

```ts
      const s = new API<T>(method, path, getCallerSourceLine(this.config.path), group, prefix);
```

改为：

```ts
      const s = new API<T, Raw>(method, path, getCallerSourceLine(this.config.path), group, prefix);
```

- [ ] **Step 6: group() 方法返回类型加 Raw**

将 `src/lib/index.ts:463-465`（group 方法的两个重载签名 + 实现）：

```ts
  public group(name: string, info?: IGroupInfoOpt): IGroup<T>;
  public group(name: string, desc?: string): IGroup<T>;
  public group(name: string, infoOrDesc?: IGroupInfoOpt | string): IGroup<T> {
```

改为：

```ts
  public group(name: string, info?: IGroupInfoOpt): IGroup<T, Raw>;
  public group(name: string, desc?: string): IGroup<T, Raw>;
  public group(name: string, infoOrDesc?: IGroupInfoOpt | string): IGroup<T, Raw> {
```

> 实现体内 `this.apiInfo` 的 `get/post/...` 方法返回的是 `API<T>`（无 Raw），但 IGroup 要求 `API<T, Raw>`。由于 `API<T>` 等价于 `API<T, unknown>`，且 group 返回的 IGroup 其 get/post 来自 `genSchema<T, Raw>`——这里 apiInfo 的方法（`this.apiInfo.get`）返回 `API<T>`，需确认类型兼容。见下一步处理 apiInfo。

- [ ] **Step 7: apiInfo 字段类型用 Raw，构造时 get/post 等 new API 透传 Raw**

apiInfo 的类型声明（找到 `private apiInfo: IApiInfo<T>;`，约 `:143`），改为：

```ts
  private apiInfo: IApiInfo<T, Raw>;
```

构造函数中 apiInfo 初始化（`:351-361`）的 `get/post/...` 回调里调用 `this.registAPI(...)` 返回 `API<T, Raw>`，已匹配。`define` 回调返回 `this.defineAPI(...)` 返回 `API<T, Raw>`，已匹配。**无需改构造体内容**，只改类型声明。

- [ ] **Step 8: group() 实现体返回的 groupInfo 对象类型**

group() 实现体内（`:470` 附近）构造并返回一个 IGroup 对象字面量，其 `get/post/...` 引用 `this.apiInfo.get` 等。由于 apiInfo 现在是 `IApiInfo<T, Raw>`，其方法返回 `API<T, Raw>`，与 IGroup<T, Raw> 要求一致。

检查返回对象字面量（`:475-490` 附近，含 `define`/`get`/`post`/`before`/`middleware`）。若 `before`/`middleware` 实现返回 `this` 或重建 IGroup，需确保返回类型为 `IGroup<T, Raw>`。运行 tsc 定位具体报错点，按报错补类型参数。

- [ ] **Step 9: 运行类型检查并修复剩余报错**

Run: `npx tsc --noEmit`
Expected: 编译通过。若 group() 实现体或其它处报 Raw 缺失，按报错信息补 `<T, Raw>` 类型参数。

- [ ] **Step 10: 运行现有测试确认无回归**

Run: `npm run test:lib`
Expected: 全部通过

- [ ] **Step 11: Commit**

```bash
git add src/lib/index.ts
git commit -m "feat(erest): ERest<T, Raw> / IGroup<T, Raw> 透传 Raw 泛型

- ERest/API/IGroup/IApiInfo/genSchema 全链路加 Raw 维度（默认 unknown）
- group() 返回 IGroup<T, Raw>，registAPI 透传 Raw
- 现有 new ERest() 行为不变（Raw 默认 unknown）"
```

---

## Task 4: 错误格式器（defaultErrorFormatter）

**Files:**
- Modify: `src/lib/error.ts`（末尾追加）
- Test: `src/test/test-error-formatter.ts`（新建）

- [ ] **Step 1: 新建测试文件 test-error-formatter.ts，写失败测试**

创建 `src/test/test-error-formatter.ts`：

```ts
/**
 * @file defaultErrorFormatter 测试
 * 验证错误格式器对 ERestError / 普通 Error 输出一致的 {status, body} 结构
 */
import { describe, expect, it } from "vitest";
import { ERestError, defaultErrorFormatter } from "../lib/error.js";

describe("defaultErrorFormatter", () => {
  it("ERestError 输出 statusCode 与 code/message body", () => {
    const err = new ERestError("AUTH_REQUIRED", "未登录", undefined, 401);
    const out = defaultErrorFormatter(err);
    expect(out.status).toBe(401);
    expect(out.body).toEqual({ error: "未登录", code: "AUTH_REQUIRED" });
  });

  it("ERestError 默认 statusCode 400", () => {
    const err = new ERestError("VALIDATION_ERROR", "校验失败");
    const out = defaultErrorFormatter(err);
    expect(out.status).toBe(400);
    expect(out.body).toEqual({ error: "校验失败", code: "VALIDATION_ERROR" });
  });

  it("普通 Error 退化为 400 + INTERNAL_ERROR", () => {
    const err = new Error("boom");
    const out = defaultErrorFormatter(err);
    expect(out.status).toBe(400);
    expect(out.body).toEqual({ error: "boom", code: "INTERNAL_ERROR" });
  });

  it("带 status 属性的 Error 取 status", () => {
    const err = Object.assign(new Error("forbidden"), { status: 403 });
    const out = defaultErrorFormatter(err);
    expect(out.status).toBe(403);
    expect(out.body).toEqual({ error: "forbidden", code: "INTERNAL_ERROR" });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:lib -- test-error-formatter`
Expected: FAIL，报 `defaultErrorFormatter is not exported` 或 `does not provide an export named 'defaultErrorFormatter'`

- [ ] **Step 3: 在 error.ts 末尾实现 ErrorFormatter 与 defaultErrorFormatter**

在 `src/lib/error.ts` 文件**末尾**追加：

```ts
/**
 * 错误响应格式器：把任意错误归一化为 { status, body } 结构。
 *
 * 用户在 app 级错误中间件中调用（三框架一行替换），实现跨框架统一的错误响应体。
 * 不由 adapter 内置——adapter 只做桥接，错误响应格式由用户在 app 级决定。
 *
 * @example
 * // Express
 * app.use((err, _req, res, _next) => {
 *   const { status, body } = defaultErrorFormatter(err);
 *   res.status(status).json(body);
 * });
 */
export interface ErrorFormatter {
  (err: ERestError | Error): { status: number; body: unknown };
}

/** 内置默认格式器（与 examples 错误中间件一致），可直接用或自定义 */
export const defaultErrorFormatter: ErrorFormatter = (err) => {
  const e = err as ERestError & { status?: number };
  const status = e.statusCode || e.status || 400;
  return {
    status,
    body: {
      error: err.message,
      code: e.code ?? "INTERNAL_ERROR",
    },
  };
};
```

> 注意 `e.code ?? "INTERNAL_ERROR"`：普通 Error 没有 code 属性，`e.code` 为 undefined，用 nullish 合并退化为 "INTERNAL_ERROR"。ERestError 的 code 是 `ERestErrorCode` 字符串字面量，正常透传。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test:lib -- test-error-formatter`
Expected: 4 个用例全部 PASS

- [ ] **Step 5: 确认 defaultErrorFormatter 从核心包导出**

检查 `src/lib/index.ts` 末尾的 re-export。确认 `error.ts` 的导出是否已被 re-export（搜索 `export.*from.*error`）。若没有，在 index.ts 的 re-export 区（ERestError 等导出处）追加：

```ts
export { defaultErrorFormatter, type ErrorFormatter } from "./error.js";
```

> 先搜索确认现有 ERestError 是如何导出的——若 index.ts 用 `export * from "./error.js"` 或具名导出，按相同方式补 defaultErrorFormatter。

Run: `npx tsc --noEmit` 确认无报错。

- [ ] **Step 6: Commit**

```bash
git add src/lib/error.ts src/test/test-error-formatter.ts src/lib/index.ts
git commit -m "feat(error): 新增可选 defaultErrorFormatter 错误格式器

工具函数，用户在 app 级错误中间件调用，实现三框架统一错误响应体。
不改 adapter、不破坏 re-throw 对齐（commit 727b2c0）。"
```

---

## Task 5: Express adapter 塞 raw + 导出 ExpressRaw + createERest 工厂

**Files:**
- Modify: `packages/erest-express/src/index.ts`（import、createExpressReply、导出）
- Test: `src/test/test-raw.ts`（新建，本 task 先写 Express 部分）

- [ ] **Step 1: 新建测试 test-raw.ts，写 Express setCookie 失败测试**

创建 `src/test/test-raw.ts`：

```ts
/**
 * @file reply.raw 逃生舱集成测试
 * 验证三框架 handler 通过 reply.raw 访问原生对象（以 setCookie 为例）
 */
import express from "express";
import Koa from "koa";
import bodyParser from "koa-bodyparser";
import KoaRouter from "koa-router";
import { Application, component, Router } from "@leizm/web";
import { expressAdapter, koaAdapter, leizmwebAdapter } from "./adapters";
import { httpReq as request } from "./http-req";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import lib from "./lib";

// ---------------- Express ----------------
describe("reply.raw - Express 集成", () => {
  const app = express();
  app.use(express.json());

  const apiService = lib({ basePath: "" });
  apiService.api
    .post("/login")
    .group("Index")
    .title("login-express")
    .registerTyped({ body: z.object({ user: z.string() }) }, (_req, reply) => {
      // reply.raw 在 Express 下为 { req, res }，通过 res.cookie 设置 cookie
      const res = (reply as any).raw.res;
      res.cookie("token", "abc-123", { httpOnly: true });
      reply.json({ ok: true });
    });

  apiService.bind({ adapter: expressAdapter, router: app });

  it("handler 能通过 reply.raw.res.cookie 设置 Set-Cookie 响应头", async () => {
    const res = await request(app).post("/login").send({ user: "Tom" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const setCookie = res.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    expect(String(setCookie)).toContain("token=abc-123");
    expect(String(setCookie)).toContain("HttpOnly");
  });
});

afterAll(() => {});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:lib -- test-raw`
Expected: FAIL，`res.headers["set-cookie"]` 为 undefined（reply.raw 此时没被赋值，`res` 是 undefined，cookie 没设置）

- [ ] **Step 3: Express adapter 导出 ExpressRaw 类型**

在 `packages/erest-express/src/index.ts` 顶部 import 区，确认已 import express 类型。若没有，添加：

```ts
import type { Request, Response } from "express";
```

在文件中（class ExpressAdapter 定义之前或之后）添加类型别名与 Reply 导入。先确认顶部 import 行（`:9`）：

```ts
import type { Context, FrameworkAdapter, Middleware, Reply } from "erest";
```

保持不变（Reply 已导入）。在 class 定义前添加：

```ts
/** Express 原生对象类型（reply.raw 在 Express 下为此类型） */
export type ExpressRaw = { req: Request; res: Response };
```

- [ ] **Step 4: ExpressAdapter 类实现加 Raw 维度**

将 class 声明（约 `:19`）：

```ts
export class ExpressAdapter<T = unknown> implements FrameworkAdapter<T> {
```

改为：

```ts
export class ExpressAdapter<T = unknown> implements FrameworkAdapter<T, ExpressRaw> {
```

- [ ] **Step 5: createExpressReply 塞 raw 值**

找到 `createExpressReply` 函数（约 `:133-149`）。当前签名只接收 `res`：

```ts
function createExpressReply(res: unknown): Reply {
  const expressRes = res as { status?: ...; json?: ...; end?: ... };
  const reply: Reply = {
    status(code: number) {
      expressRes.status?.(code);
      return reply;
    },
    json(body: unknown) {
      expressRes.json?.(body);
    },
    // ... send
  };
  return reply;
}
```

改为接收 `req` 和 `res`，返回 `Reply<ExpressRaw>`，并在 reply 对象上挂 raw：

```ts
function createExpressReply(req: unknown, res: unknown): Reply<ExpressRaw> {
  const expressRes = res as { status?: (c: number) => unknown; json?: (b: unknown) => void; end?: (b: string) => void };
  const reply: Reply<ExpressRaw> = {
    status(code: number) {
      expressRes.status?.(code);
      return reply;
    },
    json(body: unknown) {
      expressRes.json?.(body);
    },
    // send 保持原样（从原函数复制，不要遗漏）
    raw: { req, res } as ExpressRaw,
  };
  return reply;
}
```

> **重要**：`send` 方法的实现从原函数完整复制过来，不要丢失。先 Read 原函数确认 send 的确切实现再替换。

- [ ] **Step 6: nativeMiddleware 调用处传 req**

找到 `bindRoute` 内的 `nativeMiddleware`（约 `:73-89`），其中调用 `createExpressReply(res)`（约 `:74`）：

```ts
      const reply: Reply = createExpressReply(res);
```

改为：

```ts
      const reply = createExpressReply(req, res);
```

> `req` 是 nativeMiddleware 的入参（`:73` 的 `req`），闭包本就持有，热路径零分配——仅多挂一个已有引用。

- [ ] **Step 7: 新增 createERest 工厂并导出**

子包是 ESM（package.json `"type": "module"`），必须用静态 import。先在文件顶部 import 区（`:9` 行 `import type { Context, FrameworkAdapter, Middleware, Reply } from "erest";` 之后）添加 ERest 值导入：

```ts
import { ERest } from "erest";
```

然后在文件末尾（`export const expressAdapter` 之后）添加工厂：

```ts
/**
 * 创建绑定 Express 原生类型的 ERest 实例（构造时锁定 Raw 泛型）。
 *
 * 返回的 ERest 实例中，registerTyped handler 的 reply.raw 自动推导为 ExpressRaw，
 * 无需手动标注。等价于 `new ERest<Middleware, ExpressRaw>(options)`。
 *
 * @example
 * import { createERest } from "@erest/express";
 * const api = createERest({ info, groups, forceGroup });
 */
export function createERest(options: ConstructorParameters<typeof ERest>[0]): ERest<Middleware, ExpressRaw> {
  return new ERest<Middleware, ExpressRaw>(options);
}
```

> `Middleware` 类型已在顶部 import 行导入（与 Reply 同行）。

- [ ] **Step 8: 运行测试确认通过**

Run: `npm run test:lib -- test-raw`
Expected: Express 集成用例 PASS（Set-Cookie 头包含 token=abc-123; HttpOnly）

- [ ] **Step 9: 类型检查**

Run: `npx tsc --noEmit`
Expected: 通过

- [ ] **Step 10: Commit**

```bash
git add packages/erest-express/src/index.ts src/test/test-raw.ts
git commit -m "feat(express): reply.raw 塞原生对象 + 导出 ExpressRaw + createERest 工厂

- createExpressReply 接收 req/res，reply.raw = { req, res }
- 导出 ExpressRaw 类型别名
- ExpressAdapter implements FrameworkAdapter<T, ExpressRaw>
- 新增 createERest() 工厂构造时锁定 Raw 泛型"
```

---

## Task 6: Koa adapter 塞 raw + 导出 KoaRaw + createERest 工厂

**Files:**
- Modify: `packages/erest-koa/src/index.ts`

- [ ] **Step 1: 在 test-raw.ts 追加 Koa setCookie 测试**

在 `src/test/test-raw.ts` 的 Express describe 块之后、`afterAll` 之前追加：

```ts
// ---------------- Koa ----------------
describe("reply.raw - Koa 集成", () => {
  it("handler 能通过 reply.raw.cookies.set 设置 Set-Cookie", async () => {
    const app = new Koa();
    app.use(bodyParser());
    app.use(async (ctx, next) => {
      try {
        await next();
      } catch (err: unknown) {
        ctx.status = (err as { statusCode?: number }).statusCode || 400;
        ctx.body = { message: (err as Error).message };
      }
    });

    const apiService = lib({ basePath: "" });
    const router = new KoaRouter();
    apiService.api
      .post("/login")
      .group("Index")
      .title("login-koa")
      .registerTyped({ body: z.object({ user: z.string() }) }, (_req, reply) => {
        // reply.raw 在 Koa 下为原生 ctx
        const ctx = (reply as any).raw;
        ctx.cookies.set("token", "koa-456", { httpOnly: true });
        reply.json({ ok: true });
      });
    apiService.bind({ adapter: koaAdapter, router });
    app.use(router.routes()).use(router.allowedMethods());

    const server = app.listen();
    const res = await request(server).post("/login").send({ user: "Jerry" });
    server.close();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const setCookie = res.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    expect(String(setCookie)).toContain("token=koa-456");
    expect(String(setCookie)).toContain("HttpOnly");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:lib -- test-raw`
Expected: Koa 用例 FAIL（reply.raw 未赋值，ctx.cookies 是 undefined）

- [ ] **Step 3: Koa adapter 导出 KoaRaw 类型 + import Koa Context 类型**

在 `packages/erest-koa/src/index.ts` 顶部 import 区，确认/添加 koa 类型导入：

```ts
import type { Context as KoaContext } from "koa";
```

在 class 定义前添加：

```ts
/** Koa 原生对象类型（reply.raw 在 Koa 下为原生 Context） */
export type KoaRaw = KoaContext;
```

- [ ] **Step 4: KoaAdapter 类加 Raw 维度**

将 class 声明改为：

```ts
export class KoaAdapter<T = unknown> implements FrameworkAdapter<T, KoaRaw> {
```

- [ ] **Step 5: createKoaReply 塞 raw 值**

找到 `createKoaReply`（约 `:133-150`）。当前接收 `ctx`，返回 `Reply`。改为返回 `Reply<KoaRaw>` 并挂 raw：

```ts
function createKoaReply(ctx: Record<string, unknown>): Reply<KoaRaw> {
  const koaCtx = ctx as { status?: number; body?: unknown; type?: string };
  const reply: Reply<KoaRaw> = {
    status(code: number) {
      koaCtx.status = code;
      return reply;
    },
    json(body: unknown) {
      koaCtx.type = "application/json";
      // ... 保持原 json 实现（从原函数复制完整）
    },
    // send 保持原样
    raw: ctx as KoaRaw,
  };
  return reply;
}
```

> **重要**：json 与 send 的实现体从原函数完整复制，不要遗漏任何行。先 Read 原函数。

- [ ] **Step 6: 新增 createERest 工厂**

顶部 import 区添加（确认 `ERest`、`Middleware` 已从 erest 导入）：

```ts
import { ERest, type Middleware } from "erest";
```

文件末尾追加：

```ts
/**
 * 创建绑定 Koa 原生类型的 ERest 实例（构造时锁定 Raw 泛型）。
 * handler 的 reply.raw 自动推导为 KoaRaw（原生 Context）。
 */
export function createERest(options: ConstructorParameters<typeof ERest>[0]): ERest<Middleware, KoaRaw> {
  return new ERest<Middleware, KoaRaw>(options);
}
```

- [ ] **Step 7: 运行测试确认通过**

Run: `npm run test:lib -- test-raw`
Expected: Koa 用例 PASS

- [ ] **Step 8: 类型检查**

Run: `npx tsc --noEmit`
Expected: 通过

- [ ] **Step 9: Commit**

```bash
git add packages/erest-koa/src/index.ts src/test/test-raw.ts
git commit -m "feat(koa): reply.raw 塞原生 ctx + 导出 KoaRaw + createERest 工厂"
```

---

## Task 7: leizmweb adapter 塞 raw + 导出 LeizmWebRaw + createERest 工厂

**Files:**
- Modify: `packages/erest-leizmweb/src/index.ts`

- [ ] **Step 1: 在 test-raw.ts 追加 leizmweb setCookie 测试**

在 `src/test/test-raw.ts` 的 Koa describe 块之后追加：

```ts
// ---------------- @leizm/web ----------------
describe("reply.raw - @leizm/web 集成", () => {
  it("handler 能通过 reply.raw.response 设置响应（raw 逃生舱可用）", async () => {
    const app = new Application();
    app.use("/", component.bodyParser.json());

    const apiService = lib({ basePath: "" });
    const router = new Router();
    apiService.api
      .post("/login")
      .group("Index")
      .title("login-lei")
      .registerTyped({ body: z.object({ user: z.string() }) }, (_req, reply) => {
        // reply.raw 在 @leizm/web 下为原生 ctx；验证 raw 逃生舱可访问原生对象
        const raw = (reply as any).raw;
        // 设置自定义响应头作为 raw 可用性的证明（leizmweb cookie API 随版本变化，用 header 更稳）
        raw.response.set("X-Raw-Test", "leizmweb");
        reply.json({ ok: true });
      });
    apiService.bind({ adapter: leizmwebAdapter, router });
    app.use("/", router);

    const res = await request(app.server).post("/login").send({ user: "Anna" });
    app.server.close();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    // 验证 raw 设置的自定义头生效
    expect(res.headers["x-raw-test"]).toBe("leizmweb");
  });
});
```

> leizmweb 的 cookie API 因版本差异签名不统一，改用设置自定义响应头 `X-Raw-Test` 作为「raw 逃生舱可用」的稳定证明（spec §2.1 速查表也用 header 类操作）。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:lib -- test-raw`
Expected: leizmweb 用例 FAIL（reply.raw 未赋值，raw.response 是 undefined）

- [ ] **Step 3: leizmweb adapter 导出 LeizmWebRaw 类型**

在 `packages/erest-leizmweb/src/index.ts` 顶部 import 区确认/添加：

```ts
import type { Context as LeiContext } from "@leizm/web";
```

> 若 `@leizm/web` 未直接导出 Context 类型，用 `unknown` 兜底并注释说明，类型别名为 `LeiContext | unknown`。先尝试 import，失败则降级。

class 定义前添加：

```ts
/** @leizm/web 原生对象类型（reply.raw 在 @leizm/web 下为原生 Context） */
export type LeizmWebRaw = LeiContext;
```

- [ ] **Step 4: LeizmWebAdapter 类加 Raw 维度**

将 class 声明改为：

```ts
export class LeizmWebAdapter<T = unknown> implements FrameworkAdapter<T, LeizmWebRaw> {
```

- [ ] **Step 5: createLeiReply 塞 raw 值**

找到 `createLeiReply`（约 `:131-151`）。当前接收 `ctx`，返回 `Reply`。改为返回 `Reply<LeizmWebRaw>` 并挂 raw：

```ts
function createLeiReply(ctx: Record<string, unknown>): Reply<LeizmWebRaw> {
  const leiRes = (ctx.response ?? {}) as {
    status?: (c: number) => unknown;
    json?: (b: unknown) => void;
    // send 保持原样
  };
  const reply: Reply<LeizmWebRaw> = {
    status(code: number) {
      leiRes.status?.(code);
      return reply;
    },
    json(body: unknown) {
      leiRes.json?.(body);
    },
    // send 保持原样（从原函数复制）
    raw: ctx as LeizmWebRaw,
  };
  return reply;
}
```

> **重要**：完整复制原函数的 json/send 实现体，先 Read 原函数。

- [ ] **Step 6: 新增 createERest 工厂**

顶部 import 区确认/添加：

```ts
import { ERest, type Middleware } from "erest";
```

文件末尾追加：

```ts
/**
 * 创建绑定 @leizm/web 原生类型的 ERest 实例（构造时锁定 Raw 泛型）。
 * handler 的 reply.raw 自动推导为 LeizmWebRaw（原生 Context）。
 */
export function createERest(options: ConstructorParameters<typeof ERest>[0]): ERest<Middleware, LeizmWebRaw> {
  return new ERest<Middleware, LeizmWebRaw>(options);
}
```

- [ ] **Step 7: 运行测试确认通过**

Run: `npm run test:lib -- test-raw`
Expected: leizmweb 用例 PASS

- [ ] **Step 8: 类型检查**

Run: `npx tsc --noEmit`
Expected: 通过

- [ ] **Step 9: Commit**

```bash
git add packages/erest-leizmweb/src/index.ts src/test/test-raw.ts
git commit -m "feat(leizmweb): reply.raw 塞原生 ctx + 导出 LeizmWebRaw + createERest 工厂"
```

---

## Task 8: 类型推导测试 + 全量回归 + 文档速查表

**Files:**
- Modify: `src/test/test-builder-types.ts`（追加 reply.raw 类型推导用例）
- Verify: 三框架 raw 测试 + 现有全量测试
- Docs: README 或 docs 新增框架原生能力速查表（spec §2.1）

- [ ] **Step 1: 在 test-builder-types.ts 追加 reply.raw 类型推导测试**

在 `src/test/test-builder-types.ts` 的现有 describe 块内追加一个 test：

```ts
  test("new ERest() 时 reply.raw 为 unknown（默认 Raw）", () => {
    apiService.api
      .post("/raw-unknown")
      .group("Index")
      .registerTyped({ body: z.object({ x: z.number() }) }, (_req, reply) => {
        // 默认 Raw=unknown：reply.raw 类型为 unknown，需断言才能用
        expectTypeOf(reply.raw).toEqualTypeOf<unknown>();
      });
  });
```

- [ ] **Step 2: 运行类型测试**

Run: `npm run test:lib -- test-builder-types`
Expected: PASS（reply.raw 默认 unknown）

- [ ] **Step 3: 新建子包类型推导测试 test-raw-types.ts（验证 createERest 锁定 Raw）**

创建 `src/test/test-raw-types.ts`：

```ts
/**
 * @file reply.raw 框架泛型类型推导测试
 * 验证子包 createERest() 工厂构造时锁定 Raw，handler reply.raw 自动强类型
 */
import express from "express";
import { describe, test, expectTypeOf } from "vitest";
import { ExpressAdapter, createERest as createExpressERest, type ExpressRaw } from "../../packages/erest-express/src/index.js";

describe("createERest 类型锁定", () => {
  test("Express createERest 返回的实例 handler reply.raw 为 ExpressRaw", () => {
    const api = createExpressERest({
      info: { title: "t", version: "1.0.0" },
      groups: { Index: "首页" },
    });
    api
      .post("/raw-typed")
      .group("Index")
      .registerTyped({}, (_req, reply) => {
        // 构造时锁定 Raw=ExpressRaw：reply.raw 自动强类型，零标注
        expectTypeOf(reply.raw).toEqualTypeOf<ExpressRaw>();
        // reply.raw.res 是 Express Response
        expectTypeOf(reply.raw.res).toMatchTypeOf<express.Response>();
      });
  });
});
```

- [ ] **Step 4: 运行类型测试**

Run: `npm run test:lib -- test-raw-types`
Expected: PASS

> 若 `expectTypeOf(reply.raw).toEqualTypeOf<ExpressRaw>()` 失败（raw 可能含 undefined 或为 readonly 导致精确不等），改用 `.toMatchTypeOf<ExpressRaw>()` 宽松匹配。

- [ ] **Step 5: 运行全量核心库测试（确认无回归）**

Run: `npm run test:lib`
Expected: 全部通过（含原有的 test-register-typed、test-integration-* 等）

- [ ] **Step 6: 运行 examples 集成测试（确认 examples 零改动通过）**

Run: `npm run build && npm run build:packages && pnpm --filter erest-example test`
Expected: 全部通过（examples 仍用裸 `new ERest()`，Raw=unknown，但 examples 不访问 raw，零影响）

> 若 examples 测试因构建产物变化失败，先 `npm run build:packages` 重建子包 dist。

- [ ] **Step 7: 新增框架原生能力速查表文档**

在 README.md 的「框架适配器」章节（或 AGENTS.md「改 X 去 Y」表后）追加 spec §2.1 的速查表。定位 README 中 adapter 相关章节，追加：

```markdown
### reply.raw 逃生舱与框架原生能力速查

`reply.raw` 暴露框架原生对象（setCookie/redirect/stream 等）。类型由 `createERest()` 工厂锁定：

| 能力 | Express (`reply.raw`) | Koa (`reply.raw`) | @leizm/web (`reply.raw`) |
|------|------|------|------|
| 设置 cookie | `.res.cookie(name, val, opts)` | `.cookies.set(name, val, opts)` | `.response.cookie(...)` |
| 读取 cookie | `.req.cookies`（需 cookie-parser） | `.cookies.get(name)` | `.request.cookies` |
| 重定向 | `.res.redirect(code, url)` | `.redirect(url)` | `.response.redirect(...)` |
| 流式响应 | `.res.write()` / `.res.end()` | `.body = stream` | `.response.send()` |
| 响应头已发送 | `.res.headersSent` | `.res.headersSent` | 查原生 |

> raw 的头部/cookie 操作应在 `reply.json()`/`reply.send()` 之前调用（HTTP 头先于体发送）。
```

- [ ] **Step 8: 标记裸 new ERest() 为 deprecated（过渡期）**

在 `src/lib/index.ts` 的 ERest 类构造函数上方（`:292` 之前）添加 JSDoc：

```ts
  /**
   * @deprecated 推荐使用子包工厂 `createERest()`（如 `@erest/express` 的 createERest），
   * 以在构造时锁定 Raw 泛型，让 handler 的 reply.raw 自动强类型。
   * 裸 new ERest() 在过渡期保留，Raw 默认 unknown，reply.raw 需手动断言。
   */
  constructor(options: IApiOption) {
```

Run: `npx tsc --noEmit` 确认无报错。

- [ ] **Step 9: 最终全量验证**

Run: `npm test`
Expected: 全部通过（含 build、build:packages、vitest、examples）

- [ ] **Step 10: Commit**

```bash
git add src/test/test-builder-types.ts src/test/test-raw-types.ts src/lib/index.ts README.md
git commit -m "test+docs: reply.raw 类型推导测试、能力速查表、标记 new ERest() deprecated

- 类型测试验证 createERest 锁定 Raw（零标注强类型）
- README 新增 reply.raw 框架原生能力速查表
- 构造函数标记 @deprecated，引导到子包 createERest()"
```

---

## Self-Review（写完后自查，非执行步骤）

完成后对照 spec 逐项确认：
- [ ] spec §1.1 Reply<Raw>+raw 字段 → Task 1
- [ ] spec §1.2 构造时锁定（TS 硬约束） → Task 5/6/7 createERest
- [ ] spec §1.3 泛型透传 6 处 → Task 1-3
- [ ] spec §1.4 使用形态 → Task 8 类型测试验证
- [ ] spec §1.5 三框架 adapter 改动 → Task 5/6/7
- [ ] spec §1.6 兼容策略（废弃裸 new） → Task 8 Step 8
- [ ] spec §2.1 原生能力速查表 → Task 8 Step 7
- [ ] spec §2.3 defaultErrorFormatter → Task 4
- [ ] spec §3.1 hook 不暴露 raw → Task 1 Step 3（Context.reply 为 Reply<unknown>）
- [ ] spec §4 测试策略 → Task 5/6/7（运行时三框架）+ Task 8（类型层）
