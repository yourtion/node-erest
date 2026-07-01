# 迁移指南：erest v3.0

本版本对参数 schema 体系做了破坏性重构，并把参数校验改为 `bind()` 阶段预编译。

## Stage 1 — Schema 统一（Zod 唯一）

把参数 schema 体系从双轨（ISchemaType + 原生 Zod）收敛为 **Zod 唯一**。

### 1. ISchemaType Record 定义方式移除

```diff
- api.body({ name: { type: "String", required: true }, age: { type: "Integer" } })
+ api.body(z.object({ name: z.string(), age: z.number().int() }))
```

`type` 字符串到 Zod 的映射见 `zodTypeMap`（仍导出）。常用对照：

| ISchemaType | Zod 等价 |
|-------------|---------|
| `{ type: "String" }` | `z.string()` |
| `{ type: "Integer" }` | `z.number().int()` |
| `{ type: "Number", params: { min: 0, max: 100 } }` | `z.number().min(0).max(100)` |
| `{ type: "Boolean" }` | `z.boolean()` |
| `{ type: "ENUM", params: ["a","b"] }` | `z.enum(["a","b"])` |
| `{ type: "Array", params: "String" }` | `z.array(z.string())` |
| `{ type: "TrimString" }` | `z.string().trim()` |
| `{ type: "Email" }` | `z.string().email()` |
| `{ type: "Date" }` | `z.coerce.date()` |

> Query string 中的值是字符串，若希望自动转数字/日期，用 `z.coerce.number()` / `z.coerce.date()`。
>
> 上表为**语义近似**对照。`zodTypeMap` 的实际实现（见 `params.ts`）为兼容 query 字符串，
> `Integer`/`Number`/`Boolean` 等用 `z.union` + `transform`（接受字符串并自动转换），
> 且不再处理旧 ISchemaType 的 `params: { min, max }` 等选项——需在 Zod schema 里显式写
> `.min()` / `.max()`。文档生成时仍可用这些别名名（`erest.type.register`）。

### 2. required() 移除

必填由 Zod schema 是否 `.optional()` 表达：

```diff
- api.body({ name: { type: "String" } }).required(["name"])
+ api.body(z.object({ name: z.string() }))  // 非 optional 即必填
```

### 3. requiredOneOf() 保留

多选一必填语义保留（无完美 Zod 等价）：

```typescript
api.requiredOneOf(["email", "phone"]); // email/phone 至少一个
```

### 4. 公开校验方法移除

以下内部方法不再公开（校验已由 `registerTyped` / `bind()` 内部预编译完成）：

- `erest.createSchema()`
- `erest.paramsChecker()`
- `erest.schemaChecker()`
- `erest.responseChecker()`
- `erest.apiParamsCheck()`
- `erest.schema.createZodSchema()`

如需独立校验，直接用 Zod 的 `schema.parse(input)`。

### 5. 错误消息简化

校验失败消息从 ISchemaType 专属分支统一为 Zod issue 派生：

- 缺失必填：`missing required parameter 'field'`（不变）
- 类型错误：`incorrect parameter 'field' should be valid`（去掉了类型后缀，如原 `should be valid Integer`）

### 6. 性能提升

参数校验在 `bind()` 阶段预编译为热路径零分配闭包，基准测试显示校验吞吐约 **2x 提升**。

## Stage 2 — 架构重组

拆解 ERest 上帝类，删除 deprecated 方法，修复封装边界。

### 1. bind() 成为唯一绑定入口（插件化 adapter）

核心包不再内置三框架适配器实现，改为独立子包提供。`bind()` 接收 `adapter` 实例（插件形式）：

```diff
- apiService.bindRouter(router, apiService.checkerExpress)
+ import { ExpressAdapter } from "@erest/express";
+ apiService.bind({ adapter: new ExpressAdapter(), router })

- apiService.bindRouterToApp(app, express.Router, apiService.checkerExpress)  // forceGroup
+ apiService.bind({ adapter: new ExpressAdapter(), app, router: express.Router })

- apiService.bindKoaRouterToApp(app, KoaRouter, apiService.checkerKoa)
+ import { KoaAdapter } from "@erest/koa";
+ apiService.bind({ adapter: new KoaAdapter(), app, router: KoaRouter })

- apiService.bindRouterToApp(app, Router, apiService.checkerLeiWeb)
+ import { LeizmWebAdapter } from "@erest/leizmweb";
+ apiService.bind({ adapter: new LeizmWebAdapter(), app, router: Router })
```

| 子包 | 安装 | 适用框架 |
|------|------|---------|
| `@erest/express` | `pnpm add erest @erest/express express` | Express 4 |
| `@erest/koa` | `pnpm add erest @erest/koa koa koa-router` | Koa 3 |
| `@erest/leizmweb` | `pnpm add erest @erest/leizmweb @leizm/web` | @leizm/web 2 |

自定义/第三方适配器：实现 `FrameworkAdapter` 接口（从 `erest` 导入），`name` 为任意字符串。

`checkerExpress` / `checkerKoa` / `checkerLeiWeb` 属性与内置 `framework` 字符串分发同步移除。

### 2. privateInfo 移除

`erest.privateInfo` 不再暴露。改用受控访问器：

| 旧（privateInfo） | 新（受控访问器） |
|-------------------|-----------------|
| `.error` | `.getError()` |
| `.groups` | `.getDocsView().groups` |
| `.groupInfo` | `.getDocsView().groupInfo` |
| `.info` | `.getTestView().info` |
| `.app` | `.getTestView().app` |
| `.mockHandler` | `.getMockHandler()` |

Stage 3 新增的 `@internal` 访问器（非 privateInfo 替代，供 hook 装配用）：

| 访问器 | 用途 |
|--------|------|
| `.getHooks()` | 获取生命周期 hooks 配置（adapter 装配 dispatch 时读） |
| `.hasHooks()` | hooks 是否非空（零开销裁剪判断） |

> 这些访问器标记 `@internal`，仅供 adapter/docs/test 内部使用，非公开 API。

## Stage 3 — 可观测性 Hook + AI 友好

### 1. 生命周期 Hook

`new ERest({ hooks })` 支持注册同步观察者，不参与控制流：

```typescript
const api = new ERest({
  groups: { user: "用户" },
  hooks: {
    onRequest: (ctx) => { /* 注入 traceId、开始计时 */ },
    onValidate: (ctx, result) => { /* 记录校验耗时 */ },
    onError: (ctx, err) => { /* 结构化错误日志（保留 ERestError code） */ },
    onResponse: (ctx) => { /* 结束计时、状态码 */ },
  },
});
```

- 无订阅者时 `bind()` 装配的 dispatch 裁剪掉 hook 调用，**热路径零开销**。
- hook 异常被吞掉（观察者语义，不影响主流程）。

### 2. AGENTS.md 架构导航

新增 `AGENTS.md`，面向修改者（人与 AI）：目录树、"改 X 去 Y"决策树、约定、常见任务套路。

### 3. erest-gen codegen

独立子包 `@erest/gen`（CLI 命令名 `erest-gen`），从 Zod schema 生成 handler 骨架：

```bash
npx erest-gen handler --from ./schemas/user.ts --group user --out ./handlers/user.ts
```

---

## 3.1.0 — reply.raw 逃生舱 + 框架能力对齐

3.1.0 是 **3.0 的 minor 版本**，引入框架原生能力逃生舱与统一错误格式器，**非破坏性变更**
（现有 `new ERest()` 代码零改动，examples 测试全绿）。

### 1. `reply.raw` 逃生舱

`Reply` 接口新增 `readonly raw: Raw` 字段（`status()` 返回类型从 `Reply` 收紧为 `this`）。
registerTyped 的 handler 通过 `reply.raw` 访问框架原生对象，解决 setCookie / redirect /
stream / 文件下载等底层能力此前完全无法访问的问题。

`Context.reply` 仍保持 `Reply<unknown>`——before/middleware/hook 不暴露 raw，仅 handler 拿到
（避免 onError hook 与 re-throw 语义冲突的双重写入）。

### 2. 全自动 Raw 泛型 + `createERest()` 工厂

`ERest<T, Raw>` / `API<T, Raw>` / `IGroup<T, Raw>` / `genSchema<T, Raw>` 全链路透传 Raw，
registerTyped handler 的 reply 类型随之用 `Reply<Raw>`。子包工厂在**构造时**锁定 Raw：

```diff
- const api = new ERest({ info, groups, forceGroup: true });
+ import { createERest } from "@erest/express";   // 或 @erest/koa / @erest/leizmweb
+ const api = createERest({ info, groups, forceGroup: true });  // reply.raw 零标注强类型
```

- `createERest()` 由三子包分别导出（`@erest/express|koa|leizmweb`），各自返回
  `ERest<Middleware, ExpressRaw|KoaRaw|LeizmWebRaw>`，handler 内 `reply.raw` 自动推导。
- 裸 `new ERest()` 已标记 `@deprecated`（过渡期保留，Raw 默认 `unknown`，`reply.raw` 需断言）。
- 三框架 adapter 在 `createXxxReply` 时把闭包已有的原生对象挂到 `raw`（热路径零额外分配，
  Koa/leizmweb 仅多挂引用，Express 多一个 `{req,res}` 字面量）。

### 3. 可选统一错误格式器 `defaultErrorFormatter`

新增工具函数（不改 adapter、不破坏 commit 727b2c0 的 re-throw 对齐），用户在 app 级错误中间件
调用以统一三框架错误响应体：

```typescript
import { defaultErrorFormatter } from "erest";
// Express
app.use((err, _req, res, _next) => {
  const { status, body } = defaultErrorFormatter(err);  // { status, body: { error, code } }
  res.status(status).json(body);
});
```

### 4. 能力对齐：仅 `raw` + 文档速查表

cookie/stream/redirect/headersSent 等原生能力差异不再逐个补 Reply 方法，统一通过 `reply.raw`
暴露，并在 README 提供「三框架原生能力速查表」标注各框架语义差异。错误处理（re-throw 语义）
已在 3.0.x 对齐，本次不动。

> raw 的头部/cookie 操作应在 `reply.json()`/`reply.send()` 之前调用（HTTP 头先于体发送）。

---

## 3.0.1 — 文档与发布修复

3.0.1 是 **3.0 的补丁版本**，无运行时 breaking change，修复发布缺陷与文档错误：

### 1. 发布包 peerDependencies 的 workspace 协议泄漏（P1，阻塞）

3.0.0 发布到 npm 的子包（`@erest/express|koa|leizmweb`）的 `peerDependencies.erest` 带着未替换的
`"workspace:^"`，导致 `npm install` 报 `EUNSUPPORTEDPROTOCOL`。

根因是 3.0.0 发布时未走 `pnpm publish`（或用了会跳过协议替换的方式）。`pnpm publish -r` 本身会
**自动替换所有依赖类型（含 peerDependencies）的 workspace 协议**——已在 pnpm 9.15.9 实测确认：
`pnpm pack` 产出的子包 manifest 中 `peerDependencies.erest` 被正确替换为 `^3.0.1`。

3.0.1 回归标准发布流程：新增 `npm run publish`（= `pnpm publish -r --no-git-checks --access public`），
由 `prepublishOnly` 钩子保证发布前完成 format + 全量测试（含 build）。`npm run publish:dry`
可预览将要发布的包与 manifest，不实际发布。

### 2. README handler 签名修正（P2/P7）

3.0.0 的 README 在 Express / Koa / @leizm/web 三处接入示例中使用了错误的 handler 签名
（Express 风格 `(req, res)`、Koa `ctx.body = ...`、@leizm/web `ctx.response.json()`）。
实际所有框架下 `register`/`define` 的 handler 均为标准化 `(ctx, next)`，`ctx` 是 erest 内部
上下文（有 `reply`/`$params`/`$validated`），响应统一走 `ctx.reply.json()`。
3.0.1 README 全面改为**主推 `registerTyped`（`(req, reply)` 框架无关签名）**，并补充
`register` 与 `registerTyped` 的区别表。

### 3. 文档生成方法名修正（P3）

README 原写的 `api.docs.generateDocs({...})` 方法不存在。正确入口是构造 ERest 时的
`docs` 配置开关 + `api.genDocs(savePath)`。`genDocs()` 默认 `onExit=true`（进程退出时写盘），
需立即产出传 `genDocs('./docs/', false)`。

### 4. `version` 字段类型修正（P4）

`IApiOptionInfo.version` 从 `Date` 改为 `string`（语义版本号字符串，如 `"1.0.0"`）。
此前类型定义与所有示例（README / examples）均用字符串不一致，导致 TS 编译报错。

### 5. Express 5 兼容（P5）

`@erest/express` 的 peer dep 从 `express@^4.0.0` 扩展为 `^4.0.0 || ^5.0.0`，Express 5 设为
推荐版本，仓库 devDep 与测试套件已升级到 Express 5.2.1（测试直接跑在 Express 5 上）。

**修复的兼容 bug**：Express 5 对未匹配的 content-type（如 multipart/form-data）不再初始化
`req.body = {}`，而是保持 `undefined`；Express 4 会初始化为 `{}`。erest 的 `compileValidate`
对 `body === undefined` 会跳过 body 校验——这导致 Express 5 下带 multipart 上传、又定义了
body schema 的接口，body 校验被**静默跳过**（缺字段不报错）。修复方式：Express adapter 构造
Context 时把 `req.body ?? {}` 归一化为 `{}`，恢复 Express 4 行为，确保 body schema 校验照常执行。

**注意**：Express 5 改变了子 router 内部错误的传播语义，router 级错误中间件可能捕获不到
erest 抛出的校验错误，请改用 **app 级**错误中间件兜底。

### 6. 其他文档/配置修正

- `tsconfig.json` 移除 `baseUrl`（NodeNext 下已废弃，触发 TS5101 警告）。
- README 补充 `@types/node` 安装说明与 `tsconfig.json` 示例（P9）。
- README 补充 @leizm/web `component.bodyParser.urlencoded({ extended: true })`（P12，消除
  body-parser deprecated 警告）。
- README 补充 `basePath` 仅用于文档生成、不作为路由前缀的说明（P6）。

### 7. Koa 路由库兼容（P11）

`koa-router` 整包已停止维护并标记 deprecated（npm 安装时 warning：「Please use @koa/router
instead」）。`@koa/router` 是官方维护的继任包，API 与 koa-router **完全一致**（实测
`@koa/router@15 + koa@3.2 + erest` 全功能正常，含 forceGroup 的 `new Router({prefix})` 构造）。

`@erest/koa` 的 peer dep 从 `koa-router@^13.0.0` 扩展为**同时声明两者**并标记 optional：

```jsonc
{
  "peerDependencies": {
    "koa-router": "^13.0.0",  // 旧，optional
    "@koa/router": "^13.0.0"  // 新，推荐，optional
  },
  "peerDependenciesMeta": {
    "koa-router": { "optional": true },
    "@koa/router": { "optional": true }
  }
}
```

用户装 `koa-router` 或 `@koa/router` 任一即可，均无 missing peer warning。新项目建议直接用
`@koa/router`。erest 仓库内部测试仍用 koa-router（开发环境 deprecated warning 无害），不影响
发布的 peer 声明。


## v3.2 — 类型安全 state + 全局响应信封 + 便利 schema

### Breaking（仅当启用新特性时）

- **registerTyped handler 第二参数从 `reply` 统一为 `ctx`**：签名 `(req, reply) => void` 变为 `(req, ctx) => data`。`ctx` 即 `Context<State, Raw>`，含 `ctx.reply`（原 reply 能力）+ `ctx.state`（typed）。存量 handler `(req, reply) => reply.json(x)` 须改为 `(req, ctx) => ctx.reply.json(x)`。
- **ctx.state 类型由 `ERest<T, Raw, State>` 的 State 泛型驱动**：默认 `Record<string, unknown>`（存量代码不变）。启用 `createERest<MyState>()` 后，`ctx.state` 收紧为 MyState——**State 须用 `type` alias 定义**（不能用 `interface`，否则不满足 `Record<string, unknown>` 约束）。

### 新增（非 breaking）

- **`z.anyObject()`**：等价 `z.object({}).catchall(z.unknown())`，挂在 erest 导出的 `z` 上（也具名导出 `zAnyObject` 常量）。供「动态字段 body」场景使用。
- **`success<T>()`**：TestAgent 测试方法泛型化，返回类型可从 response schema 推导（`.get<UserVO>(path).success<UserVO>()`）；默认 `unknown` 向后兼容。
- **`setResponseEnvelopers({ success, error, testUnwrapper })`**：注册后 registerTyped handler 进入「return 模式」——handler 只 `return data`，框架用 success enveloper 自动包装成响应体；抛错用 error enveloper 包装成 `{body, status}`。未注册时维持 v3.1 行为（handler 调 `ctx.reply` 写响应）。`testUnwrapper` 供测试脚手架拆信封（便捷入口，等价 `setFormatOutput`）。


## v3.2.1 — enveloper 逃生舱 + @leizm/web send 修复 + 测试文档

### 新增（非 breaking）

- **`Reply.markSent()`**：enveloper 模式下，`registerTyped` handler 若需返回非 JSON 响应（CSV / 文件下载 / 流式）并经 `ctx.reply.raw` 手动写完响应，调用 `ctx.reply.markSent()` 告知 enveloper 跳过自动包装。否则 enveloper 会在 handler return 后再用 `successEnveloper` 包一层 `reply.json()`，可能覆盖已发送响应或触发「headers already sent」（各框架行为不一）。三 adapter（express/koa/leizmweb）的 `reply` 实现统一维护 `__sent` 标记：`json()`/`send()`/`markSent()` 均置位，`wrapWithEnvelope` 综合判断。不调 `markSent` 的存量 handler 行为不变。

### 修复

- **`@erest/leizmweb` `reply.send` 映射错误导致纯文本响应 404**：`createLeiReply.send` 此前调 `ctx.response.send()`，但 `@leizm/web` 的 response 没有 `send` 方法（仅有 `end/json/file`）。可选链 `leiRes.send?.()` 静默跳过 → 响应体未写 → 框架 final handler 返回 404。修正为映射到 `end(body)` + 补 `text/plain` content-type。**影响面**：`@leizm/web` adapter 下任何用 `ctx.reply.send(文本)` 的路由此前都会 404（用 `reply.json` 的路由不受影响）。

### 文档

- **测试引擎 `.input()` 的方法归属约定显式化**：GET/DELETE 归 query、POST/PUT/PATCH 归 body。注册 DELETE 路由时 schema 必须从 `query` 读参数（HTTP DELETE body 有争议，fetch/浏览器/代理普遍不传递）。README 与 `agent.ts` JSDoc 同步补充。

### Breaking

- **`zod` 从 `dependencies` 改为 `peerDependencies`**：作为 schema 校验库，erest 不应硬钉死 zod 版本，应由宿主项目统一提供。此前 erest 把 `zod@^4.0.5` 列为 hard dependency，导致任何 link/依赖 erest 的项目出现两份 zod 副本（erest 自带的 + 宿主的），TS 因 zod 版本字面量标记不同而报类型不兼容。**迁移**：宿主项目须在自身 `dependencies` 显式声明 `zod`（版本 `^4.0.0`）。adapter 子包（`@erest/express` 等）不直接依赖 zod，无需改动。


## v3.2.4 — Markdown 文档展示源码位置（issue #5）

### 新增（非 breaking）

- **Markdown 文档在每个 API 标题块下输出源码位置**：`sourceFile`（含 `relative`/`absolute`，由 `getCallerSourceLine` 在路由注册时解析 Error.stack 采集）此前已在 API 构造时记录，但未纳入 `DOC_FIELD`，文档生成器拿不到。现将其加入 `DOC_FIELD`，并在 Markdown 的「请求地址」行下方输出 `源码位置：\`<relative>\``，便于从文档快速定位到定义代码。无 `sourceFile` 时不输出该行，行为与之前一致。
