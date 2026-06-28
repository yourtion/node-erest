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

## 3.0.1 — 文档与发布修复

3.0.1 是 **3.0 的补丁版本**，无运行时 breaking change，修复发布缺陷与文档错误：

### 1. 发布包 peerDependencies 的 workspace 协议泄漏（P1，阻塞）

3.0.0 发布到 npm 的子包（`@erest/express|koa|leizmweb`）的 `peerDependencies.erest` 带着未替换的
`"workspace:^"`，导致 `npm install` 报 `EUNSUPPORTEDPROTOCOL`（pnpm publish 不替换 peerDependencies
里的 workspace 协议）。3.0.1 新增 `scripts/publish.mjs` 发布脚本：发布前把所有子包
package.json 里的 workspace 协议替换为实际版本号，publish 后还原。发布命令改为
`npm run publish:all`。

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
推荐版本。已验证 Express 5 下 GET/POST/参数校验/错误传递均正常。
**注意**：Express 5 改变了子 router 内部错误的传播语义，router 级错误中间件可能捕获不到
erest 抛出的校验错误，请改用 **app 级**错误中间件兜底。

### 6. 其他文档/配置修正

- `tsconfig.json` 移除 `baseUrl`（NodeNext 下已废弃，触发 TS5101 警告）。
- README 补充 `@types/node` 安装说明与 `tsconfig.json` 示例（P9）。
- README 补充 @leizm/web `component.bodyParser.urlencoded({ extended: true })`（P12，消除
  body-parser deprecated 警告）。
- README 补充 `basePath` 仅用于文档生成、不作为路由前缀的说明（P6）。
- README 补充 `koa-router` → `@koa/router` 可作为 API 兼容替代的说明（P11）。

