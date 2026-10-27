# 迁移指南

[返回首页](README.md) · [使用指南](guides/api.md) · [贡献指南](CONTRIBUTING.md)

按版本倒序列出升级动作与可见行为变化。使用说明见 `guides/`，开发检查和发布操作分别见
[贡献指南](CONTRIBUTING.md)与[发布流程](RELEASING.md)。

## v3.2.5 — 文档源码位置（#196，issue #5）

- Markdown 展示注册路由的相对源码路径。
- 公开文档数据、doc.json 和 all.json 仅输出 sourceFile.relative；内部 absolute 保留供调试使用。
- 五包版本统一为 3.2.5，最终与其余能力一并发布。

## v3.2.4 — SDK 路径参数兜底（#195，issue #27）

- 未声明 params schema 时，Axios SDK 从路由提取路径参数；数字和下划线参数名与请求插值使用同一规则。
- 保留已修复的模板插值，生成的 ESM SDK 可直接导入并发出带实际参数值的请求。
- 五个公开包版本统一为 3.2.4；最终整合 OpenAPI 能力后统一发布新版本。

## v3.2.3 — 生成物、测试工具与发布修复

无新增迁移要求。使用生成物的项目应重新生成 SDK 与文档：

- Axios 路径参数恢复模板插值；Swagger 转换全部路径参数并保留 POST body 的必填字段。
- Markdown 正确显示 Zod 4 数组、枚举及 `0` / `false` 默认值，省略缺失的 input 示例。
- TestAgent 保留多个 Set-Cookie，支持流式附件内容；GET/DELETE 携带附件时提前报错。
- 修复 ESM 下文档源码位置解析；修改错误 code 后，旧 code 可复用，新 code 冲突会立即报错。
- 五个发布包统一为 `3.2.3`，子包补齐发布元数据；自动发布流程见 [RELEASING.md](RELEASING.md)。

## v3.2.2 — 返回结果文档

Swagger 的 `responses.200.schema` 展示声明的 response；Postman 为声明了 response 的接口
生成占位响应示例。重新生成文档即可，不影响运行时路由与校验。

## v3.2.1 — Zod peer dependency 与原生响应

**必须由宿主项目安装 Zod 4**，它已从硬依赖移到 peer dependency：

```bash
npm install zod@^4
```

避免在宿主和 erest 间使用不同 Zod 副本；适配器子包不直接依赖 Zod。

- 新增 `ctx.reply.markSent()`：在成功响应包装器启用时，手动通过 raw 写完响应后调用它，跳过自动包装。
- 修复 LeizmWeb 的 `ctx.reply.send(text)`，使用原生 `end()` 输出纯文本。
- 测试工具 `.input()` 的归属为 GET/DELETE → query，POST/PUT/PATCH → body；DELETE 输入建议声明在 query 中。

## v3.2.0 — Handler 签名、State 与响应包装

**所有 `registerTyped` handler 的第二参数由 reply 改为 ctx**，已有 handler 也需调整：

```diff
- (req, reply) => reply.json(data)
+ (req, ctx) => ctx.reply.json(data)
```

- `ctx.state` 可通过 `createERest<State>()` 推导。`State` 使用 `type` 别名，满足 `Record<string, unknown>` 约束。
- `setResponseEnvelopers({ success, error, testUnwrapper })` 启用 return 模式；未配置时继续手动调用 `ctx.reply`。
- 新增 `z.anyObject()` / `zAnyObject`，接受动态字段对象。
- TestAgent 的 `success<T>()` 可标注返回类型。

用法见 [Handler 与响应](guides/api.md#handler-与响应)和 [API 测试](guides/testing.md)。

## v3.1.0 — Raw 与适配器工厂

建议将裸构造器改为适配器的工厂，以推导原生上下文类型：

```diff
- import ERest from 'erest';
- const api = new ERest(options);
+ import { createERest } from '@erest/express';
+ const api = createERest(options);
```

Koa、LeizmWeb 使用各自子包的同名工厂。裸 `new ERest()` 仍保留，但 Raw 默认为 `unknown`。

- `ctx.reply.raw` 提供框架原生对象，cookie、重定向和流式响应遵循宿主语义。
- `Reply.status()` 返回类型收紧为 `this`；自定义 Reply 实现需保持链式返回。
- 新增可选的 `defaultErrorFormatter()`，在应用级错误中间件中调用，不自动改变错误响应。

原生对象形态和错误处理示例见[框架接入](guides/adapters.md)。

## v3.0.1 — 安装与框架兼容

- 修复发布子包中泄漏的 `workspace:^` peer 协议；遇到 `EUNSUPPORTEDPROTOCOL` 时升级子包。
- `info.version` 类型由 `Date` 修正为 `string`。
- Express 支持 4/5，并归一化缺失 body；错误处理中间件应放在 app 级、路由之后。
- Koa 可选 `@koa/router` 13 或 `koa-router` 13；新项目推荐前者。
- 文档入口为 `api.genDocs(dir, false)`，第二参数表示立即生成，应用须先创建目录。
- `info.basePath` 只影响文档与 SDK URL，实际挂载前缀由应用配置。

## v3.0.0 — Zod 与插件化适配器

### Schema 改用 Zod

旧 ISchemaType Record 定义方式和 `.required()` 移除，字段默认必填，可选字段显式 `.optional()`：

```diff
- api.body({ name: { type: 'String' }, age: { type: 'Integer' } }).required(['name'])
+ api.body(z.object({ name: z.string(), age: z.number().int().optional() }))
```

| 旧声明 | Zod 写法 |
| --- | --- |
| String / Integer / Number | `z.string()` / `z.number().int()` / `z.number()` |
| Boolean | `z.boolean()` |
| ENUM | `z.enum(['a', 'b'])` |
| Array of String | `z.array(z.string())` |
| TrimString / Email | `z.string().trim()` / `z.string().email()` |
| Date | `z.coerce.date()` |

query 通常是字符串，数字使用 `z.coerce.number()`；范围等约束显式写 `.min()` / `.max()`。
`zodTypeMap` 仍导出，其部分别名带字符串转换，与上表并非严格等价。
`requiredOneOf(['email', 'phone'])` 保留。

以下公开校验入口已移除，独立校验直接调用 `schema.parse(input)`：
`createSchema`、`paramsChecker`、`schemaChecker`、`responseChecker`、`apiParamsCheck`、`schema.createZodSchema`。
错误信息统一由 Zod issues 生成，不再保证旧类型名后缀。

### 绑定改用适配器

安装对应的 `@erest/express`、`@erest/koa` 或 `@erest/leizmweb`，使用唯一绑定入口 `bind()`：

```diff
- api.bindRouter(router, api.checkerExpress)
+ api.bind({ adapter: new ExpressAdapter(), router })

- api.bindRouterToApp(app, express.Router, api.checkerExpress)
+ api.bind({ adapter: new ExpressAdapter(), app, router: express.Router })
```

`bindKoaRouterToApp`、旧 checker 属性和 `framework` 字符串分发一并移除。
`register()` / `define()` handler 使用标准 `(ctx, next)`；`registerTyped()` 的当前签名见 v3.2.0。
完整绑定代码见[框架接入](guides/adapters.md)。

### 扩展与内部访问

`privateInfo` 移除。适配器、文档和测试扩展使用 `getError()`、`getDocsView()`、`getTestView()`、
`getMockHandler()` 等受控访问器；这些 `@internal` 入口不作为应用公开 API。
新增 hooks 为同步观察者，异常不影响主流程；鉴权等控制流使用 before/middleware。
架构约定见 [AGENTS.md](AGENTS.md)，handler 骨架工具见 [@erest/gen](packages/erest-gen/README.md)。
