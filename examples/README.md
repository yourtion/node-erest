# 博客示例

[返回首页](../README.md) · [框架接入](../guides/adapters.md) · [API 测试](../guides/testing.md)

一份迷你博客 API 定义，分别接入 Express、Koa、LeizmWeb。数据存储在内存中，重启后重置。

## 运行

在仓库根目录安装并构建核心包和适配器，再选择一个入口启动（端口均为 3100）：

```bash
pnpm install --frozen-lockfile
pnpm run build
pnpm run build:packages
pnpm --filter erest-example start:express
# 也可使用 start:koa 或 start:leizmweb
```

| 组 | 完整路径 | 鉴权 |
| --- | --- | --- |
| public | `GET /public/posts`、`GET /public/posts/:slug` | 无 |
| post | `GET/POST /posts/posts`、`PUT/DELETE /posts/posts/:id` | 登录 |
| admin | `GET /admin/stats`、`GET /admin/users`、`DELETE /admin/users/:id` | 管理员 |

通过 `X-Admin-Token` 传入 `user-token`（普通用户）或 `admin-token`（管理员）：

```bash
curl http://localhost:3100/public/posts
curl -H 'X-Admin-Token: user-token' 'http://localhost:3100/posts/posts?status=published'
curl -X POST http://localhost:3100/posts/posts \
  -H 'X-Admin-Token: user-token' -H 'Content-Type: application/json' \
  -d '{"slug":"new-post","title":"新文章","content":"内容"}'
curl -H 'X-Admin-Token: admin-token' http://localhost:3100/admin/stats
```

缺少 token 返回 401，普通用户访问管理接口返回 403，非法字段返回 400。

## 代码入口

| 文件 | 内容 |
| --- | --- |
| [src/api.js](src/api.js) | 分组、registerTyped、分层参数、response、requiredOneOf 与 define |
| [src/entries/](src/entries/) | 三个框架的解析器、适配器绑定与错误中间件 |
| [src/hooks.js](src/hooks.js) | before 鉴权、middleware 日志、全局计时 |
| [src/types.js](src/types.js) / [src/errors.js](src/errors.js) | Zod 类型/schema 与业务错误注册 |
| [src/store.js](src/store.js) | 内存数据和 token |
| [test/api.test.js](test/api.test.js) | 使用 TestAgent 验证业务 API |

handler 和 before/middleware 使用 erest 标准上下文，在三个入口间共享。
`registerTyped` 使用 `(req, ctx)`，`register` / `define` 使用 `(ctx, next)`，均通过 `ctx.reply` 响应。
TypeScript 与 CommonJS 集成见[框架与 ESM](../guides/adapters.md#typescript-与-esm)。

## 测试

构建完成后运行：

```bash
pnpm --filter erest-example test
```

测试使用 Express，覆盖公开接口、鉴权、校验、define 和真实示例记录。

## 文档生成

```bash
pnpm --filter erest-example docs       # examples/docs/out/
pnpm --filter erest-example docs:test  # examples/docs/out-from-test/
```

[docs/generate.js](docs/generate.js) 直接生成 `swagger.json`（Swagger 2.0）、`postman.json`、
`sdk.js` 和 Markdown 分组页面。
未执行请求的路由显示未测试标记，无真实请求示例。

[docs/generate-from-test.js](docs/generate-from-test.js) 启动临时测试服务，发出真实请求，
通过 `.takeExample(name).success()` 记录请求与响应，再生成 Markdown。
执行过的路由显示已测试标记；该标记不替代业务断言。

格式选项见[文档与 SDK](../guides/documentation.md)，示例记录见[API 测试](../guides/testing.md#保存真实示例)。
