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

核心包 + 所用框架的 adapter 子包：

```bash
# Express
npm install erest @erest/express express

# Koa（推荐 @koa/router；也兼容 koa-router）
npm install erest @erest/koa koa @koa/router koa-bodyparser
# 注：koa-router 已停止维护并标记 deprecated，建议用 @koa/router（API 完全兼容，零改动替换）。
# erest 的 peer dep 同时接受二者，装哪个都不会有 missing peer warning。

# @leizm/web
npm install erest @erest/leizmweb @leizm/web
```

ERest 核心框架无关，三框架适配器作为独立子包（`@erest/express` / `@erest/koa` / `@erest/leizmweb`）按需安装。

> **TypeScript 工程**：erest 是 ESM-only（`type: "module"`）。若用 TypeScript，请确保安装
> `@types/node`（erest 的 `peerDependencies` 声明了 `@types/node`），并使用如下 `tsconfig.json`
> 关键项（注意：**不要**设置 `baseUrl`，它在 `module: NodeNext` 下已废弃且会触发 TS5101 警告）：
>
> ```jsonc
> {
>   "compilerOptions": {
>     "module": "NodeNext",
>     "moduleResolution": "NodeNext",
>     "target": "es2022",
>     "lib": ["es2022"],          // Node 类型经 @types/node 注入，无需加 "dom"
>     "strict": true,
>     "esModuleInterop": true,
>     "types": ["node"]           // 显式包含 Node 全局类型（console/Buffer 等）
>   }
> }
> ```
>
> 编译/运行 TypeScript 用本地安装的 `typescript`（`npx tsc` 在未装 typescript 时会解析到 npm
> 上一个废弃的同名包）。推荐：`npm install -D typescript @types/node`，再 `npx tsc` 或
> `node --import tsx src/index.ts`。

## 快速开始

ERest 通过统一的 `bind()` 方法接入任意框架。API 定义方式与框架无关，接入方式按框架区分。

### 定义 API

无论使用哪个框架，API 的定义方式完全一致。推荐使用 `registerTyped`——它基于 Zod schema
自动推导参数类型，handler 签名为**框架无关的 `(req, ctx)`**，同一份 handler 可被
Express / Koa / @leizm/web 复用：

```typescript
import ERest, { z } from 'erest';

const api = new ERest({
  info: {
    title: 'My API',
    description: 'A powerful API built with ERest',
    version: '1.0.0', // 字符串：语义版本号，用于文档生成
    host: 'http://localhost:3000',
    // basePath 仅用于文档生成（swagger/postman 的 URL 拼接），不作为路由前缀。
    // 路由前缀由各框架的 mount 决定，详见下文「框架接入」。
    basePath: '/api',
  },
  groups: {
    user: '用户管理',
    post: '文章管理',
  },
});

// GET /users/:id —— path + query 参数（req.params / req.query 类型由 schema 推导）
api.api
  .get('/users/:id')
  .group('user')
  .title('获取用户信息')
  .registerTyped(
    {
      params: z.object({ id: z.string().describe('用户ID') }),
      query: z.object({ include: z.string().optional().describe('包含的关联数据') }),
    },
    async (req, ctx) => {
      const user = await getUserById(req.params.id, req.query.include);
      ctx.reply.json({ success: true, data: user });
    },
  );

// POST /users —— 请求体校验（req.body 类型由 schema 推导，无需 as 断言）
const CreateUserSchema = z.object({
  name: z.string().min(1).max(50),
  email: z.string().email(),
  age: z.number().int().min(18).max(120),
});

api.api
  .post('/users')
  .group('user')
  .title('创建用户')
  .registerTyped({ body: CreateUserSchema }, async (req, ctx) => {
    const user = await createUser(req.body);
    ctx.reply.status(201).json({ success: true, data: user });
  });
```

> **handler 签名说明**：`registerTyped` 的 handler 是 `(req, ctx)`，其中
> `req.params/query/body/headers` 是分层校验后的参数，`ctx.reply.json()/status()/send()`
> 是统一的响应接口。**不要**用 Express 的 `(req, res)` 或 Koa 的 `ctx.body = ...` 写法——
> 详见 [register 与 registerTyped 的区别](#类型安全的-handlerregistertyped)。

根据所选框架，参考下文对应的接入方式。

## 框架接入

`bind()` 接收一个 adapter 实例（由对应框架的子包提供），支持两种模式：

| 模式 | 适用场景 | 调用方式 |
|------|----------|----------|
| 非 forceGroup | API 直接挂载到指定 router，路径即定义的 path | `bind({ adapter, router })` |
| forceGroup | 按分组自动挂载到 app，每个分组有独立前缀 | `bind({ adapter, app, router: RouterCtor })` |

### Express

```typescript
import express from 'express';
import { ExpressAdapter } from '@erest/express';
// import { api } from './api';  // 上文定义的 ERest 实例

const app = express();
const router = express.Router();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api', router); // 路由前缀由 Express mount 决定（与 erest 的 basePath 无关）

// 将 ERest 的所有 API 绑定到 Express router
api.bind({ adapter: new ExpressAdapter(), router });

// 错误处理中间件：必须挂在 app 级别（不是 router 级别）。
// Express 5 改变了子 router 内部抛出错误的传播语义——router 级错误中间件
// 可能捕获不到 erest 抛出的校验错误，因此推荐用 app 级兜底。
app.use((err, _req, res, _next) => {
  res.status(err.statusCode || 400).json({ message: err.message });
});

app.listen(3000);
```

> **Express 版本**：`@erest/express` 同时支持 Express 4（`express@^4`）和 Express 5（`express@^5`）。
> 二者均经测试通过，5 为当前推荐版本。Express 5 下请使用 **app 级**错误中间件（见上）。

forceGroup 模式下，`router` 参数传入 `express.Router` 构造函数：

```typescript
const app = express();
app.use(express.json());

const api = new ERest({
  forceGroup: true,
  groups: {
    user: { name: '用户管理', prefix: '/users' },
    post: { name: '文章管理' },   // 未指定 prefix 时按分组名自动生成（驼峰转下划线小写：post→/post）
  },
});

api.bind({ adapter: new ExpressAdapter(), app, router: express.Router });
// forceGroup 下错误中间件同样建议挂 app 级
app.use((err, _req, res, _next) => {
  res.status(err.statusCode || 400).json({ message: err.message });
});
app.listen(3000);
```

### Koa

需额外安装路由库（推荐 `@koa/router`，也兼容已停维护的 `koa-router`）和 `koa-bodyparser`：

```bash
npm install koa @koa/router koa-bodyparser
```

```typescript
import Koa from 'koa';
import KoaRouter from '@koa/router'; // 或 from 'koa-router'（API 完全一致）
import bodyParser from 'koa-bodyparser';
import { KoaAdapter } from '@erest/koa';
// import { api } from './api';

const app = new Koa();

// 1. body 解析（必须在路由之前）
app.use(bodyParser());

// 2. 统一错误处理：参数校验失败时返回错误信息
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    ctx.status = err.statusCode || err.status || 400;
    ctx.body = { message: err.message };
  }
});

// 3. 创建路由并绑定 ERest
const router = new KoaRouter();
api.bind({ adapter: new KoaAdapter(), router });

app.use(router.routes()).use(router.allowedMethods());

app.listen(3000);
```

> **handler 签名**：erest 在 Koa 下同样使用**标准化 `(ctx, next)`** 签名——`ctx` 是 erest
> 的内部上下文（有 `reply`/`$params`/`$validated` 等），**不是** Koa 原生 ctx，没有 `.body` setter。
> 返回响应请用 `ctx.reply.json()`。推荐直接用 `registerTyped`（handler 为 `(req, ctx)`）：

```typescript
api.api
  .post('/users')
  .group('user')
  .registerTyped({ body: z.object({ name: z.string() }) }, (req, ctx) => {
    ctx.reply.json({ name: req.body.name });
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

api.bind({ adapter: new KoaAdapter(), app, router: KoaRouter });
app.listen(3000);
// v1 分组的路由挂载到 /v1/*，user 分组挂载到 /user/*
```

### @leizm/web

@leizm/web 内置 `component.bodyParser` 中间件用于解析请求体（基于 body-parser）。

```typescript
import { Application, Router, component } from '@leizm/web';
import { LeizmWebAdapter } from '@erest/leizmweb';
// import { api } from './api';

const app = new Application();

// 1. body 解析（内置中间件，基于 body-parser）
//    urlencoded 必须传 { extended: true }，否则触发 body-parser deprecated 警告
app.use('/', component.bodyParser.json());
app.use('/', component.bodyParser.urlencoded({ extended: true }));

// 2. 创建路由并绑定 ERest
const router = new Router();
api.bind({ adapter: new LeizmWebAdapter(), router });
app.use('/', router);

app.server.listen(3000);
```

> **handler 签名**：erest 在 @leizm/web 下同样使用**标准化 `(ctx, next)`** 签名——`ctx` 是 erest
> 的内部上下文（有 `reply`/`$params`/`$validated` 等），**不是** @leizm/web 原生 ctx，没有 `.response`。
> 返回响应请用 `ctx.reply.json()`。推荐直接用 `registerTyped`（handler 为 `(req, ctx)`）：

```typescript
api.api
  .post('/users')
  .group('user')
  .registerTyped({ body: z.object({ name: z.string() }) }, (req, ctx) => {
    ctx.reply.json({ name: req.body.name });
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

api.bind({ adapter: new LeizmWebAdapter(), app, router: Router });
app.server.listen(3000);
```

## 自动文档生成

根据已定义的 API 自动生成多种格式的文档和 SDK。有两种触发方式：

**方式一：构造 ERest 时声明文档开关**（推荐）。在 `docs` 配置里指定要生成的格式，
然后调用 `api.genDocs(savePath)`——默认在**进程退出时**写盘（`onExit=true`）：

```typescript
const api = new ERest({
  info: { /* ... */ },
  groups: { /* ... */ },
  docs: {
    swagger: true,   // 生成 swagger.json
    postman: true,   // 生成 postman.json
    axios: true,     // 生成 jssdk.js（基于 axios）
    // markdown 输出细化开关（见下表）：
    wiki: true,      // 生成 Home.md + 各分组 .md（默认开启）
    index: true,     // 生成 index.md
    all: true,       // 生成汇总文件 API文档-<title>.md
  },
});

// 注册 API 后调用：默认 onExit=true，在 process exit 时写文件
api.genDocs('./docs/');
// 如需立即写盘（不等待退出）：api.genDocs('./docs/', false);
```

> 注：`swagger`/`postman`/`axios` 这类开关既可填 `true`（用默认文件名），也可填字符串指定文件名；
> `markdown` 是总开关（控制是否加载 markdown 插件），其具体产物文件由 `wiki`/`index`/`all` 决定。

**方式二：运行时挂插件**。用 `api.addDocPlugin(name, plugin)` 注册自定义生成器，
再调用 `api.genDocs('./docs/')` 触发。

| 配置键 | 默认 | 说明 |
|--------|------|------|
| `markdown` | `true` | 是否加载 markdown 插件（总开关，不决定具体文件名） |
| `wiki` | `"./"` | markdown 插件写 `Home.md` + 每个分组的 `.md`（默认开启） |
| `index` | `false` | markdown 插件写 `index.md` 目录页 |
| `all` | `false` | markdown 插件写汇总文件 `API文档-<title>.md` |
| `swagger` | `false` | 生成 `swagger.json`（OpenAPI，可导入 Apifox / Swagger UI） |
| `postman` | `false` | 生成 `postman.json`（Postman Collection） |
| `axios` | `false` | 生成 `jssdk.js`（基于 axios 的前端 SDK） |
| `json` | `false` | 生成 `doc.json`（完整文档数据快照） |

> **注意**：`genDocs()` 默认 `onExit=true`（注册 `process.on('exit', ...)`），调用后立即查看
> 输出目录会是空的——文件在进程退出时才写入。测试或需要立即产出的场景传第二个参数 `false`。

## 测试脚手架

内置测试工具，可像调用本地方法一样测试 API：

> `.input(data)` 对 **GET/DELETE** 把 `data` 转为 query string，对 **POST/PUT/PATCH** 作为 JSON body。
> 用 `.query(data)` / `.json(data)` 可显式指定来源。

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

handler 签名为 `(req, ctx)`——**与框架无关**：`req` 是分层校验后的参数，`reply` 是统一的响应接口
（`ctx.reply.json()` / `ctx.reply.status()`）。因此**同一份 handler 可被三个框架复用**，无需关心 ctx/res 差异。

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
    (req, ctx) => {
      // req.body 类型由 CreateUserSchema 自动推导：{ name: string; email: string; age: number }
      // 无需任何 `as` 类型断言
      const user = createUser(req.body);
      // reply 框架无关：内部封装各框架的原生响应写法（Express res / Koa ctx / @leizm/web ctx）
      ctx.reply.status(201).json({ success: true, id: user.id });
    },
  );
```

> `registerTyped` 的校验由 adapter 的 checker 完成（参数注入到 `ctx.$validated`，handler 包装层
> 从中读取并组装成 `req`），handler 内不重复 parse。若提供 `response` schema 且 handler 有返回值，
> 返回值会经 schema 校验（适合只读/纯计算型 handler，此时可不调用 `reply`）。

### `register` / `define` 与 `registerTyped` 的区别

| API | handler 签名 | 适用场景 |
|-----|-------------|----------|
| `registerTyped(schemas, fn)` | `(req, ctx)` | **推荐**。编译期类型安全，校验自动完成，框架无关 |
| `register(fn)` / `define({handler})` | `(ctx, next)` | 标准化 Koa 风格签名。`ctx` 有 `$params`/`$validated`/`reply`/`state` 等，需自己读 ctx（无类型推导）。适合需要 `next` 控制流或 `ctx.state` 跨中间件传数据的场景 |

无论哪种 API，**响应都通过 `reply` 写入**（`registerTyped` 是 `ctx.reply`，`register` 是 `ctx.reply`）——不要用框架原生的 `res.json()` / `ctx.body =` / `ctx.response.json()`。

### 原生能力逃生舱：`ctx.reply.raw`

handler 第二参数 `ctx` 携带的 `reply` 只暴露 `json()/status()/send()` 三个框架无关方法。当需要框架特有能力（setCookie、redirect、流式响应、文件下载等）时，通过 `ctx.reply.raw` 访问框架原生对象——它是「逃生舱」，绕开标准抽象直达底层。

`ctx.reply.raw` 的类型由 **`ERest<T, Raw, State>` 的 Raw 泛型**驱动。用子包提供的 `createERest()` 工厂创建实例，会在构造时自动锁定 Raw，handler 内 `ctx.reply.raw` 自动强类型、**零标注**：

```typescript
import { createERest } from '@erest/express';
// 用 createERest 代替 new ERest：构造时锁定 Raw = ExpressRaw({ req, res })
const api = createERest({ info, groups, forceGroup: true });

api.api.post('/login').group('auth').title('登录').registerTyped(
  { body: LoginSchema },
  (req, ctx) => {
    const user = authenticate(req.body);
    // ctx.reply.raw 自动推导为 { req: Request; res: Response }，无需断言
    ctx.reply.raw.res.cookie('token', sign(user), { httpOnly: true });
    ctx.reply.json({ ok: true });
  },
);
```

> 直接 `new ERest()` 仍可用（过渡期保留），但 Raw 默认为 `unknown`，`ctx.reply.raw` 需手动断言。新代码推荐用子包 `createERest()`。

**框架原生能力速查表**（`ctx.reply.raw` 在三框架下的形态不同，签名/语义各自遵循原生约定）：

| 能力 | Express (`ctx.reply.raw`) | Koa (`ctx.reply.raw`) | @leizm/web (`ctx.reply.raw`) |
|------|------|------|------|
| 设置 cookie | `.res.cookie(name, val, opts)` | `.cookies.set(name, val, opts)` | `.response.setHeader('Set-Cookie', ...)` |
| 读取 cookie | `.req.cookies`（需 cookie-parser） | `.cookies.get(name)` | `.request.cookies` |
| 重定向 | `.res.redirect(code, url)` | `.redirect(url)` | `.response.redirect(...)` |
| 流式响应 | `.res.write()` / `.res.end()` | `.body = stream` | `.response.send()` |
| 设置响应头 | `.res.setHeader(k, v)` | `.set(k, v)` | `.response.setHeader(k, v)` |
| 响应头已发送 | `.res.headersSent` | `.res.headersSent` | 查原生 |

> ⚠️ `raw` 的头部/cookie 操作应在 `ctx.reply.json()`/`ctx.reply.send()` **之前**调用（HTTP 头先于体发送）。`reply.raw` 是逃生舱，不参与框架无关复用——用了 raw 的 handler 即与具体框架耦合。

## 参数读取：`$params` 与分层访问器

adapter 的 checker 把校验后的参数注入到 erest 的标准化 `ctx` 上，handler 通过它们读取。
注意：**所有框架下的 handler 收到的都是同一个标准化 `ctx`**（不是 Express req / Koa ctx）：

| 访问器 | 位置 | 含义 |
|--------|------|------|
| `$params` | `ctx.$params` | 扁平合并（params+query+body+headers），便捷读取 |
| `$validated` | `ctx.$validated` | 分层聚合对象 `{ params, query, body, headers }` |
| `$pathParams` `$query` `$body` `$headers` | `ctx.$pathParams` 等 | 按来源分层，**互不覆盖** |

> `registerTyped` 已通过 `req.params/query/body` 提供分层读取，**无需**再访问 `$validated`。
> 下面的分层访问器主要供 `register()` 的 handler 使用（其入参是标准化 `ctx`，无统一 req）。

**何时用分层访问器**：当路径参数与请求体存在同名字段时，扁平 `$params` 会发生静默覆盖
（后合并的来源覆盖前者）。例如 `PUT /users/:id` 同时定义了 path 的 `id` 与 body 的 `id`：

```typescript
// 用分层访问器避免同名覆盖（三框架通用，ctx 为 erest 标准化上下文）
api.api
  .put('/users/:id')
  .group('user')
  .params(z.object({ id: z.coerce.number() }))
  .body(z.object({ id: z.string(), name: z.string() }))
  .register((ctx) => {
    // 扁平 ctx.$params.id 被 body.id 覆盖（"body-id"），不推荐
    const pathId = ctx.$pathParams.id; // 42 —— 保留路径来源
    const bodyId = ctx.$body.id;       // "body-id" —— 保留请求体来源
    const name = ctx.$body.name;
    ctx.reply.json({ pathId, bodyId, name }); // 响应统一走 ctx.reply
  });
```

若仅需聚合读取、无同名冲突，`$params`（扁平）与 `$validated`（分层）均可。

## ESM 集成

> **BREAKING（3.0）**：erest 3.0 起为 **ESM-only**，仅发布 ESM 产物。`require('erest')` 的 CommonJS
> 工程需迁移为 ESM（`import`），或改用动态 `import()` 加载。这是 3.0 major 的破坏性变更。

```typescript
// ESM 工程（package.json "type": "module"，或 .mjs 文件）：直接 import
import ERest, { z } from 'erest';
const api = new ERest({ groups: { user: '用户管理' } });
```

```javascript
// CommonJS 工程：用动态 import() 加载（顶层 require 不再支持）
const { default: ERest } = await import('erest');
const api = new ERest({ groups: { user: '用户管理' } });
```

erest 3.0 仅发布一套 ESM 产物（`dist/lib`）。在 `module: nodenext` + `verbatimModuleSyntax` 的
最严格 ESM 工程下，`import ERest from 'erest'` 既有正确运行时（可直接 `new`）又有正确类型推导。

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
  // 执行顺序：globalBefore -> authMiddleware(before) -> checker -> logMiddleware -> handler
  ctx.reply.json({ ok: true });
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

三框架适配器作为独立子包提供，自定义适配器实现 `FrameworkAdapter` 接口（从 `erest` 导入）即可：

| 子包 | 适配器类 | 适用框架 |
|------|----------|---------|
| `@erest/express` | `ExpressAdapter` | Express 4 |
| `@erest/koa` | `KoaAdapter` | Koa 3 |
| `@erest/leizmweb` | `LeizmWebAdapter` | @leizm/web 2 |

#### 已废弃方法

以下方法已废弃，请使用 `bind({ adapter, ... })` 替代：

- `bindRouter(router, checker)` → `bind({ adapter: new ExpressAdapter(), router })`
- `bindRouterToApp(app, Router, checker)` → `bind({ adapter: new ExpressAdapter(), app, router: Router })`
- `bindKoaRouterToApp(app, KoaRouter, checker)` → `bind({ adapter: new KoaAdapter(), app, router: KoaRouter })`
- `checkerExpress` / `checkerKoa` / `checkerLeiWeb` → 内置于各适配器中

## 示例

`examples/` 是一个**迷你博客业务域**的完整最佳实践样板，串联 erest 全部核心能力：
**一份 API 定义（`src/api.js`），三个框架入口**（`src/entries/`）。handler 用 `registerTyped`
的 `(req, ctx)` 签名声明一次，被 @leizm/web / Express / Koa 复用，仅 `bind()` 参数不同。

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
