[![NPM version](https://img.shields.io/npm/v/erest.svg?style=flat-square)](https://npmjs.org/package/erest)
[![codecov](https://codecov.io/github/yourtion/node-erest/graph/badge.svg?token=HRY0R63I95)](https://codecov.io/github/yourtion/node-erest)
[![node version](https://img.shields.io/badge/node.js-%3E=_18-green.svg?style=flat-square)](http://nodejs.org/download/)
[![npm download](https://img.shields.io/npm/dm/erest.svg?style=flat-square)](https://npmjs.org/package/erest)
[![npm license](https://img.shields.io/npm/l/erest.svg)](https://npmjs.org/package/erest)
[![DeepScan grade](https://deepscan.io/api/projects/2707/branches/19046/badge/grade.svg)](https://deepscan.io/dashboard#view=project&pid=2707&bid=19046)

# ERest

基于 TypeScript 的 API 框架，支持自动文档生成、类型安全校验与测试脚手架。兼容 Express、Koa、@leizm/web 等主流框架。

## 特性

- TypeScript 原生支持，完整的类型推导与类型安全
- 原生 Zod 集成，高性能参数校验与类型推导
- 自动文档生成，支持 Swagger、Postman、Markdown 等格式
- 内置测试脚手架，可像调用本地方法一样编写 API 测试
- 多框架支持：Express、Koa、@leizm/web
- 自动生成基于 axios 的客户端 SDK

## 技术栈

- 语言：TypeScript 5.8+
- 运行时：Node.js 18+
- 校验库：Zod 4.0+
- 支持框架：Express 4.x、Koa 3.x、@leizm/web 2.x
- 构建工具：Vite、Biome
- 测试框架：Vitest

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

## License

MIT
