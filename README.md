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

# node-erest

通过简单的方式构建一个优秀的 API 服务（基于 express、@leizm/web 等）。

一个优秀的 API 必须要有优秀的文档、较完整的测试，同时便于开发部署与联调。在文档方面，最大的问题在于，随着 API 的发展需要找人同步更新文档。有个更好的方案是不脱离代码自更新文档。

通过 ERest，你可以在定义 API 的同时，完成参数模型的定义、API格式的定义，同时生成便于写 API 测试的脚手架，像调用本地方法一样写 API 测试，并自动完成 API 文档的生成（包括示例数据），同时生成 Swagger、Postman、基于 axios 的 js-sdk（更多功能支持自定义）。

使用 (generator-erest)[https://github.com/yourtion/node-generator-erest] 帮助你快速生成一个 API 项目框架。

## Install

```bash
$ npm install erest --save
```

### Use yeoman generator

```bash
$ npm install generator-erest -g
# Express
$ yo erest:express
# @leizm/web
$ yo erest:lei-web
```

## How to use

```javascript
'use strict';

const API = require('erest').default;

// API info for document
const INFO = {
  title: 'erest-demo',
  description: 'Easy to write, easy to test, easy to generate document.',
  version: new Date(),
  host: 'http://127.0.0.1:3000',
  basePath: '/api',
};

// API group info
const GROUPS = {
  Index: '首页',
};

// Init API
const apiService = new API({
  info: INFO,
  groups: GROUPS,
});

apiService.api.get('/index')
  .group('Index')
  .title('Test api')
  .register((req, res) => {
    res.end('Hello, API Framework Index');
  });

const express = require('express');
const app = express();
const router = new express.Router();
app.use('/api', router);

// bing express router
apiService.bindRouter(router, apiService.checkerExpress);

app.listen(3000, function () {
  console.log('erest-demo listening started');
});
```
