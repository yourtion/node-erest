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
import { z } from 'zod';
import { API_INFO, GROUPS, registerApi } from '../api.js';
import { createStore } from '../store.js';
import {
  expressAuthBefore,
  expressAdminBefore,
  expressLogMiddleware,
  expressTimingBefore,
} from '../hooks.js';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const store = createStore();
const api = new ERest({ info: API_INFO, groups: GROUPS, forceGroup: true });

// 注册全部业务 API（注入 Express 版钩子）
registerApi(api, store, {
  authBefore: expressAuthBefore(store),
  adminBefore: expressAdminBefore(),
  logMiddleware: expressLogMiddleware(),
  timingBefore: expressTimingBefore(),
});

// define() 声明式定义示例（handler 入参框架相关，故在各入口内注册）
api.group('admin').define({
  method: 'delete',
  path: '/users/:id',
  title: '删除用户（define 示例）',
  description: '用 define() 一次性声明路由 + handler',
  params: z.object({ id: z.coerce.number() }),
  handler: (req, res) => {
    res.json({ success: true, deleted: req.$params.id });
  },
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
