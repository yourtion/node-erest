# erest 端到端示例

一个**迷你博客业务域**，串联 erest 的**全部核心能力**：一份 API 定义，三个框架入口。

## 演示的 erest 能力

| 能力 | 位置 | 说明 |
|------|------|------|
| `registerTyped` + `reply` | `src/api.js` | 框架无关 handler，类型自动推导，三入口复用 |
| `forceGroup` + 分组前缀 | `src/api.js` | public / post / admin 三组，各有前缀 |
| 组级 `before()` 钩子 | `src/hooks.js` | post/admin 组的鉴权（拒绝未授权请求） |
| 组级 `middleware()` | `src/hooks.js` | admin 组的请求日志 |
| 全局 `beforeHooks` | `src/hooks.js` | 计时 hook |
| 自定义错误注册 `errors.register` | `src/errors.js` | 注册 AUTH_REQUIRED / FORBIDDEN |
| `ERestError` 工厂 | `src/errors.js` | `ERestError` 静态构造（带 code/statusCode） |
| 自定义 type 注册 | `src/types.js` | 注册 `Slug` 类型（`z.string().regex(...)`） |
| 自定义 schema 注册 | `src/types.js` | 注册 `CreatePost` / `UpdatePost` |
| `define()` 声明式定义 | `src/entries/*.js` | 各入口注册一个 define 路由（handler 框架相关） |
| `mock()` | `docs/generate.js` | 无 handler 时由 setMockHandler 生成 mock 响应 |
| `response()` schema | `src/api.js` | 用户列表 API 声明响应 schema |
| 分层参数 | `src/api.js` | `PUT /posts/:id` 的 path id 与 body 互不覆盖 |
| 文档生成 `genDocs` | `docs/generate.js` | swagger / postman / markdown / axios SDK |
| 测试集成 `initTest` + `api.test` | `test/api.test.js` | vitest 写 success / error / takeExample |

## 目录结构

```
examples/
├── src/
│   ├── api.js          # 核心：forceGroup 三组 + 所有业务 API（handler 框架无关）
│   ├── store.js        # 内存存储（用户 + 文章 + token 鉴权）
│   ├── hooks.js        # 鉴权/日志/计时钩子（框架相关，每框架一套）
│   ├── errors.js       # 自定义错误注册 + ERestError 工厂
│   ├── types.js        # 自定义 Slug type + PostSchema 注册
│   └── entries/
│       ├── leizmweb.js # @leizm/web 入口
│       ├── express.js  # Express 入口
│       └── koa.js      # Koa 入口
├── docs/
│   └── generate.js     # 文档生成脚本（npm run docs）
├── test/
│   └── api.test.js     # vitest 测试套件（npm test）
├── types/
│   └── erest.d.ts      # NodeNext 模块增强声明（可选，仅 TS 工程）
└── vitest.config.js
```

## 三组业务 API

| 组 | 前缀 | 鉴权 | 端点 |
|----|------|------|------|
| `public` | `/public` | 无 | `GET /public/posts`、`GET /public/posts/:slug` |
| `post` | `/posts` | 需登录 | `GET/POST/PUT/DELETE /posts/posts[/:id]` |
| `admin` | `/admin` | 需管理员 | `GET /admin/stats`、`GET /admin/users`、`DELETE /admin/users/:id`（define） |

鉴权用 `X-Admin-Token` header：`user-token`（普通用户）、`admin-token`（管理员）。

## 运行

```bash
cd examples
npm install

# 任选一个框架启动（都监听 3100）
npm run start:express   # 或 start:leizmweb / start:koa
```

### 示例请求（三框架行为一致）

```bash
# 公开：已发布文章
curl http://localhost:3100/public/posts
curl http://localhost:3100/public/posts/hello-erest

# 需登录（header X-Admin-Token: user-token）
curl -H "X-Admin-Token: user-token" http://localhost:3100/posts/posts
curl -X POST -H "X-Admin-Token: user-token" -H "Content-Type: application/json" \
  -d '{"slug":"new-post","title":"新文章","content":"内容"}' http://localhost:3100/posts/posts

# 需管理员（header X-Admin-Token: admin-token）
curl -H "X-Admin-Token: admin-token" http://localhost:3100/admin/users
curl -H "X-Admin-Token: admin-token" http://localhost:3100/admin/stats

# 鉴权失败示例
curl -i http://localhost:3100/posts/posts                         # 401 无 token
curl -i -H "X-Admin-Token: user-token" http://localhost:3100/admin/users  # 403 权限不足
# 校验失败示例
curl -i -X POST -H "X-Admin-Token: user-token" -H "Content-Type: application/json" \
  -d '{"slug":"Bad Slug","title":"x","content":"y"}' http://localhost:3100/posts/posts  # 400
```

## 测试

```bash
npm test   # vitest 跑 initTest 套件：success / error / takeExample
```

测试用 Express 作为载体（`initTest` 对三框架均支持，这里选最通用的）。
覆盖：公开接口、鉴权（401/403）、参数校验（400）、define 路由、测试结果回填文档示例。

## 文档生成

```bash
npm run docs   # 生成到 docs/out/
```

产出：
- `swagger.json` — OpenAPI，可导入 Swagger UI / Apifox
- `postman.json` — Postman Collection
- `Home.md` + 各组 `.md` + `errors.md` / `schema.md` / `types.md` — Markdown 文档
- `sdk.js` — 基于 axios 的前端 SDK

## 设计说明：handler 框架无关，hooks 框架相关

- **业务 handler**（`registerTyped`）：用 `(req, reply)` 签名，声明一次，三框架复用。
- **组级 `before`/`middleware` 钩子**：接收框架原生 ctx，无法跨框架。故 `hooks.js` 为每框架
  提供一套实现（expressAuthBefore / koaAuthBefore / leiAuthBefore 等），业务逻辑（校验 token、
  判断角色）集中在 `resolveUser` / `requireAdmin`，框架差异仅限于如何从 ctx 读 header。
- **`define()` 的 handler**：入参也是框架原生 ctx（与 `register` 一致），故 define 路由在各
  入口内注册。

这是 erest 当前架构的固有约束：类型安全的框架无关 handler 由 `registerTyped` 提供，
而框架中件链（before/middleware/define）天然框架相关。

## TypeScript 集成（NodeNext）

若你的工程使用 `module: nodenext` + `verbatimModuleSyntax`，可参考 `types/erest.d.ts`
补充模块增强声明，消除默认导入的类型报错（运行时不受影响）。测试中因 vitest 的 Vite 解析器
对 CJS 默认导出互操作不稳定，用 `createRequire` 取 `.default`（见 `test/api.test.js`）。
