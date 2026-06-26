[![NPM version](https://img.shields.io/npm/v/erest.svg?style=flat-square)](https://npmjs.org/package/erest)
[![Test](https://github.com/yourtion/node-erest/actions/workflows/test.yml/badge.svg)](https://github.com/yourtion/node-erest/actions/workflows/test.yml)
[![codecov](https://codecov.io/github/yourtion/node-erest/graph/badge.svg?token=HRY0R63I95)](https://codecov.io/github/yourtion/node-erest)
[![node version](https://img.shields.io/badge/node.js-%3E=_20-green.svg?style=flat-square)](http://nodejs.org/download/)
[![npm download](https://img.shields.io/npm/dm/erest.svg?style=flat-square)](https://npmjs.org/package/erest)
[![npm license](https://img.shields.io/npm/l/erest.svg)](https://npmjs.org/package/erest)

# ERest

基于 TypeScript 的 API 框架，支持自动文档生成、类型安全校验与测试脚手架。兼容 Express、Koa、@leizm/web 等主流框架。

📖 **API 文档**：<https://yourtion.github.io/node-erest/>（master 推送后由 CI 自动构建部署）

## 特性

- TypeScript 原生支持，完整的类型推导与类型安全
- 原生 Zod 集成，高性能参数校验与类型推导
- 自动文档生成，支持 Swagger、Postman、Markdown 等格式
- 内置测试脚手架，可像调用本地方法一样编写 API 测试
- 多框架支持：Express、Koa、@leizm/web
- 自动生成基于 axios 的客户端 SDK

## 安装

```bash
npm install erest
```

ERest 本身框架无关，需同时安装所选 Web 框架及其路由。例如使用 Koa 时还需安装 `koa-router` 和 `koa-bodyparser`。

## 快速开始

ERest 通过统一的 `bind()` 方法接入任意框架。API 定义方式与框架无关，接入方式按框架区分。

### 定义 API

无论使用哪个框架，API 的定义方式完全一致：

```typescript
import ERest, { z } from 'erest';

const api = new ERest({
  info: {
    title: 'My API',
    description: 'A powerful API built with ERest',
    version: '1.0.0',
    host: 'http://localhost:3000',
    basePath: '/api',
  },
  groups: {
    user: '用户管理',
    post: '文章管理',
  },
});

// GET /api/users/:id —— 路径参数 + query 参数
api.api
  .get('/users/:id')
  .group('user')
  .title('获取用户信息')
  .params(
    z.object({
      id: z.string().describe('用户ID'),
    })
  )
  .query(
    z.object({
      include: z.string().optional().describe('包含的关联数据'),
    })
  )
  .register(async (req, res) => {
    const { id } = req.params;
    const { include } = req.query;
    const user = await getUserById(id, include);
    res.json({ success: true, data: user });
  });

// POST /api/users —— 请求体校验（req.body 自动获得类型）
const CreateUserSchema = z.object({
  name: z.string().min(1).max(50),
  email: z.string().email(),
  age: z.number().int().min(18).max(120),
});

api.api
  .post('/users')
  .group('user')
  .title('创建用户')
  .body(CreateUserSchema)
  .register(async (req, res) => {
    const user = await createUser(req.body);
    res.json({ success: true, data: user });
  });
```

根据所选框架，参考下文对应的接入方式。

## 框架接入

`bind()` 支持两种模式：

| 模式 | 适用场景 | 调用方式 |
|------|----------|----------|
| 非 forceGroup | API 直接挂载到指定 router，路径即定义的 path | `bind({ framework, router })` |
| forceGroup | 按分组自动挂载到 app，每个分组有独立前缀 | `bind({ framework, app, router: RouterCtor })` |

### Express

```typescript
import express from 'express';
// import { api } from './api';  // 上文定义的 ERest 实例

const app = express();
const router = express.Router();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api', router);

// 将 ERest 的所有 API 绑定到 Express router
api.bind({ framework: 'express', router });

// 错误处理中间件（绑定路由之后再加载）
router.use((err, _req, res, _next) => {
  res.status(400).json({ message: err.message });
});

app.listen(3000);
```

forceGroup 模式下，`router` 参数传入 `express.Router` 构造函数：

```typescript
const app = express();
app.use(express.json());

const api = new ERest({
  forceGroup: true,
  groups: {
    user: { name: '用户管理', prefix: '/users' },
    post: { name: '文章管理' },   // 未指定 prefix 时按分组名自动生成
  },
});

api.bind({ framework: 'express', app, router: express.Router });
app.listen(3000);
```

### Koa

需额外安装 `koa-router` 和 `koa-bodyparser`：

```bash
npm install koa koa-router koa-bodyparser
```

```typescript
import Koa from 'koa';
import KoaRouter from 'koa-router';
import bodyParser from 'koa-bodyparser';
// import { api } from './api';

const app = new Koa();

// 1. body 解析（必须在路由之前）
app.use(bodyParser());

// 2. 统一错误处理：参数校验失败时返回错误信息
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    ctx.status = err.status || 500;
    ctx.body = { message: err.message };
  }
});

// 3. 创建路由并绑定 ERest
const router = new KoaRouter();
api.bind({ framework: 'koa', router });

// 4. Koa 的 handler 签名为 async (ctx) => void
//    校验后的参数注入到 ctx.$params
app.use(router.routes()).use(router.allowedMethods());

app.listen(3000);
```

Koa 中通过 `ctx.$params` 访问校验后的参数：

```typescript
api.api
  .post('/users')
  .group('user')
  .body(z.object({ name: z.string() }))
  .register(async (ctx) => {
    ctx.body = { name: ctx.$params.name };
  });
```

forceGroup 模式下，`router` 参数传入 `KoaRouter` 构造函数：

```typescript
const app = new Koa();
app.use(bodyParser());

const api = new ERest({
  forceGroup: true,
  groups: {
    v1: { name: 'Version 1', prefix: '/v1' },
    user: { name: 'User Group' },
  },
});

api.bind({ framework: 'koa', app, router: KoaRouter });
app.listen(3000);
// v1 分组的路由挂载到 /v1/*，user 分组挂载到 /user/*
```

### @leizm/web

@leizm/web 内置 `component.bodyParser` 中间件用于解析请求体。

```typescript
import { Application, Router, component } from '@leizm/web';
// import { api } from './api';

const app = new Application();

// 1. body 解析（内置中间件，基于 body-parser）
app.use('/', component.bodyParser.json());
app.use('/', component.bodyParser.urlencoded());

// 2. 创建路由并绑定 ERest
const router = new Router();
api.bind({ framework: 'leizmweb', router });
app.use('/', router);

// 3. @leizm/web 的 handler 签名为 (ctx) => void
//    校验后的参数注入到 ctx.request.$params
app.server.listen(3000);
```

@leizm/web 中通过 `ctx.request.$params` 访问校验后的参数，通过 `ctx.response.json()` 返回 JSON：

```typescript
api.api
  .post('/users')
  .group('user')
  .body(z.object({ name: z.string() }))
  .register((ctx) => {
    ctx.response.json({ name: ctx.request.$params.name });
  });
```

forceGroup 模式下，`router` 参数传入 @leizm/web 的 `Router` 构造函数：

```typescript
const app = new Application();
app.use('/', component.bodyParser.json());

const api = new ERest({
  forceGroup: true,
  groups: {
    v1: { name: 'Version 1', prefix: '/v1' },
    user: { name: 'User Group' },
  },
});

api.bind({ framework: 'leizmweb', app, router: Router });
app.server.listen(3000);
```

## 自动文档生成

根据已定义的 API 自动生成多种格式的文档和 SDK：

```typescript
api.docs.generateDocs({
  swagger: './docs/swagger.json',
  markdown: './docs/api.md',
  postman: './docs/postman.json',
  axios: './sdk/api-client.js',
});
```

| 格式 | 说明 |
|------|------|
| `swagger` | OpenAPI / Swagger JSON，可导入 Apifox、Swagger UI |
| `postman` | Postman Collection JSON，可直接导入 Postman |
| `markdown` | 人类可读的 Markdown API 文档 |
| `axios` | 基于 axios 的前端 SDK，可直接 `import` 使用 |

## 测试脚手架

内置测试工具，可像调用本地方法一样测试 API：

```typescript
// initTest 接收 http.Server 或框架的 app/server/callback
api.initTest(app);

it('应成功创建用户', async () => {
  const ret = await api.test.post('/api/users').input({
    name: 'Tom',
    email: 'tom@example.com',
    age: 20,
  }).success();
  expect(ret).toStrictEqual({ success: true, data: { id: 1 } });
});

it('应拒绝未成年用户', async () => {
  const err = await api.test.post('/api/users').input({ age: 15 }).error();
  expect(err).toBeInstanceOf(Error);
});
```

## 类型安全的 Handler：`registerTyped`

`register()` 的 handler 入参无类型，需要手动断言。`registerTyped()` 基于 Zod schema 自动推导
`req.params` / `req.query` / `req.body` / `req.headers` 的类型，**编译期类型安全、运行时由
checker 统一校验**，且对 Express / Koa / @leizm/web 三个框架都有效。

handler 签名为 `(req, reply)`——**与框架无关**：`req` 是分层校验后的参数，`reply` 是统一的响应接口
（`reply.json()` / `reply.status()`）。因此**同一份 handler 可被三个框架复用**，无需关心 ctx/res 差异。

```typescript
const CreateUserSchema = z.object({
  name: z.string().min(1).max(50),
  email: z.string().email(),
  age: z.number().int().min(18),
});

api.api
  .post('/users')
  .group('user')
  .title('创建用户')
  .registerTyped(
    { body: CreateUserSchema },
    (req, reply) => {
      // req.body 类型由 CreateUserSchema 自动推导：{ name: string; email: string; age: number }
      // 无需任何 `as` 类型断言
      const user = createUser(req.body);
      // reply 框架无关：内部封装 Express res / Koa ctx.body / @leizm/web ctx.response
      reply.status(201).json({ success: true, id: user.id });
    },
  );
```

> `registerTyped` 的校验由 adapter 的 checker 完成（参数注入到 `$validated`、响应接口注入到
> `$reply`），handler 内不重复 parse。若提供 `response` schema 且 handler 有返回值，返回值会经
> schema 校验（适合只读/纯计算型 handler，此时可不调用 `reply`）。

## 参数读取：`$params` 与分层访问器

adapter 的 checker 把校验后的参数注入到请求对象上，handler 通过它们读取：

| 访问器 | 框架位置 | 含义 |
|--------|----------|------|
| `$params` | `req.$params` / `ctx.$params` / `ctx.request.$params` | 扁平合并（params+query+body+headers），向后兼容 |
| `$validated` | 同上 | 分层聚合对象 `{ params, query, body, headers }` |
| `$pathParams` `$query` `$body` `$headers` | 同上 | 按来源分层，**互不覆盖** |

> `registerTyped` 已通过 `req.params/query/body` 提供分层读取，**无需**再访问 `$validated`。
> 下面的分层访问器主要供 `register()` 的 handler 使用（其入参是框架 ctx，无统一 req）。

**何时用分层访问器**：当路径参数与请求体存在同名字段时，扁平 `$params` 会发生静默覆盖
（后合并的来源覆盖前者）。例如 `PUT /users/:id` 同时定义了 path 的 `id` 与 body 的 `id`：

```typescript
// @leizm/web 下用分层访问器避免同名覆盖
api.api
  .put('/users/:id')
  .group('user')
  .params(z.object({ id: z.coerce.number() }))
  .body(z.object({ id: z.string(), name: z.string() }))
  .register((ctx) => {
    // 扁平 $params.id 被 body.id 覆盖（"body-id"），不推荐
    const pathId = ctx.request.$pathParams.id; // 42 —— 保留路径来源
    const bodyId = ctx.request.$body.id;       // "body-id" —— 保留请求体来源
    const name = ctx.request.$body.name;
    ctx.response.json({ pathId, bodyId, name });
  });
```

若仅需聚合读取、无同名冲突，`$params`（扁平）与 `$validated`（分层）均可。

## CJS / ESM 集成

erest 同时支持 CommonJS 与 ESM（含 `NodeNext` + `verbatimModuleSyntax` 的纯 ESM 工程）：

```typescript
// ESM 工程：直接 import，无需 createRequire 绕过
import ERest, { z } from 'erest';
const api = new ERest({ groups: { user: '用户管理' } });
```

```javascript
// CommonJS 工程
const { default: ERest, z } = require('erest');
const api = new ERest({ groups: { user: '用户管理' } });
```

erest 同时发布 ESM 与 CJS 两套产物（`dist/esm` 与 `dist/lib`），通过 `package.json` 的 `exports`
字段按 `import`/`require` 自动选择。在 `module: nodenext` + `verbatimModuleSyntax` 的最严格
ESM 工程下，`import ERest from 'erest'` 既有正确运行时（可直接 `new`）又有正确类型推导，无需
任何 `createRequire` 绕过或模块增强声明。

## 高级用法

### 分组与中间件

```typescript
const api = new ERest({
  forceGroup: true,
  groups: {
    admin: { name: '管理后台', prefix: '/admin' },
  },
});

// 为分组添加统一的 before 钩子和中间件（如鉴权）
api.group('admin').before(authMiddleware).middleware(logMiddleware);

api.group('admin').get('/dashboard').register((ctx) => {
  // 执行顺序：authMiddleware -> logMiddleware -> apiParamsChecker -> handler
});
```

### 错误处理

ERest 提供统一的 `ERestError` 错误类与可自定义的错误工厂函数：

```typescript
import { ERestError } from 'erest';

const api = new ERest({
  missingParameterError: (msg) => new ERestError('MISSING_PARAM', `缺少参数: ${msg}`),
  invalidParameterError: (msg) => new ERestError('INVALID_PARAM', `参数无效: ${msg}`),
});

throw ERestError.missingParam('username');
throw ERestError.invalidParam('age', 'Integer', 'abc');
```

### 可用适配器

| 框架 | 类型值 | 适配器类 |
|------|--------|----------|
| Express | `'express'` | `ExpressAdapter` |
| Koa | `'koa'` | `KoaAdapter` |
| @leizm/web | `'leizmweb'` | `LeizmWebAdapter` |

#### 已废弃方法

以下方法已废弃，请使用 `bind()` 替代：

- `bindRouter(router, checker)` → `bind({ framework: 'express', router })`
- `bindRouterToApp(app, Router, checker)` → `bind({ framework: 'express', app, router: Router })`
- `bindKoaRouterToApp(app, KoaRouter, checker)` → `bind({ framework: 'koa', app, router: KoaRouter })`
- `checkerExpress` / `checkerKoa` / `checkerLeiWeb` → 内置于适配器中

## 示例

`examples/` 是一个**迷你博客业务域**的完整最佳实践样板，串联 erest 全部核心能力：
**一份 API 定义（`src/api.js`），三个框架入口**（`src/entries/`）。handler 用 `registerTyped`
的 `(req, reply)` 签名声明一次，被 @leizm/web / Express / Koa 复用，仅 `bind()` 参数不同。

examples 作为 pnpm workspace 子包，通过 `erest: workspace:*` 引用本地 erest，安装时自动 link。

| 命令 | 说明 |
|------|------|
| `pnpm --filter erest-example start:{leizmweb,express,koa}` | 三框架入口（监听 3100） |
| `pnpm --filter erest-example test` | vitest 测试套件（initTest + success/error/takeExample） |
| `pnpm --filter erest-example docs` | 生成 swagger / postman / markdown / axios SDK |

覆盖能力：forceGroup 分组、组级 before/middleware 钩子（鉴权/日志）、全局 beforeHooks、
自定义错误注册、自定义 type/schema 注册、`define()` 声明式、`mock()`、`response()` schema、
分层参数、文档生成、测试集成。详见 `examples/README.md`。

## API 文档

线上文档站（typedoc 产物）由 CI 自动构建部署：

- 在线：<https://yourtion.github.io/node-erest/>
- 本地预览：`pnpm install && pnpm run doc`，产物在 `docs/`（已 gitignore，不进版本库）

## License

MIT
