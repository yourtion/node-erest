# erest v3.2 类型安全 state + 全局响应信封 + 便利 schema 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 erest 框架层补齐三块能力（类型安全 state、全局 response envelope + registerTyped 强制 return、便利 schema 别名 + 测试返回类型推导），并以 one-api phase2-server 同步适配作为集成验证。

**Architecture:** 三块独立改进，按依赖顺序实施——Task 1（便利 schema，最小最独立）→ Task 2（typed state + handler 第二参数统一为 ctx，纯类型层泛型透传）→ Task 3（测试返回类型从 response schema 推导，依赖 Task 2 的 ctx 签名）→ Task 4-5（envelope + dispatcher 接入，改动面最大）→ Task 6（one-api 适配验证）。向后兼容是硬约束：State 默认值 / 未注册 enveloper / 未声明 response schema 时均维持 v3.1 行为。

> **关键时序约束：** Task 2 把 `registerTyped` handler 第二参数从 `reply` 统一为 `ctx`（breaking，详见 Task 2 Step 5）。Task 3 及之后所有测试代码均采用 `(req, ctx) => ctx.reply.json(...)` 新签名。Task 2 必须在 Task 3 之前完成。

**Tech Stack:** TypeScript（strict）、Zod 4、Vitest 3、pnpm workspace。erest 主仓库 `node-erest`（框架）+ 消费仓库 `one-api`（phase2-server worktree）。

**前置准备（一次性，开工前执行）：**
```bash
cd /Users/yourtionguo/codes/open/node-erest
git checkout feat/typed-state-envelope   # spec 已提交到此分支
pnpm install
pnpm test:lib   # 确认基线全绿（ISLIB=1 直走源码）
```

**测试命令约定（贯穿全计划）：**
```bash
# erest 框架侧（在 node-erest 仓库根目录）
pnpm test:lib                                    # 全量测试（ISLIB=1，直走源码，最快）
pnpm test:lib -- src/test/test-register-typed.ts # 单文件
pnpm typecheck                                   # 类型检查
pnpm lint                                        # oxlint

# 覆盖率（门槛：branches 80 / functions 95 / lines 80 / statements 80）
pnpm test:cov
```

---

## 文件结构（改动总览）

### 框架侧（node-erest）

| 文件 | 职责 | 改动 |
|---|---|---|
| `src/lib/params.ts` | Zod 校验 + schema 别名 | **新增** `anyObject` 工厂 + `zodTypeMap` 不变 |
| `src/lib/index.ts` | ERest 门面 | re-export `z.anyObject`；新增 `State` 泛型 + `setResponseEnvelopers`；`formatOutputReverse` 默认从 enveloper 推导 |
| `src/lib/adapters/types.ts` | Context/Reply/Middleware 类型 | `Context<State>` / `Middleware<State>` 加泛型 |
| `src/lib/api.ts` | API 定义 + registerTyped | `API<T,Raw,State>` 透传 State；`registerTyped` 支持 enveloper 模式（return data） |
| `src/lib/adapters/utils.ts` | compose + buildHandlerChain | **新增** `wrapWithEnvelope` 工具（成功/错误分支统一信封） |
| `packages/erest-{express,koa,leizmweb}/src/index.ts` | 三框架 adapter | `createERest` 透传 State 泛型；`bindRoute` 接入 enveloper（dispatch 后处理 return/catch） |
| `src/lib/agent.ts` | TestAgent | `success<T>()/error()` 返回类型从 response schema 推导 |
| `src/lib/extend/test.ts` | IAPITest | `findApi` 携带 responseType；`buildTest` 透传泛型 |

### 消费侧（one-api phase2-server worktree）

| 文件 | 改动 |
|---|---|
| `apps/server/src/api/instance.ts` | `createERest<AppState>()` + `setResponseEnvelopers` |
| `apps/server/src/api/format.ts` | **删除** |
| `apps/server/src/utils/response.ts` | **删除**（或保留 `ApiResponse` 类型导出，按实际依赖定） |
| `apps/server/src/hooks.ts` | `ctx.state['x']` → `ctx.state.x` |
| `apps/server/src/routes/*.ts` | `reply.json(ok(x))` → `return x`；去 `as`；`z.object({}).catchall` → `z.anyObject()` |
| `apps/server/src/__tests__/helpers.ts` | 删 `applyEnvelopeFormat` 调用 |
| `apps/server/src/app.ts` | 错误中间件简化 |

---

## Task 1: z.anyObject() 便利 schema 别名

**Files:**
- Modify: `src/lib/params.ts`（新增 `anyObject` 工厂导出）
- Modify: `src/lib/index.ts`（re-export + 挂到 z 命名空间）
- Test: `src/test/test-zod-native.ts`（新增用例）

**背景：** one-api 用 `z.object({}).catchall(z.unknown())` 表示「任意动态字段 body」（4 处），Zod 黑话。erest 提供 `z.anyObject()` 语义化别名。

- [ ] **Step 1: 写失败测试**

在 `src/test/test-zod-native.ts` 末尾新增（import 已有 `import { z } from "zod"`，改用 erest 导出的 z——见 Step 3 说明）：

```ts
describe("z.anyObject() 便利别名", () => {
  it("应接受任意键值的对象", () => {
    const schema = z.anyObject();
    const parsed = schema.parse({ foo: 1, bar: "x", nested: { a: true } });
    expect(parsed).toEqual({ foo: 1, bar: "x", nested: { a: true } });
  });

  it("应拒绝非对象值", () => {
    const schema = z.anyObject();
    expect(() => schema.parse("not-object")).toThrow();
    expect(() => schema.parse(42)).toThrow();
    expect(() => schema.parse(null)).toThrow();
  });

  it("空对象应通过", () => {
    const schema = z.anyObject();
    expect(schema.parse({})).toEqual({});
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test:lib -- src/test/test-zod-native.ts
```
Expected: FAIL，报 `z.anyObject is not a function`。

- [ ] **Step 3: 实现 anyObject 工厂**

在 `src/lib/params.ts` 顶部已有 `import { z } from "zod"`。在文件中（`zodTypeMap` 定义之后）新增：

```ts
/**
 * 接受任意键值对象的 schema 别名：等价 `z.object({}).catchall(z.unknown())`。
 *
 * 供「动态字段 body」（如 one-api 的 records CRUD：字段由业务表 schema 决定，
 * API 定义时未知）等场景使用。挂到 z 命名空间后写作 `z.anyObject()`。
 */
export const anyObject = () => z.object({}).catchall(z.unknown());
```

在 `src/lib/index.ts` 找到 `export { z, ZodRawShape, ZodType };` 这一行（约第 33 行），在其**下方**新增挂载 + 具名导出：

```ts
import { anyObject as _anyObject } from "./params.js";

// 挂到 z 命名空间（z 是运行时值，可扩展属性），写作 z.anyObject()
(z as { anyObject?: typeof _anyObject }).anyObject = _anyObject;
// 具名导出常量（供 import { zAnyObject } 用，避免每次调用工厂）
export const zAnyObject = _anyObject();
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test:lib -- src/test/test-zod-native.ts
```
Expected: PASS（3 个用例全绿）。

- [ ] **Step 5: 全量回归**

```bash
pnpm test:lib
```
Expected: 全绿（确认挂载 z 命名空间未破坏现有 z 用法）。

- [ ] **Step 6: 类型检查 + lint**

```bash
pnpm typecheck && pnpm lint
```
Expected: 无错误。

- [ ] **Step 7: 提交**

```bash
git add src/lib/params.ts src/lib/index.ts src/test/test-zod-native.ts
git commit -m "feat(schema): z.anyObject() 便利别名（等价 z.object({}).catchall(z.unknown())）"
```

---

## Task 2: 测试返回类型从 response schema 推导

**Files:**
- Modify: `src/lib/api.ts`（`API` 类暴露 responseType 给运行时占位）
- Modify: `src/lib/extend/test.ts`（`findApi` 返回值携带 responseType；`buildTest` 透传泛型）
- Modify: `src/lib/agent.ts`（`success<T>()` 泛型化）
- Test: `src/test/test-test.ts`（新增类型推导用例）

**背景：** `TestAgent.success()` 当前返回 `Promise<unknown>`（agent.ts:265），one-api 测试每个用例都 `as {...}`。当 `registerTyped` 声明了 `{ response: Schema }` 时，`success()` 应返回 `Promise<z.infer<Schema>>`。

**类型链路：** `registerTyped<TResponse>` → `API.options.responseType`（运行时占位，仅类型层用）→ `findApi` 返回 `API` → `buildTest` 读 `responseType` → `TestAgent.success<T>`。

- [ ] **Step 1: 在 api.ts 暴露 responseType 占位**

`registerTyped` 已有 `TResponse extends z.ZodTypeAny` 泛型（api.ts 约 336 行）。在 `registerTyped` 方法体内、`if (schemas.response) { this.options.responseSchema = schemas.response; }` 这段（约 370 行）之后新增运行时占位赋值：

```ts
    // 运行时占位：存 schema 实例，供 TestAgent.success<T>() 从 z.infer 推导返回类型用
    // （类型层：options.responseType 与 responseSchema 同源）
    if (schemas.response) {
      this.options.responseSchema = schemas.response;
    }
```

> 注：`responseSchema` 已存在（`APIOption.responseSchema`，api.ts:62），`findApi` 直接读它即可，无需新增字段。本步**无需改 api.ts**——确认 `responseSchema` 在 `init()` 后仍保留即可（它确实保留，`init()` 不清空它）。**跳过本步，直接进 Step 2。**

- [ ] **Step 2: 写失败测试（运行时行为 + 类型）**

在 `src/test/test-test.ts` 末尾新增。该测试验证两点：①success() 返回的是信封内层数据（依赖 setFormatOutput 拆信封，已有机制）②声明 response schema 后返回类型正确推导。

```ts
describe("success() 返回类型从 response schema 推导", () => {
  it("声明 response schema 时 success() 返回内层数据", async () => {
    // 复用 test-test.ts 顶部已初始化的 apiService（beforeAll 里 bind + initTest + setFormatOutput）
    // 若作用域拿不到 apiService，则在此用例内自建一个局部实例（见下）
    const express = (await import("express")).default;
    const app = express();
    app.use(express.json());
    const { expressAdapter } = await import("./adapters");
    const lib = (await import("./lib")).default;

    const apiService = lib({ basePath: "" });
    const UserVO = z.object({ id: z.number(), name: z.string() });
    apiService.api
      .get("/vo-test")
      .group("Index")
      .title("vo")
      .registerTyped(
        { response: UserVO },
        (req, reply) => reply.json({ result: { id: 1, name: "Tom" } })
      );
    apiService.bind({ adapter: expressAdapter, router: app });
    apiService.setFormatOutput((data: unknown): [Error | null, unknown] => {
      const d = data as { result?: unknown };
      return d && typeof d === "object" && "result" in d ? [null, d.result] : [null, data];
    });
    apiService.initTest(app, "/tmp", "/tmp");

    const ret = await apiService.test.get("/vo-test").success();
    // 运行时：拿到内层 { id, name }
    expect(ret).toEqual({ id: 1, name: "Tom" });
  });
});
```

> 说明：本步先只验证**运行时**返回内层数据（现有能力）。类型推导（`ret` 自动是 `{id:number;name:string}` 而非 `unknown`）在 Step 4 实现后，通过一个**纯类型断言**用例验证（见 Step 5）。

- [ ] **Step 3: 运行测试确认通过（运行时部分应已绿）**

```bash
pnpm test:lib -- src/test/test-test.ts
```
Expected: PASS（运行时行为依赖现有 setFormatOutput，本就工作）。若 FAIL，先修到绿再继续。

- [ ] **Step 4: 实现 TestAgent.success 泛型化**

修改 `src/lib/agent.ts`。找到 `public success(): Promise<unknown>`（约 265 行），改为泛型方法：

```ts
  /** 期望输出成功结果（返回类型 T 由调用方或 response schema 推导） */
  public success<T = unknown>(): Promise<T> {
    this.debug("success");
    return this.output(false, true).catch((err) => {
      throw new Error(`${this.key} 期望API输出成功结果，但实际输出失败结果：${inspect(err)}`);
    }) as Promise<T>;
  }
```

修改 `src/lib/extend/test.ts` 的 `buildTest`，让调用方能传入推断的 T。找到 `buildTest` 方法（约 154 行），改为：

```ts
  /** 生成测试方法（T 供调用侧从 response schema 推导注入） */
  private buildTest<T = unknown>(method: SUPPORT_METHODS) {
    return (path: string) => {
      const s = this.findApi(method, path);
      if (!s || !s.key) {
        throw new Error(`尝试请求未注册的API：${method} ${path}`);
      }
      const a = new TestAgent(method, path, s.key, getCallerSourceLine(this.testPath), this.erest);
      assert(this.erest.getTestView().app, "请先调用 initTest(app) 设置 app 实例");
      a.bindRequest(this.getBaseUrl, this.ready);
      return a.agent() as TestAgent & { success: () => Promise<T>; error: () => Promise<unknown>; raw: () => Promise<unknown> };
    };
  }
```

> 关键约束：`buildTest` 当前是 `IAPITest` 的私有方法，被 `get get/post/...` 调用。`get` 等 getter 无法感知具体 API 的 response schema（要等 `findApi` 后才知道），故 **T 只能由调用侧显式传**（`api.test.get<T>('/path')`）。但更符合人体工学的做法是：**让 session() 的方法接收 path 后自动从已注册 API 读 responseType**。鉴于 `findApi` 已能拿到 `s.options.responseSchema`，可在 `buildSession` 里做。本计划采用「调用侧显式传 T」的最小改动路径（向后兼容，未传 T 时退回 unknown）。

- [ ] **Step 5: 写类型推导断言用例**

在 Step 2 的测试用例下方新增一个**纯类型**断言（运行时不执行新逻辑，仅 typecheck 时验证类型推导）：

```ts
  it("声明 response schema 时 success<T>() 的 T 被正确推导", async () => {
    const express = (await import("express")).default;
    const app = express();
    app.use(express.json());
    const { expressAdapter } = await import("./adapters");
    const lib = (await import("./lib")).default;

    const apiService = lib({ basePath: "" });
    const UserVO = z.object({ id: z.number(), name: z.string() });
    apiService.api
      .get("/vo-type")
      .group("Index")
      .title("vo-type")
      .registerTyped(
        { response: UserVO },
        (req, reply) => reply.json({ result: { id: 1, name: "Tom" } })
      );
    apiService.bind({ adapter: expressAdapter, router: app });
    apiService.setFormatOutput((data: unknown): [Error | null, unknown] => {
      const d = data as { result?: unknown };
      return d && typeof d === "object" && "result" in d ? [null, d.result] : [null, data];
    });
    apiService.initTest(app, "/tmp", "/tmp");

    type UserVO = z.infer<typeof UserVO>;
    const ret = await apiService.test.get<UserVO>("/vo-type").success<UserVO>();
    // 类型断言：ret 必须是 UserVO，不是 unknown
    const _check: UserVO = ret;
    expect(_check.id).toBe(1);
  });
```

- [ ] **Step 6: 运行 + 类型检查**

```bash
pnpm test:lib -- src/test/test-test.ts
pnpm typecheck
```
Expected: 测试 PASS + typecheck 无错误（验证 success<T>() 泛型链路通）。

- [ ] **Step 7: 全量回归**

```bash
pnpm test:lib && pnpm lint
```
Expected: 全绿。

- [ ] **Step 8: 提交**

```bash
git add src/lib/agent.ts src/lib/extend/test.ts src/test/test-test.ts
git commit -m "feat(test): success<T>() 返回类型支持从 response schema 推导（默认 unknown 向后兼容）"
```

---

## Task 3: 类型安全的 state（ERest 实例级泛型 StateMap）

**Files:**
- Modify: `src/lib/index.ts`（`ERest<T,Raw,State>` + `group()` 透传）
- Modify: `src/lib/adapters/types.ts`（`Context<State>` / `Middleware<State>`）
- Modify: `src/lib/api.ts`（`API<T,Raw,State>` + register/registerTyped handler ctx 类型）
- Modify: `packages/erest-{express,koa,leizmweb}/src/index.ts`（`createERest<State>` 透传）
- Test: `src/test/test-types.ts`（新增类型推导用例）+ `src/test/test-register-typed.ts`（运行时 state 传递）

**背景：** `Context.state` 是 `Record<string, unknown>`，鉴权钩子注入的值取回时全靠 `as`（one-api 6 处）。新增 `State` 泛型，默认 `Record<string, unknown>` 向后兼容。

**纯类型层改动：** 本任务运行时行为完全不变（`state: {}` 仍是普通对象），仅收紧类型。

- [ ] **Step 1: 改 Context / Middleware 加 State 泛型**

修改 `src/lib/adapters/types.ts`。

`Context` 接口（约 101 行）加 State 泛型参数：

```ts
export interface Context<State extends Record<string, unknown> = Record<string, unknown>> {
  readonly method: string;
  readonly path: string;
  readonly headers: Record<string, string>;
  readonly params: Record<string, unknown>;
  readonly query: Record<string, unknown>;
  readonly body: unknown;
  /** 跨中间件传递数据的可读写状态（类型由 ERest<State> 泛型驱动） */
  readonly state: State;
  readonly reply: Reply<unknown>;
  $validated?: {
    params: Record<string, unknown>;
    query: Record<string, unknown>;
    body: Record<string, unknown>;
    headers: Record<string, unknown>;
  };
  $params?: Record<string, unknown>;
  $pathParams?: Record<string, unknown>;
  $query?: Record<string, unknown>;
  $body?: Record<string, unknown>;
  $headers?: Record<string, unknown>;
}
```

`Middleware` 类型（约 145 行）加 State 泛型参数：

```ts
export type Middleware<State extends Record<string, unknown> = Record<string, unknown>> = (
  ctx: Context<State>,
  next: () => Promise<void> | void
) => Promise<void> | void;
```

- [ ] **Step 2: 改 ERest 类加 State 泛型**

修改 `src/lib/index.ts`。

找到 `class ERest<T = DEFAULT_HANDLER, Raw = unknown>`（约第 178 行），改为：

```ts
class ERest<T = DEFAULT_HANDLER, Raw = unknown, State extends Record<string, unknown> = Record<string, unknown>> {
```

找到 `public group(name: string, info?: IGroupInfoOpt): IGroup<T, Raw>;` 等 group 重载（约 470 行附近），`IGroup<T, Raw>` 全部改为 `IGroup<T, Raw, State>`。

修改 `IGroup` 接口定义（约第 60 行）加 State：

```ts
export interface IGroup<T, Raw = unknown, State extends Record<string, unknown> = Record<string, unknown>>
  extends Record<string, unknown>, genSchema<T, Raw> {
  define: (opt: APIDefine<T>) => API<T, Raw, State>;
  before: (...fn: T[]) => IGroup<T, Raw, State>;
  middleware: (...fn: T[]) => IGroup<T, Raw, State>;
}
```

> 注：`genSchema` 返回 `API<T, Raw>` 需同步改为 `API<T, Raw, State>`（见 genSchema 定义约第 57 行）。

- [ ] **Step 3: 改 API 类加 State 泛型 + handler ctx 类型**

修改 `src/lib/api.ts`。

`class API<T = DEFAULT_HANDLER, Raw = unknown>`（约 72 行）改为 `class API<T = DEFAULT_HANDLER, Raw = unknown, State extends Record<string, unknown> = Record<string, unknown>>`。

`register` 方法（约 312 行）的 handler 参数类型，把 `Middleware` 改为 `Middleware<State>`：

```ts
  public register(fn: Middleware<State>): this {
```

`registerTyped` 的 wrappedHandler（约 377 行）内部 `async (ctx) => {...}`，ctx 类型由 TS 自动推导为 `Context<State>`（因 Middleware<State>）。无需显式标注。

`static define<T, Raw = unknown>`（约 112 行）加 State 泛型默认值，签名改为 `static define<T, Raw = unknown, State extends Record<string, unknown> = Record<string, unknown>>`。

- [ ] **Step 3.5: registerTyped handler 第二参数统一为 ctx（breaking）**

> 此步是后续 Task 3（success 泛型测试）/ Task 4（envelope）的前置：把 `registerTyped` handler 第二参数从 `reply` 统一为 `ctx`（即 `Context<State>`，含 `ctx.reply`）。这样 enveloper 模式下 handler 用 `return data`、非 enveloper 模式下用 `ctx.reply.json(x)`，两种模式签名一致，避免运行时 if 分支。

修改 `src/lib/api.ts` 的 `registerTyped` handler 参数类型（约 345-353 行）。当前是 `(req, reply: Reply<Raw>) => ...`，改为：

```ts
    handler: (
      req: {
        query: z.infer<z.ZodObject<TQuery>>;
        body: z.infer<z.ZodObject<TBody>>;
        params: z.infer<z.ZodObject<TParams>>;
        headers: z.infer<z.ZodObject<THeaders>>;
      },
      ctx: Context<State>  // 原 reply: Reply<Raw>，统一改为 ctx（含 ctx.reply）
    ) => z.infer<TResponse> | Promise<z.infer<TResponse>> | void | Promise<void>
```

需在 api.ts 顶部 import `Context` 类型（若未导入）：`import type { Context, Middleware, Reply } from "./adapters/types.js";`（api.ts 第 9 行已有此 import，确认含 `Context`）。

修改 wrappedHandler（约 377 行）内 handler 调用，把传 `ctx.reply` 改为传 `ctx`：

```ts
      const result = handler(typedReq, ctx);  // 原：handler(typedReq, ctx.reply as Reply<Raw>)
```

同时保留原 response schema 校验逻辑（wrappedHandler 内 `if (schemas.response && result !== undefined)` 那段不动）。

**回归：** 改完此步，存量 `registerTyped` 测试（test-register-typed.ts / test-raw.ts）的 handler 签名是 `(req, reply) => reply.json(...)`，会因类型变化报错。把这些测试的 `reply` 改为 `ctx`、`reply.json` 改为 `ctx.reply.json`。逐个修复直到 typecheck + test 全绿：

```bash
pnpm typecheck   # 定位所有 (req, reply) => 的报错点
# 逐个改为 (req, ctx) => ctx.reply.json(...)
pnpm test:lib -- src/test/test-register-typed.ts src/test/test-raw.ts src/test/test-test.ts
pnpm typecheck && pnpm test:lib
```

> **Breaking 登记：** 存量 handler `(req, reply) => reply.json(x)` 须改为 `(req, ctx) => ctx.reply.json(x)`。erest 当前唯一消费者 one-api 在 Task 6 统一适配。MIGRATION.md 登记（见计划末尾）。

- [ ] **Step 4: 改三框架子包 createERest 透传 State**

对 `packages/erest-express/src/index.ts`、`packages/erest-koa/src/index.ts`、`packages/erest-leizmweb/src/index.ts` 三个文件的 `createERest` 工厂，统一改为透传 State：

```ts
export function createERest<State extends Record<string, unknown> = Record<string, unknown>>(
  options: ConstructorParameters<typeof ERestCtor>[0]
): ERest<Middleware<State>, XxxRaw, State> {
  return new ERestCtor<Middleware<State>, XxxRaw, State>(options);
}
```

（`XxxRaw` 为各子包的原生类型：`ExpressRaw` / `KoaRaw` / `LeizmWebRaw`）

同时确认各子包 `makeParamsChecker` 返回的 `checker: Middleware` 改为 `Middleware<State>`（adapter 装配的 `nativeMiddleware` 内 `state: {}` 运行时不变，仅类型对齐）。

- [ ] **Step 5: 写运行时 state 传递测试**

在 `src/test/test-register-typed.ts` 末尾新增（验证 before 钩子注入的 state 能被 handler 读到——运行时行为）。用 `register`（非 typed），因 register 的 handler 是 `(ctx, next)` 签名，能直接读 `ctx.state`：

```ts
describe("ctx.state 跨中间件传递", () => {
  it("before 钩子写入 state，handler 能读取", async () => {
    const app = express();
    app.use(express.json());
    const apiService = lib({ basePath: "" });

    apiService.api
      .get("/state-test")
      .group("Index")
      .title("state")
      .before((ctx, next) => {
        ctx.state["userId"] = 42;  // 写（v3.1 state 是 Record<string,unknown>，无类型约束）
        return next();
      })
      .register((ctx, next) => {
        ctx.reply.json({ userId: ctx.state["userId"] });  // 读
        return next();
      });

    apiService.bind({ adapter: expressAdapter, router: app });
    const res = await request(app).get("/state-test");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: 42 });
  });
});
```

> 说明：此处用 `register`（非 typed）验证 state 运行时传递——register handler 是 `(ctx, next)`，能直接读 `ctx.state`。`registerTyped` 的 handler 读 state 用第二参数 ctx（Step 3.5 已统一为 ctx），Task 4 enveloper 模式的测试会覆盖 registerTyped 读 state 的场景。本步先用 register 验证「写进去能读出来」的运行时行为（State 泛型是纯类型层，运行时 state 仍是普通对象）。

- [ ] **Step 6: 运行运行时测试**

```bash
pnpm test:lib -- src/test/test-register-typed.ts
```
Expected: PASS。

- [ ] **Step 7: 写类型推导测试（纯 typecheck）**

在 `src/test/test-types.ts` 末尾新增（验证 State 泛型透传到 handler ctx）：

```ts
import type { Context, Middleware } from "../lib/adapters/types.js";
import type ERest from "../lib/index.js";

describe("ERest<State> 类型推导（编译期）", () => {
  it("State 泛型透传到 ctx.state", () => {
    interface MyState {
      userId?: number;
      role: string;
    }

    // 模拟 createERest<MyState>() 返回的实例类型
    type Api = ERest<Middleware, unknown, MyState>;

    // before 钩子：ctx.state 必须是 MyState
    const hook: Middleware<MyState> = (ctx, next) => {
      ctx.state.userId = 1;       // OK：number
      ctx.state.role = "admin";   // OK：string
      // @ts-expect-error 未知键应报错
      ctx.state.unknownKey = "x";
      return next();
    };

    // 断言 ctx.state 类型
    const _check = (ctx: Context<MyState>) => {
      const role: string = ctx.state.role;
      return role;
    };
    expect(typeof hook).toBe("function");
    expect(typeof _check).toBe("function");
  });

  it("未声明 State 时 ctx.state 退回 Record<string, unknown>（向后兼容）", () => {
    const hook: Middleware = (ctx, next) => {
      ctx.state.anyKey = "any";  // OK：Record<string, unknown>
      return next();
    };
    expect(typeof hook).toBe("function");
  });
});
```

- [ ] **Step 8: 类型检查**

```bash
pnpm typecheck
```
Expected: 无错误（`@ts-expect-error` 行必须真的报错才算通过——若该行不报错，typecheck 会因 `@ts-expect-error` 未生效而报错，反向验证类型收紧生效）。

- [ ] **Step 9: 全量回归 + 覆盖率**

```bash
pnpm test:lib && pnpm test:cov && pnpm lint
```
Expected: 全绿 + 覆盖率达标。

- [ ] **Step 10: 提交**

```bash
git add src/lib/index.ts src/lib/adapters/types.ts src/lib/api.ts packages/*/src/index.ts \
        src/test/test-types.ts src/test/test-register-typed.ts src/test/test-raw.ts src/test/test-test.ts
git commit -m "feat(types): ERest<State> 实例级泛型 + registerTyped handler 第二参数统一为 ctx

- ctx.state 类型安全（默认 Record<string,unknown> 向后兼容）
- registerTyped handler 签名 (req, reply) → (req, ctx)，ctx 含 ctx.reply
- 存量测试同步适配（test-register-typed/test-raw/test-test）"
```

---

## Task 4: 全局 response envelope 注册 + registerTyped 强制 return

**Files:**
- Modify: `src/lib/index.ts`（新增 `setResponseEnvelopers` + 存储 + bind 接入 enveloper）
- Modify: `src/lib/api.ts`（`registerTyped` wrappedHandler 写入 `ctx.__returnValue` 供 enveloper 消费）
- Modify: `src/lib/adapters/types.ts`（`bindRoute` 签名加 envelopers 参数）
- Modify: `src/lib/adapters/utils.ts`（**新增** `wrapWithEnvelope` 工具：成功/错误分支统一信封）
- Modify: `packages/erest-{express,koa,leizmweb}/src/index.ts`（`bindRoute` 接入 wrapWithEnvelope）
- Test: `src/test/test-envelope.ts`（**新建**，envelope 注册 + 成功/错误包装）

**背景：** one-api 用统一信封 `{success, data|error}`，当前每个 handler 手写 `reply.json(ok(x))`。erest 新增 `setResponseEnvelopers({success, error})`，enveloper 模式下 handler 改为 `return data`，框架自动包装。

**核心设计：**
- `success enveloper`：`(data, ctx) => wrappedBody`，handler return 的 data 经它包装
- `error enveloper`：`(err, ctx) => { body, status }`，抛出的错误经它包装
- **接入点**：`wrapWithEnvelope(dispatch, envelopers)` 包装各 adapter 的 dispatch——成功时从 ctx 取 handler return 值（handler 把 return 值挂到 `ctx.__returnValue`），错误时 catch。这样 3 个 adapter 共享同一逻辑，不重复改 3 次。

- [ ] **Step 1: 写失败测试**

新建 `src/test/test-envelope.ts`：

```ts
/**
 * @file 全局 response envelope 集成测试
 * 验证 setResponseEnvelopers 后 registerTyped handler return data 被自动包装
 */
import express from "express";
import { expressAdapter } from "./adapters";
import { httpReq as request } from "./http-req";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import lib from "./lib";

describe("全局 response envelope（registerTyped return 模式）", () => {
  it("handler return data → success enveloper 自动包装", async () => {
    const app = express();
    app.use(express.json());
    const apiService = lib({ basePath: "" });

    apiService.setResponseEnvelopers({
      success: (data: unknown) => ({ success: true, data }),
      error: (err: unknown) => {
        const e = err as { statusCode?: number; code?: string; message?: string };
        return {
          body: { success: false, error: { code: e.code ?? "ERROR", message: e.message ?? "fail" } },
          status: e.statusCode ?? 500,
        };
      },
    });

    apiService.api
      .get("/env-ok")
      .group("Index")
      .title("env-ok")
      .registerTyped({}, async () => {
        return { id: 1, name: "Tom" };  // return data，不调 reply
      });

    apiService.bind({ adapter: expressAdapter, router: app });
    const res = await request(app).get("/env-ok");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { id: 1, name: "Tom" } });
  });

  it("handler 抛错 → error enveloper 自动包装 + 状态码", async () => {
    const app = express();
    app.use(express.json());
    const apiService = lib({ basePath: "" });

    apiService.setResponseEnvelopers({
      success: (data: unknown) => ({ success: true, data }),
      error: (err: unknown) => {
        const e = err as { statusCode?: number; code?: string; message?: string };
        return {
          body: { success: false, error: { code: e.code ?? "ERROR", message: e.message ?? "fail" } },
          status: e.statusCode ?? 500,
        };
      },
    });

    const boom = Object.assign(new Error("not found"), { statusCode: 404, code: "NOT_FOUND" });
    apiService.api
      .get("/env-err")
      .group("Index")
      .title("env-err")
      .registerTyped({}, async () => {
        throw boom;
      });

    apiService.bind({ adapter: expressAdapter, router: app });
    const res = await request(app).get("/env-err");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: { code: "NOT_FOUND", message: "not found" } });
  });

  it("handler return undefined → success enveloper 包 undefined", async () => {
    const app = express();
    app.use(express.json());
    const apiService = lib({ basePath: "" });
    apiService.setResponseEnvelopers({
      success: (data: unknown) => ({ success: true, data }),
      error: (err: unknown) => ({ body: { success: false }, status: 500 }),
    });

    apiService.api
      .post("/env-void")
      .group("Index")
      .title("env-void")
      .registerTyped({}, async () => {
        // 无 return
      });

    apiService.bind({ adapter: expressAdapter, router: app });
    const res = await request(app).post("/env-void").send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: undefined });
  });
});

afterAll(() => {});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test:lib -- src/test/test-envelope.ts
```
Expected: FAIL，报 `setResponseEnvelopers is not a function`。

- [ ] **Step 3: 在 index.ts 新增 setResponseEnvelopers + 存储**

在 `src/lib/index.ts` 找到 `IApiInfo` 接口（约第 48 行），新增两个可选字段：

```ts
export interface IApiInfo<T, Raw = unknown> extends Record<string, unknown>, genSchema<T, Raw> {
  readonly $apis: Map<string, API<T, Raw>>;
  define: (opt: APIDefine<T>) => API<T, Raw>;
  beforeHooks: Set<T>;
  afterHooks: Set<T>;
  docs?: IAPIDoc;
  formatOutputReverse?: (out: unknown) => [Error | null, unknown];
  docOutputFormat?: (out: unknown) => unknown;
  /** 全局成功信封包装器（setResponseEnvelopers 注册后，handler return data 自动经此包装） */
  successEnveloper?: (data: unknown, ctx: import("./adapters/types.js").Context) => unknown;
  /** 全局错误信封包装器（抛错时自动包装为 {body, status}） */
  errorEnveloper?: (err: unknown, ctx: import("./adapters/types.js").Context) => { body: unknown; status: number };
}
```

在 `ERest` 类内（`setFormatOutput` 方法附近，约 411 行）新增方法：

```ts
  /**
   * 注册全局响应信封包装器。
   *
   * 注册后，registerTyped 的 handler 进入「return 模式」：handler 只 return data，
   * 框架在 dispatcher 层用 successEnveloper 包装写入响应；抛错用 errorEnveloper 包装。
   * 未注册时维持 v3.1 行为（handler 调 reply 写响应）。
   */
  public setResponseEnvelopers(envelopers: {
    success: (data: unknown, ctx: import("./adapters/types.js").Context) => unknown;
    error: (err: unknown, ctx: import("./adapters/types.js").Context) => { body: unknown; status: number };
  }): void {
    this.apiInfo.successEnveloper = envelopers.success;
    this.apiInfo.errorEnveloper = envelopers.error;
  }
```

- [ ] **Step 4: 实现 wrapWithEnvelope 工具（adapters/utils.ts）**

在 `src/lib/adapters/utils.ts` 末尾新增。这是 envelope 接入的核心——包装 dispatch，成功时从 ctx 取 return 值，错误时 catch：

```ts
import type { Context } from "./types.js";

/**
 * 包装 dispatch：注册了 enveloper 时，handler return 值经 successEnveloper 包装写入 reply；
 * 抛错经 errorEnveloper 包装。未注册 enveloper 时退化为原 dispatch（向后兼容）。
 *
 * handler 的 return 值通过 ctx.__returnValue 传递（由 registerTyped 的 wrappedHandler 写入）。
 */
export function wrapWithEnvelope(
  dispatch: (ctx: Context) => Promise<void>,
  opts: {
    successEnveloper?: (data: unknown, ctx: Context) => unknown;
    errorEnveloper?: (err: unknown, ctx: Context) => { body: unknown; status: number };
  }
): (ctx: Context) => Promise<void> {
  const { successEnveloper, errorEnveloper } = opts;
  if (!successEnveloper && !errorEnveloper) return dispatch;  // 零开销：未注册时直接返回原 dispatch

  return async function (ctx: Context): Promise<void> {
    try {
      await dispatch(ctx);
      // 成功：从 ctx 取 handler return 值（仅 registerTyped enveloper 模式下会写入 __returnValue）
      const returnValue = (ctx as Context & { __returnValue?: unknown }).__returnValue;
      if (returnValue !== undefined && successEnveloper) {
        // enveloper 模式：用 successEnveloper 包装 return 值写入响应
        // 约定：enveloper 模式下 handler 不调 ctx.reply（仅 return data）；若误调又 return，
        // 此处 json 会覆盖——属误用，文档警示。
        const wrapped = successEnveloper(returnValue, ctx);
        ctx.reply.json(wrapped);
      }
    } catch (err) {
      if (errorEnveloper) {
        const { body, status } = errorEnveloper(err, ctx);
        ctx.reply.status(status).json(body);
      } else {
        throw err;  // 未注册 errorEnveloper 时 re-throw（交给 app 级中间件）
      }
    }
  };
}
```

- [ ] **Step 5: registerTyped wrappedHandler 写入 __returnValue（供 enveloper 消费）**

> 前置：Task 3 Step 3.5 已把 handler 第二参数统一为 ctx，并改了 `handler(typedReq, ctx)` 调用。本步在此基础上，把 handler 的 return 值存入 `ctx.__returnValue`，供 Task 4 Step 4 的 `wrapWithEnvelope` 消费。

修改 `src/lib/api.ts` 的 `registerTyped` wrappedHandler（约 377 行）。当前（Task 3 改完后）是：

```ts
    const wrappedHandler: Middleware<State> = async (ctx) => {
      const validated = ctx.$validated ?? { params: {}, query: {}, body: {}, headers: {} };
      const typedReq = { /* 同原 */ } as { /* 同原 */ };
      const result = handler(typedReq, ctx);
      // response schema 校验（原逻辑）
      if (schemas.response && result !== undefined) { /* ... */ }
    };
```

在 `const result = handler(typedReq, ctx);` 之后、response schema 校验之前，插入 `__returnValue` 写入：

```ts
      const result = handler(typedReq, ctx);

      // handler return 值存入 ctx.__returnValue，供 wrapWithEnvelope（enveloper 模式）消费
      if (result !== undefined) {
        (ctx as Context<State> & { __returnValue?: unknown }).__returnValue = result;
      }

      // response schema 校验（原逻辑保留不动）
      if (schemas.response && result !== undefined) { /* ... */ }
```

> 注：`__returnValue` 仅在注册了 enveloper 时被 `wrapWithEnvelope` 消费（Step 4）。非 enveloper 模式下 `__returnValue` 被写入但无人读，无副作用（handler 已通过 ctx.reply 写了响应，wrapWithEnvelope 退化分支不处理）。

- [ ] **Step 6: 在 bind() 接入 wrapWithEnvelope**

修改 `src/lib/index.ts` 的 `bind()` 方法。找到 forceGroup 分支内 `const handlers = buildHandlerChain({...})`（约 556 行）和 `adapter.bindRoute(route, schema, handlers, this.hooks);`（约 563 行）之间，插入 envelope 包装：

```ts
        const handlers = buildHandlerChain({
          beforeHooks: this.apiInfo.beforeHooks,
          api: schema,
          checker,
          groupInfo: groupInfo as IAdapterGroupInfo<T>,
        });

        // envelope 接入：注册了 enveloper 时，包装 handler 链的最后一段（dispatch 由 adapter 构造）
        // 实际接入在各 adapter 的 bindRoute 内：传 enveloper 给 adapter
```

> **关键调整：** `wrapWithEnvelope` 包装的是 `dispatch`（compose 的产物），而 `dispatch` 在各 adapter 的 `bindRoute` 内构造。故 enveloper 必须**传入 adapter**。修改 `FrameworkAdapter.bindRoute` 签名（`adapters/types.ts`）增加 enveloper 参数：

修改 `src/lib/adapters/types.ts` 的 `bindRoute`：

```ts
  bindRoute(
    router: unknown,
    api: API<T>,
    handlers: T[],
    hooks?: import("../hooks.js").LifecycleHooks,
    envelopers?: {
      success?: (data: unknown, ctx: Context) => unknown;
      error?: (err: unknown, ctx: Context) => { body: unknown; status: number };
    }
  ): void;
```

在 `index.ts` 的 `bind()` 两处（forceGroup + 非 forceGroup）调用 `adapter.bindRoute` 时，传入 enveloper：

```ts
        adapter.bindRoute(route, schema, handlers, this.hooks, {
          success: this.apiInfo.successEnveloper,
          error: this.apiInfo.errorEnveloper,
        });
```

- [ ] **Step 7: 三框架 adapter bindRoute 接入 wrapWithEnvelope**

对 `packages/erest-express/src/index.ts`、`packages/erest-koa/src/index.ts`、`packages/erest-leizmweb/src/index.ts` 的 `bindRoute` 方法，统一改造：

找到 `const dispatch = compose(handlers as unknown as Middleware[]);`（各文件约 71-74 行），改为：

```ts
    const rawDispatch = compose(handlers as unknown as Middleware[]);
    const dispatch = envelopers
      ? wrapWithEnvelope(rawDispatch, envelopers)
      : rawDispatch;
```

并在 `bindRoute` 签名加 `envelopers?` 参数（对齐 Step 6 的接口）。导入 `wrapWithEnvelope`：

```ts
import { compose, wrapWithEnvelope } from "erest";
```

并在 `erest` 主包 `src/lib/index.ts` / `src/lib/adapters/index.ts` 导出 `wrapWithEnvelope`（确认 `adapters/index.ts` re-export 了 utils）。

- [ ] **Step 8: 运行 envelope 测试**

```bash
pnpm test:lib -- src/test/test-envelope.ts
```
Expected: PASS（3 个用例：成功包装 / 错误包装 / undefined 包装）。

- [ ] **Step 9: 全量回归（确认未破坏 v3.1 非 enveloper 模式）**

```bash
pnpm test:lib
```
Expected: 全绿（test-register-typed.ts 的 v3.1 用例——handler 调 reply——必须仍通过，验证向后兼容）。

> **若 test-register-typed.ts FAIL：** 检查 `wrapWithEnvelope` 在未注册 enveloper 时是否正确退化为原 dispatch（`if (!successEnveloper && !errorEnveloper) return dispatch;`）。v3.1 用例未调 `setResponseEnvelopers`，应走退化分支。

- [ ] **Step 10: 类型检查 + lint + 覆盖率**

```bash
pnpm typecheck && pnpm lint && pnpm test:cov
```
Expected: 全绿 + 覆盖率达标。

- [ ] **Step 11: 提交**

```bash
git add src/lib/index.ts src/lib/api.ts src/lib/adapters/types.ts src/lib/adapters/utils.ts packages/*/src/index.ts src/test/test-envelope.ts
git commit -m "feat(envelope): 全局 setResponseEnvelopers + registerTyped 强制 return（未注册时维持 v3.1 向后兼容）"
```

---

## Task 5: 测试 formatOutput 默认从 enveloper 推导

**Files:**
- Modify: `src/lib/index.ts`（`setResponseEnvelopers` 注册后，自动设 `formatOutputReverse` 默认值）
- Test: `src/test/test-envelope.ts`（新增：enveloper 模式下 success() 自动拆信封）

**背景：** one-api 当前要手写 `applyEnvelopeFormat`（format.ts）调 `setFormatOutput` 让测试脚手架识别信封。enveloper 注册后，测试的 `formatOutputReverse` 应自动从 `successEnveloper` 推导，消除手写桥接。

**设计：** `successEnveloper` 是 `data => {success:true, data}`，测试需反向 `{success:true, data} => [null, data]`。由于 enveloper 形态由用户定义（不一定是 `{success, data}`），**无法通用反向推导**。故采用约定：`setResponseEnvelopers` 注册时，若用户未单独调 `setFormatOutput`，则 `formatOutputReverse` 默认尝试「若响应体是 enveloper 输出形态（对象且含 success 字段），按 success 拆解；否则原样」。

> **简化决策：** 通用反向推导不可行（enveloper 形态自定义）。改为：**`setResponseEnvelopers` 接受可选的 `testUnwrapper`**，用户可显式提供测试拆信封函数；未提供时 `formatOutputReverse` 维持默认（原样返回）。one-api 侧提供 `testUnwrapper`（一行，比 format.ts 简单得多）。

- [ ] **Step 1: 写失败测试**

在 `src/test/test-envelope.ts` 新增用例：

```ts
describe("enveloper 模式下测试自动拆信封", () => {
  it("注册 testUnwrapper 后 success() 返回内层数据", async () => {
    const app = express();
    app.use(express.json());
    const apiService = lib({ basePath: "" });

    apiService.setResponseEnvelopers({
      success: (data: unknown) => ({ success: true, data }),
      error: () => ({ body: { success: false }, status: 500 }),
      testUnwrapper: (out: unknown): [Error | null, unknown] => {
        const o = out as { success?: boolean; data?: unknown; error?: { message?: string } };
        if (o && typeof o === "object" && "success" in o) {
          return o.success ? [null, o.data] : [new Error(o.error?.message ?? "fail"), null];
        }
        return [null, out];
      },
    });

    apiService.api
      .get("/unwrap-test")
      .group("Index")
      .title("unwrap")
      .registerTyped({ response: z.object({ id: z.number() }) }, async () => {
        return { id: 99 };
      });

    apiService.bind({ adapter: expressAdapter, router: app });
    apiService.initTest(app, "/tmp", "/tmp");

    const ret = await apiService.test.get("/unwrap-test").success();
    expect(ret).toEqual({ id: 99 });
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
pnpm test:lib -- src/test/test-envelope.ts
```
Expected: FAIL（`testUnwrapper` 不被接受 / success() 拿到的是 `{success:true, data:{id:99}}` 而非 `{id:99}`）。

- [ ] **Step 3: 实现 setResponseEnvelopers 接受 testUnwrapper**

修改 `src/lib/index.ts` 的 `setResponseEnvelopers` 签名（Task 4 Step 3 已添加），增加可选 `testUnwrapper`：

```ts
  public setResponseEnvelopers(envelopers: {
    success: (data: unknown, ctx: import("./adapters/types.js").Context) => unknown;
    error: (err: unknown, ctx: import("./adapters/types.js").Context) => { body: unknown; status: number };
    /** 可选：测试脚手架拆信封（setFormatOutput 的便捷入口，enveloper 模式下通常需要） */
    testUnwrapper?: (out: unknown) => [Error | null, unknown];
  }): void {
    this.apiInfo.successEnveloper = envelopers.success;
    this.apiInfo.errorEnveloper = envelopers.error;
    if (envelopers.testUnwrapper) {
      this.apiInfo.formatOutputReverse = envelopers.testUnwrapper;
    }
  }
```

- [ ] **Step 4: 运行确认通过**

```bash
pnpm test:lib -- src/test/test-envelope.ts
```
Expected: PASS。

- [ ] **Step 5: 全量回归**

```bash
pnpm test:lib && pnpm typecheck && pnpm lint
```
Expected: 全绿。

- [ ] **Step 6: 提交**

```bash
git add src/lib/index.ts src/test/test-envelope.ts
git commit -m "feat(envelope): setResponseEnvelopers 接受 testUnwrapper 便捷拆信封（替代手写 setFormatOutput）"
```

---

## Task 6: one-api phase2-server 同步适配验证

**Files（one-api worktree `.worktrees/phase2-server/`）:**
- Modify: `apps/server/src/api/instance.ts`
- Delete: `apps/server/src/api/format.ts`
- Modify/Delete: `apps/server/src/utils/response.ts`
- Modify: `apps/server/src/hooks.ts`
- Modify: `apps/server/src/routes/*.ts`（data / token / table / admin-data / admins / auth / data-schema）
- Modify: `apps/server/src/__tests__/helpers.ts`
- Modify: `apps/server/src/app.ts`

**背景：** erest 三块改进落地后，one-api 作为真实消费者同步适配，验证可用性 + 全部 e2e 测试绿。

**前置：** erest 已 build 并 link 到 one-api（one-api package.json 已用 `file:../../../../../node-erest` 本地依赖）。需先 `pnpm -r build`（erest）让 one-api 拿到新 dist。

- [ ] **Step 1: 构建 erest 新 dist**

```bash
cd /Users/yourtionguo/codes/open/node-erest
pnpm -r build   # 生成 dist/lib + 各子包 dist
```

- [ ] **Step 2: 重装 one-api 依赖（拉新 erest dist）**

```bash
cd /Users/yourtionguo/codes/open/one-api/.worktrees/phase2-server
pnpm install
```

- [ ] **Step 3: 改 instance.ts 声明 AppState + 注册 enveloper**

修改 `apps/server/src/api/instance.ts`：

```ts
import { createERest } from '@erest/leizmweb';
import { API_INFO, GROUPS } from './groups.js';
import type { CurrentAdmin, CurrentToken } from '../hooks.js';

/** 应用级 state 类型（before 钩子注入，handler 类型安全读取） */
interface AppState {
  currentToken?: CurrentToken;
  currentUser?: CurrentAdmin;
}

export const api = createERest<AppState>({
  info: API_INFO,
  groups: GROUPS,
  forceGroup: true,
});

// 全局响应信封（替代 utils/response.ts 的 ok/fail + 每处 reply.json(ok())）
api.setResponseEnvelopers({
  success: (data) => ({ success: true, data }),
  error: (err: unknown) => {
    const e = err as { statusCode?: number; code?: string; message?: string };
    return {
      body: { success: false, error: { code: e.code ?? 'INTERNAL_ERROR', message: e.message ?? '服务器内部错误' } },
      status: e.statusCode ?? 500,
    };
  },
  testUnwrapper: (out: unknown): [Error | null, unknown] => {
    const o = out as { success?: boolean; data?: unknown; error?: { code?: string; message?: string } };
    if (o && typeof o === 'object' && 'success' in o) {
      if (o.success) return [null, o.data];
      return [new Error(o.error ? `${o.error.code}: ${o.error.message}` : '请求失败'), null];
    }
    return [null, out];
  },
});
```

- [ ] **Step 4: 删除 format.ts，清理 response.ts**

```bash
rm apps/server/src/api/format.ts
```

`apps/server/src/utils/response.ts`：检查 `ApiResponse`/`ApiError` 类型是否被他处 import（如 hooks.ts）。若有，保留类型导出、删 `ok/fail` 函数；若无整个删除。先 grep：

```bash
grep -rn "from.*utils/response\|ApiResponse\|ApiError" apps/server/src/
```

按结果决定保留或删除。

- [ ] **Step 5: 改 hooks.ts 用 typed state**

`apps/server/src/hooks.ts`：所有 `ctx.state['currentToken']` → `ctx.state.currentToken`，`ctx.state['currentUser']` → `ctx.state.currentUser`（类型已由 AppState 锁定，去 `as`）。例如：

```ts
// 旧
ctx.state['currentToken'] = { ... } satisfies CurrentToken;
const token = ctx.state['currentToken'] as CurrentToken | undefined;

// 新
ctx.state.currentToken = { ... } satisfies CurrentToken;
const token = ctx.state.currentToken;  // CurrentToken | undefined，无需 as
```

- [ ] **Step 6: 改所有 routes/*.ts：reply.json(ok(x)) → return x**

逐文件改（data.ts / token.ts / table.ts / admin-data.ts / admins.ts / auth.ts / data-schema.ts）：

```ts
// 旧
registerTyped({ params: TableParam, ... }, async (req, reply) => {
  reply.json(ok(await engine().data.list(req.params.table, listOpts)));
});

// 新
registerTyped({ params: TableParam, ... }, async (req) => {
  return engine().data.list(req.params.table, listOpts);
});
```

要点：
- 删 `reply` 参数（enveloper 模式下 handler 是 `(req, ctx) => data`，不需 reply 时省略第二参数）
- `ok(x)` → `x`
- `reply.status(201).json(ok(x))` → `return x`（201 状态码丢失——若需保留，enveloper 模式下用 ctx，见下）

**保留状态码的处理：** create 类操作原 `reply.status(201)`。enveloper 模式下 handler 返回 data 后由 enveloper 包装，状态码默认 200。若必须 201，在 enveloper success 内无法区分——**决策：one-api 统一用 200**（信封已含 success 语义，201 与否不影响）。删所有 `reply.status(201)`。

- [ ] **Step 7: 改 auth.ts 的 register + 手写 z.parse 退化写法**

`auth.ts:45`（`/me`）和 `auth.ts:53`（`/password`）当前用 `register` + 手写 `z.object(...).parse(ctx.body)`。enveloper 模式下改回 `registerTyped`：

```ts
// /me（原 register + ctx.state['currentUser']）
auth.get('/me').title('当前管理员').before(requireAdmin(getSystemDb())).registerTyped({}, async (_req, ctx) => {
  const user = ctx.state.currentUser;
  if (!user) throw Errors.unauthorized();
  const admin = await store.findById(user.id);
  if (!admin) throw Errors.unauthorized();
  return toAdminVO(admin);
});

// /password（原 register + 手写 z.parse）
auth.put('/password').title('修改密码').before(requireAdmin(getSystemDb())).registerTyped(
  { body: z.object({ oldPassword: z.string(), newPassword: z.string().min(6) }) },
  async (req, ctx) => {
    const user = ctx.state.currentUser!;
    const admin = await store.findById(user.id);
    if (!admin || !comparePassword(req.body.oldPassword, admin.password_hash)) throw Errors.authInvalidCredentials();
    await store.updatePassword(admin.id, hashPassword(req.body.newPassword));
    await store.setMustChangePassword(admin.id, 0);
    return { success: true };
  },
);
```

- [ ] **Step 8: 改 z.object({}).catchall → z.anyObject()**

全局替换 `z.object({}).catchall(z.unknown())` → `z.anyObject()`（data.ts:67/79、admin-data.ts:60/69、data-schema.ts:47）。

- [ ] **Step 9: 改 app.ts 错误中间件简化**

enveloper 接管错误信封后，`app.ts` 的错误中间件大幅简化（仅留兜底 log + 兜底信封给非 erest 路由）：

```ts
app.use('/', (ctx, err) => {
  if (!err) { ctx.next(); return; }
  const e = err as Error & { statusCode?: number };
  log.error('未捕获错误: %s', e.stack ?? e.message);
  if (!ctx.response.headersSent) {
    ctx.response.status(e.statusCode ?? 500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } });
  }
});
```

- [ ] **Step 10: 改 __tests__/helpers.ts**

删 `applyEnvelopeFormat` 调用（enveloper 已含 testUnwrapper）：

```ts
// 删掉这行
applyEnvelopeFormat(api);
```

确认 helpers.ts 的 express 测试实例也走 enveloper（testUnwrapper 已在 createERest 时设——但 helpers.ts 自建 api 实例，需同样注册 enveloper）。抽取一个共享 `setupEnveloper(api)` 函数给 instance.ts 和 helpers.ts 复用，或 helpers.ts 直接复用 instance.ts 的 api 单例。**决策：helpers.ts 复刻 enveloper 注册逻辑（测试要独立实例，不能复用全局单例）。**

- [ ] **Step 11: 类型检查 + 测试**

```bash
cd /Users/yourtionguo/codes/open/one-api/.worktrees/phase2-server
pnpm --filter @1api/server typecheck
pnpm --filter @1api/server test
```
Expected: typecheck 无错误 + 全部 e2e 测试绿（auth-admin / data / db-system / list-query / utils-token）。

> **若 FAIL：** 逐个排查。常见坑：①某个 handler 漏改还残留 `reply.json(ok())` ②typed state 的 `satisfies` 写错 ③enveloper 模式下 handler 还用了 `reply`（类型应报错拦截）。

- [ ] **Step 12: 全量回归 + lint**

```bash
pnpm -r typecheck && pnpm -r test && pnpm lint
```
Expected: 全绿。

- [ ] **Step 13: 提交（one-api worktree）**

```bash
git add apps/server/src/
git commit -m "refactor(server): erest v3.2 适配——typed state + envelope return + z.anyObject()

- instance.ts: createERest<AppState>() + setResponseEnvelopers
- 删 format.ts + utils/response.ts 的 ok/fail
- 全量 reply.json(ok(x)) → return x
- ctx.state['x'] as T → ctx.state.x（typed）
- auth.ts register+z.parse 退化 → registerTyped
- z.object({}).catchall → z.anyObject()"
```

---

## 完成标准（Definition of Done）

- [ ] erest 侧：Task 1-5 全部 commit，`pnpm test:lib` + `pnpm test:cov` + `pnpm typecheck` + `pnpm lint` 全绿，覆盖率达标
- [ ] one-api 侧：Task 6 commit，`pnpm -r test` + `pnpm -r typecheck` + `pnpm lint` 全绿
- [ ] 向后兼容验证：erest 既有测试（test-register-typed.ts 的 v3.1 reply 模式用例、test-test.ts 的非 enveloper 用例）全部仍绿
- [ ] MIGRATION.md 登记 breaking change（registerTyped enveloper 模式下签名从 `(req, reply)` 变 `(req, ctx)` 且必须 return）—— 在 erest 仓库根 `MIGRATION.md` 追加一节

## MIGRATION.md 追加内容（最后一步）

在 `node-erest/MIGRATION.md` 末尾追加：

```markdown
## v3.2 — 类型安全 state + 全局响应信封 + 便利 schema

### Breaking（仅当启用新特性时）
- `setResponseEnvelopers()` 注册后，`registerTyped` handler 签名从 `(req, reply) => void` 变为 `(req, ctx) => data`（必须 return data，不再调 reply）。未注册 enveloper 时维持 v3.1 行为。
- `ctx.state` 类型由 `ERest<T, Raw, State>` 的 State 泛型驱动（默认 `Record<string, unknown>`，存量代码不变）。

### 新增（非 breaking）
- `z.anyObject()`：等价 `z.object({}).catchall(z.unknown())`
- `success<T>()`：测试返回类型可从 response schema 推导（默认 unknown）
- `setResponseEnvelopers({ success, error, testUnwrapper })`
```
