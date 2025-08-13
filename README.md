[![NPM version][npm-image]][npm-url]
[![build status][travis-image]][travis-url]
[![Test coverage][coveralls-image]][coveralls-url]
[![David deps][david-image]][david-url]
[![node version][node-image]][node-url]
[![npm download][download-image]][download-url]
[![npm license][license-image]][download-url]
[![DeepScan grade](https://deepscan.io/api/projects/2707/branches/19046/badge/grade.svg)](https://deepscan.io/dashboard#view=project&pid=2707&bid=19046)

[npm-image]: https://img.shields.io/npm/v/erest.svg?style=flat-square
[npm-url]: https://npmjs.org/package/erest
[travis-image]: https://img.shields.io/travis/yourtion/node-erest.svg?style=flat-square
[travis-url]: https://travis-ci.org/yourtion/node-erest
[coveralls-image]: https://img.shields.io/coveralls/yourtion/node-erest.svg?style=flat-square
[coveralls-url]: https://coveralls.io/r/yourtion/node-erest?branch=master
[david-image]: https://img.shields.io/david/yourtion/node-erest.svg?style=flat-square
[david-url]: https://david-dm.org/yourtion/node-erest
[node-image]: https://img.shields.io/badge/node.js-%3E=_10-green.svg?style=flat-square
[node-url]: http://nodejs.org/download/
[download-image]: https://img.shields.io/npm/dm/erest.svg?style=flat-square
[download-url]: https://npmjs.org/package/erest
[license-image]: https://img.shields.io/npm/l/erest.svg

# ERest

🚀 **现代化的 TypeScript API 框架** - 通过简单的方式构建优秀的 API 服务

基于 Express、@leizm/web 等主流框架，ERest 提供了一套完整的 API 开发解决方案。支持自动文档生成、类型安全验证、测试脚手架等功能，让 API 开发更加高效和可靠。

## ✨ 核心特性

* 🔷 **TypeScript 原生支持** - 完整的类型推导和类型安全

* 🔧 **原生 Zod 集成** - 高性能的参数验证和类型推导

* 📚 **自动文档生成** - 支持 Swagger、Postman、Markdown 等多种格式

* 🧪 **测试脚手架** - 像调用本地方法一样编写 API 测试

* 🔌 **多框架支持** - 兼容 Express、Koa、@leizm/web 等主流框架

* 📦 **SDK 自动生成** - 自动生成基于 axios 的客户端 SDK

* 🎯 **零配置启动** - 开箱即用的开发体验

## 🛠️ 技术栈

* **语言**: TypeScript 5.8+

* **运行时**: Node.js 18+

* **验证库**: Zod 4.0+

* **支持框架**: Express 4.x, Koa 3.x, @leizm/web 2.x

* **构建工具**: Vite, Biome

* **测试框架**: Vitest

## 📦 安装

```bash
# npm
npm install erest

# yarn
yarn add erest

# pnpm
pnpm add erest
```

### 快速开始脚手架

使用  快速生成项目框架：

```bash
npm install generator-erest -g

# Express 项目
yo erest:express

# @leizm/web 项目
yo erest:lei-web
```

## 🚀 快速开始

### 基础用法

```typescript
import ERest, { z } from 'erest';
import express from 'express';

// 创建 ERest 实例
const api = new ERest({
  info: {
    title: 'My API',
    description: 'A powerful API built with ERest',
    version: new Date(),
    host: 'http://localhost:3000',
    basePath: '/api',
  },
  groups: {
    user: '用户管理',
    post: '文章管理',
  },
});

// 定义 API 接口
api.api.get('/users/:id')
  .group('user')
  .title('获取用户信息')
  .params(z.object({
    id: z.string().describe('用户ID'),
  }))
  .query(z.object({
    include: z.string().optional().describe('包含的关联数据'),
  }))
  .register(async (req, res) => {
    const { id } = req.params;
    const { include } = req.query;

    // 业务逻辑
    const user = await getUserById(id, include);
    res.json({ success: true, data: user });
  });

// 绑定到 Express
const app = express();
const router = express.Router();
app.use('/api', router);

api.bindRouter(router, api.checkerExpress);

app.listen(3000, () => {
  console.log('🚀 Server running on http://localhost:3000');
});
```

### 原生 Zod 类型支持

```typescript
import { z } from 'erest';

// 定义复杂的数据模型
const CreateUserSchema = z.object({
  name: z.string().min(1).max(50),
  email: z.string().email(),
  age: z.number().int().min(18).max(120),
  tags: z.array(z.string()).optional(),
  profile: z.object({
    bio: z.string().optional(),
    avatar: z.string().url().optional(),
  }).optional(),
});

api.api.post('/users')
  .group('user')
  .title('创建用户')
  .body(CreateUserSchema)
  .register(async (req, res) => {
    // req.body 自动获得完整的类型推导
    const userData = req.body; // 类型安全！

    const user = await createUser(userData);
    res.json({ success: true, data: user });
  });
```

### 自动文档生成

```typescript
// 生成多种格式的文档
api.docs.generateDocs({
  swagger: './docs/swagger.json',
  markdown: './docs/api.md',
  postman: './docs/postman.json',
  axios: './sdk/api-client.js',
});
```
