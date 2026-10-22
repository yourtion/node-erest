# ERest

[![npm](https://img.shields.io/npm/v/erest.svg)](https://npmjs.org/package/erest)
[![Test](https://github.com/yourtion/node-erest/actions/workflows/test.yml/badge.svg)](https://github.com/yourtion/node-erest/actions/workflows/test.yml)
[![codecov](https://codecov.io/github/yourtion/node-erest/graph/badge.svg)](https://codecov.io/github/yourtion/node-erest)

用一份 Zod schema 定义和校验 API，为 Express、Koa、@leizm/web 生成文档与 Axios SDK。
TypeScript handler 的参数类型由 schema 推导。

- **统一 API 定义**：支持分组、中间件、分层参数和响应校验。
- **文档与 SDK**：OpenAPI 3.0.3、Swagger 2、Markdown、Postman、Axios。
- **测试工具**：通过真实 HTTP 调用 API，将请求与响应保存为文档示例。

## 安装

需要 Node.js 20+，使用 ESM。安装核心包、Zod 和所用框架的适配器：

```bash
# Express 4 / 5
npm install erest zod @erest/express express

# Koa 3（也兼容 koa-router 13）
npm install erest zod @erest/koa koa @koa/router@^13 koa-bodyparser

# @leizm/web 2
npm install erest zod @erest/leizmweb @leizm/web
```

## 快速开始

下面是完整的 Express 示例，保存为 `app.mjs`：

```javascript
import { mkdirSync } from 'node:fs';
import express from 'express';
import { z, defaultErrorFormatter } from 'erest';
import { createERest, ExpressAdapter } from '@erest/express';

const app = express();
app.use(express.json());

const api = createERest({
  info: { title: 'Users API', version: '1.0.0', host: 'http://localhost:3000' },
  groups: { users: '用户' },
  docs: { openapi: true, axios: true },
});

api.api.post('/users').group('users').title('创建用户').registerTyped(
  { body: z.object({ name: z.string().min(1) }) },
  (req, ctx) => ctx.reply.json({ name: req.body.name }),
);

api.bind({ adapter: new ExpressAdapter(), router: app });
app.use((err, _req, res, _next) => {
  const { status, body } = defaultErrorFormatter(err);
  res.status(status).json(body);
});

mkdirSync('./docs', { recursive: true });
api.genDocs('./docs', false);
app.listen(3000);
```

启动并请求：

```bash
node app.mjs
curl -X POST http://localhost:3000/users \
  -H 'Content-Type: application/json' -d '{"name":"Tom"}'
```

响应为 `{"name":"Tom"}`；空字符串会触发参数校验错误。文档与 SDK 写入
`docs/openapi.json`、`docs/jssdk.js`，同时生成默认开启的 Markdown 文档。

`registerTyped` 的 handler 为 `(req, ctx)`：`req.params/query/body/headers` 是校验后的
参数，`ctx.reply` 用于响应。使用适配器的 `createERest()` 可获得原生上下文的类型推导。

## 使用指南

| 需要做什么 | 文档 |
| --- | --- |
| 定义 schema、handler、响应、分组与中间件 | [API 定义](guides/api.md) |
| 接入三个框架、配置路由前缀和 TypeScript | [框架与 ESM](guides/adapters.md) |
| 生成 OpenAPI、其他文档和 Axios SDK | [文档与 SDK](guides/documentation.md) |
| 测试业务 API、保存真实示例 | [API 测试](guides/testing.md) |
| 运行完整博客示例 | [示例工程](examples/README.md) |
| 生成 handler 骨架 | [@erest/gen](packages/erest-gen/README.md) |
| 升级已有项目 | [迁移指南](MIGRATION.md) |

完整类型与方法参考：[API Reference](https://yourtion.github.io/node-erest/)。

## 参与开发

环境准备、检查命令和维护流程见 [贡献指南](CONTRIBUTING.md)。

## License

MIT
