# 框架与 ESM

[返回首页](../README.md) · [API 定义](api.md)

## 适配器

| 包 | 工厂与适配器 | 框架 |
| --- | --- | --- |
| `@erest/express` | `createERest` / `ExpressAdapter` | Express 4、5 |
| `@erest/koa` | `createERest` / `KoaAdapter` | Koa 3，`@koa/router` 13 或 `koa-router` 13 |
| `@erest/leizmweb` | `createERest` / `LeizmWebAdapter` | @leizm/web 2 |
| `@erest/h3` | `createERest` / `H3Adapter`（或 `h3Adapter`） | H3 ^2.0.8 |

每个工厂创建的实例都使用相同的 [API 定义方式](api.md)，并推导该框架的 `ctx.reply.raw` 类型。
以下绑定片段假定 `api` 已创建并注册路由，原生错误边界 `createErrorHandler` 从对应适配器包导入。配置错误信封后再创建错误边界。

## Express

```javascript
import express from 'express';
import { ExpressAdapter, createErrorHandler } from '@erest/express';

const app = express();
app.use(express.json());
api.bind({ adapter: new ExpressAdapter(), router: app });
app.use(createErrorHandler(api));
app.listen(3000);
```

错误处理中间件放在 app 级、路由绑定之后。需要表单时，再添加
`express.urlencoded({ extended: true })`。

## Koa

```javascript
import Koa from 'koa';
import Router from '@koa/router';
import bodyParser from 'koa-bodyparser';
import { KoaAdapter, createErrorHandler } from '@erest/koa';

const app = new Koa();
app.use(createErrorHandler(api)); // 必须在 bodyParser 和 routes 前
app.use(bodyParser());
const router = new Router();
api.bind({ adapter: new KoaAdapter(), router });
app.use(router.routes()).use(router.allowedMethods());
app.listen(3000);
```

也可使用 `koa-router` 13。框架路由库和 body parser 由应用安装，见首页[安装命令](../README.md#安装)。

## @leizm/web

```javascript
import { Application, Router, component } from '@leizm/web';
import { LeizmWebAdapter, createErrorHandler } from '@erest/leizmweb';

const app = new Application();
app.use('/', component.bodyParser.json());
const router = new Router();
api.bind({ adapter: new LeizmWebAdapter(), router });
app.use('/', router);
app.use('/', createErrorHandler(api));
app.server.listen(3000);
```

需要表单时，添加 `component.bodyParser.urlencoded({ extended: true })`。

## H3

以下是可运行的 H3 v2 示例（Node.js >=20.19），不需要额外 body parser：

```javascript
import { createServer } from 'node:http';
import { H3 } from 'h3';
import { toNodeHandler } from 'h3/node';
import { z } from 'erest';
import { createERest, h3Adapter, createErrorHandler } from '@erest/h3';

const api = createERest({ groups: { users: '用户' } });
const app = new H3({ onError: createErrorHandler(api) });
api.api.post('/users').group('users').registerTyped(
  { body: z.object({ name: z.string().min(1) }) },
  (req, ctx) => ctx.reply.status(201).json({ name: req.body.name }),
);
api.bind({ adapter: h3Adapter, router: app });
createServer(toNodeHandler(app)).listen(3000);
```

`H3Adapter` 和单例 `h3Adapter` 等价。只支持 H3 v2；v1 的 `createApp/createRouter` 不适用。
声明 body schema 时，适配器通过 H3 `readBody()` 解析 JSON 或 URL-encoded；缺少请求体按 `{}` 校验，
非法 JSON 进入错误处理/错误信封。未声明 body schema 时不读取请求流，可用 `ctx.reply.raw.req`
处理文本、multipart 或流。`onRequest` 在解析 body 前触发；校验后可从 `ctx.body` 读取原始解析值。

错误可通过 H3 应用的 `onError` 处理，或使用 erest 的 `setResponseEnvelopers({ error })`。
`reply.raw` 是 `H3Event`，例如 `ctx.reply.raw.res.headers.set('x-trace', '1')` 或 `setCookie(ctx.reply.raw, ...)`。
要从 `registerTyped` 返回原生 `Response`（下载、重定向、流）并跳过成功信封，先调用 `ctx.reply.markSent()`：

```typescript
api.api.get('/download').group('users').registerTyped({}, (_req, ctx) => {
  ctx.reply.markSent();
  return new Response('id\n1', { headers: { 'content-type': 'text/csv' } });
});
```

## 路由前缀与分组

`info.basePath` 用于文档和 SDK URL，不会替应用挂载路由。
例如配置 `basePath: '/api'` 后，Express 仍需通过 `app.use('/api', router)` 挂载相应 router。

| 模式 | 注册 | 绑定 |
| --- | --- | --- |
| 默认 | `api.api.get('/users').group('users')` | `bind({ adapter, router })` |
| `forceGroup: true` | `api.group('users').get('/list')` | `bind({ adapter, app, router: RouterCtor })` |

分组模式在创建实例时声明：

```typescript
const api = createERest({
  forceGroup: true,
  groups: {
    users: { name: '用户', prefix: '/users' },
    admin: { name: '管理' },
  },
});
// users 分组使用 /users；admin 默认使用 /admin
api.bind({ adapter: new ExpressAdapter(), app, router: express.Router });
```

Koa 对应 `router: Router`，LeizmWeb 对应其 `Router` 构造函数。H3 使用
`api.bind({ adapter: h3Adapter, app, router: H3 })`，通过 `app.mount()` 挂载各分组。
非 forceGroup 下也可绑定到独立 H3 实例，再用 `app.mount('/api', router)` 挂载前缀。

## 跨框架 HTTP 契约（v3.5）

所有内置适配器共享校验与 hook 执行逻辑。业务模块只依赖 `erest`，框架、解析器和
`createErrorHandler` 放在启动装配层；示例工程提供四个可替换入口。

- `reply.send()` 始终发送 `text/plain; charset=utf-8`，不会把类似 HTML 的字符串识别为 HTML。
- `json(null)` 为 JSON `null`；`json(undefined)`/`send('')` 为空响应，默认 200；
  `status(204).send('')` 为 204 无响应体。
- 写入响应或 `markSent()` 后停止向宿主的后续路由传递，避免响应被覆盖；erest 内部仍保留洋葱回程。
- GET 路由支持 HEAD；已注册路径的 OPTIONS 统一返回 204 和汇总的 `Allow`，不执行业务中间件或 hooks。
  这不是 CORS 配置；CORS 仍由宿主负责。
- 重复 query 键按数组输入；空 query 值保留空字符串。使用默认的简单 query parser；
  自定义嵌套对象 parser 的行为由应用负责。
- 命名路径参数在匹配后按 `decodeURIComponent` 解码一次，包含 UTF-8、`%2F` 和 `%25`。
  静态路由在冲突的参数路由之前注册。大小写、尾斜杠、正则/通配符语法和宿主 404/405 内容
  不属于统一契约；有这些需求时必须配置宿主并补对应测试。

`createErrorHandler(api)` 把宿主 body parser 错误接入 erest 的 hooks 与错误信封。
Express/LeizmWeb 放在路由后，Koa 放在 body parser/路由前，H3 放在应用 `onError`。
可以继续使用自己的原生错误处理中间件，但此时路由外的错误观察和响应格式由应用负责。
原生解析失败时 `onRequest` 在错误边界创建上下文时触发；不表示解析之前已触发，也不调用 `onValidate`。
非法 JSON 统一为 `ERestError`（`code: INVALID_BODY`、`statusCode: 400`、`message: Invalid JSON body`），
原始异常保留在 `cause`。其他业务错误保留对象身份。

hook 顺序：成功为 `onRequest → onValidate → onResponse`；校验失败为
`onRequest → onValidate(Error) → onError → onResponse`；解析失败为
`onRequest → onError → onResponse`。`onError` 在错误信封之前触发，错误传递到宿主时不会重复观察。
无错误信封且未接入错误边界时，未处理的错误不会触发 `onResponse`。
`onResponse` 表示处理完成（包含已格式化错误），不表示 socket 已写完或客户端已收到。
所有 hooks 是同步观察者，其异常不改变请求结果。

构建后执行 `pnpm run test:adapters`，会针对全部内置适配器运行同一 HTTP 契约和博客业务测试。
新适配器必须加入 `src/test/frameworks.ts`，不得复制业务 handler 或按框架放宽断言。

## 原生上下文

| 能力 | Express `reply.raw` | Koa `reply.raw` | LeizmWeb `reply.raw` |
| --- | --- | --- | --- |
| 原生对象 | `{ req, res }` | Koa Context | LeizmWeb Context |
| Cookie | `.res.cookie(...)` | `.cookies.set(...)` | `.response.setHeader('Set-Cookie', ...)` |
| 重定向 | `.res.redirect(...)` | `.redirect(...)` | `.response.redirect(...)` |
| 响应头 | `.res.setHeader(...)` | `.set(...)` | `.response.setHeader(...)` |

使用 raw 的代码遵循宿主框架的语义，不再通用于所有框架。响应头应在发送响应体之前设置。
return 模式下手动发送响应，记得调用 [markSent()](api.md#原生响应)。

自定义适配器实现 `erest` 导出的 `FrameworkAdapter` 接口；实现约定见 [架构导航](../AGENTS.md)。

## TypeScript 与 ESM

erest 仅发布 ESM。使用 `package.json` 的 `"type": "module"` 或 `.mjs` 文件；
TypeScript 工程安装 `typescript`、`@types/node`、`@types/debug` 及宿主框架所需的类型包。
`@types/debug` 用于公开测试代理的调试器声明。

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "es2022",
    "strict": true,
    "esModuleInterop": true,
    "types": ["node"]
  }
}
```

CommonJS 调用方可在异步函数中动态加载：

```javascript
async function main() {
  const { default: ERest } = await import('erest');
  const api = new ERest({ groups: { users: '用户' } });
  // 注册路由并绑定框架
}
main();
```
