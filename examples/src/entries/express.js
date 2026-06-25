/**
 * Express 入口。
 *
 * 仅做框架装配：中间件链 + bind()。handler 在 src/api.js 声明一次，此处复用。
 * 路由挂到 /api 前缀，handler 内的 reply 已封装 Express 的 res.json/status。
 *
 * 运行：npm install && npm run start:express
 */
import express from 'express';
import ERest from 'erest';
import { API_INFO, GROUPS, registerUserApi } from '../api.js';
import { createStore } from '../store.js';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const store = createStore();
const api = new ERest({ info: API_INFO, groups: GROUPS });

// erest 路由（handler 在 api.js 声明，此处仅 bind 到 /api 前缀的 router）
const router = express.Router();
registerUserApi(api.api, store);
api.bind({ framework: 'express', router });
app.use('/api', router);

// 错误处理中间件（参数校验失败等）；ERestError 用 statusCode，默认 400
app.use((err, _req, res, _next) => {
  res.status(err.statusCode || err.status || 400).json({ error: err.message });
});

app.listen(3100, () => {
  console.log('erest Express 入口：http://localhost:3100/api');
});
