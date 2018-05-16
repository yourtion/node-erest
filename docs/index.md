# node-erest

Easy to build api server depend on express.

Easy to write, easy to test, easy to generate document.

## Install

```bash
$ npm install erest --save
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
  host: 'http://127.0.0.1:3001',
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
    res.success('Hello, API Framework Index');
  });

const express = require('express');
const app = express();
const router = new express.Router();

// bing express router
apiService.bindRouter(router);

app.listen(3000, function () {
  console.log('erest-demo listening started');
});
```
