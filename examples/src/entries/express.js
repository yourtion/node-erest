/**
 * Express 入口。
 *
 * 仅做框架装配：中间件链 + bind()。handler 在 src/api.js 声明一次，此处复用。
 * forceGroup 模式：bind({ framework, app, router: express.Router })。
 *
 * 运行：npm install && npm run start:express
 */
import express from 'express';
import ERest from 'erest';
import { API_INFO, GROUPS, registerApi } from '../api.js';
import { createStore } from '../store.js';
import { authBefore, adminBefore, logMiddleware, timingBefore } from '../hooks.js';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const store = createStore();
const api = new ERest({ info: API_INFO, groups: GROUPS, forceGroup: true });

// 注册全部业务 API（注入框架无关的标准化钩子）
registerApi(api, store, {
  authBefore: authBefore(store),
  adminBefore: adminBefore(),
  logMiddleware: logMiddleware(),
  timingBefore: timingBefore(),
});

// forceGroup 绑定：按分组前缀自动挂载到 app
api.bind({ framework: 'express', app, router: express.Router });

// 错误处理中间件（绑定路由之后）；ERestError 用 statusCode，默认 400
app.use((err, _req, res, _next) => {
  res.status(err.statusCode || err.status || 400).json({ error: err.message, code: err.code });
});

app.listen(3100, () => {
  console.log('erest Express 入口：http://localhost:3100');
  console.log('  公开：GET /public/posts, GET /public/posts/:slug');
  console.log('  需登录：GET/POST/PUT/DELETE /posts (header X-Admin-Token: user-token)');
  console.log('  需管理员：GET /admin/stats, /admin/users (header X-Admin-Token: admin-token)');
});
