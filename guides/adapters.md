# 框架与 ESM

[返回首页](../README.md) · [API 定义](api.md)

## 适配器

| 包 | 工厂与适配器 | 框架 |
| --- | --- | --- |
| `@erest/express` | `createERest` / `ExpressAdapter` | Express 4、5 |
| `@erest/koa` | `createERest` / `KoaAdapter` | Koa 3，`@koa/router` 13 或 `koa-router` 13 |
| `@erest/leizmweb` | `createERest` / `LeizmWebAdapter` | @leizm/web 2 |

每个工厂创建的实例都使用相同的 [API 定义方式](api.md)，并推导该框架的 `ctx.reply.raw` 类型。
以下绑定片段假定 `api` 已创建并注册路由，通用错误格式器从 `erest` 导入。

## Express

```javascript
import express from 'express';
import { ExpressAdapter } from '@erest/express';
import { defaultErrorFormatter } from 'erest';

const app = express();
app.use(express.json());
api.bind({ adapter: new ExpressAdapter(), router: app });
app.use((err, _req, res, _next) => {
  const { status, body } = defaultErrorFormatter(err);
  res.status(status).json(body);
});
app.listen(3000);
```

错误处理中间件放在 app 级、路由绑定之后。需要表单时，再添加
`express.urlencoded({ extended: true })`。

## Koa

```javascript
import Koa from 'koa';
import Router from '@koa/router';
import bodyParser from 'koa-bodyparser';
import { KoaAdapter } from '@erest/koa';
import { defaultErrorFormatter } from 'erest';

const app = new Koa();
app.use(async (ctx, next) => {
  try { await next(); }
  catch (err) {
    const { status, body } = defaultErrorFormatter(err);
    ctx.status = status;
    ctx.body = body;
  }
});
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
import { LeizmWebAdapter } from '@erest/leizmweb';
import { defaultErrorFormatter } from 'erest';

const app = new Application();
app.use('/', component.bodyParser.json());
const router = new Router();
api.bind({ adapter: new LeizmWebAdapter(), router });
app.use('/', router);
app.use('/', (ctx, err) => {
  if (!err) return ctx.next();
  const { status, body } = defaultErrorFormatter(err);
  ctx.response.status(status).json(body);
});
app.server.listen(3000);
```

需要表单时，添加 `component.bodyParser.urlencoded({ extended: true })`。

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

Koa 对应 `router: Router`，LeizmWeb 对应其 `Router` 构造函数；它们使用各自的适配器。

## 原生上下文

| 能力 | Express `reply.raw` | Koa `reply.raw` | LeizmWeb `reply.raw` |
| --- | --- | --- | --- |
| 原生对象 | `{ req, res }` | Koa Context | LeizmWeb Context |
| Cookie | `.res.cookie(...)` | `.cookies.set(...)` | `.response.setHeader('Set-Cookie', ...)` |
| 重定向 | `.res.redirect(...)` | `.redirect(...)` | `.response.redirect(...)` |
| 响应头 | `.res.setHeader(...)` | `.set(...)` | `.response.setHeader(...)` |

使用 raw 的代码遵循宿主框架的语义，不再通用于三个框架。响应头应在发送响应体之前设置。
return 模式下手动发送响应，记得调用 [markSent()](api.md#原生响应)。

自定义适配器实现 `erest` 导出的 `FrameworkAdapter` 接口；实现约定见 [架构导航](../AGENTS.md)。

## TypeScript 与 ESM

erest 仅发布 ESM。使用 `package.json` 的 `"type": "module"` 或 `.mjs` 文件；
TypeScript 工程安装 `typescript`、`@types/node` 及宿主框架所需的类型包。

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
