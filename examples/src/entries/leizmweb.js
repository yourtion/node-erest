/**
 * @leizm/web 入口。
 *
 * 仅做框架装配：中间件链 + bind()。handler 在 src/api.js 声明一次，此处复用。
 * forceGroup 模式：bind({ framework, app, router: Router })。
 *
 * 运行：npm install && npm run start:leizmweb
 */
import { Application, Router, component } from '@leizm/web';
import ERest from 'erest';
import { API_INFO, GROUPS, registerApi } from '../api.js';
import { createStore } from '../store.js';
import { authBefore, adminBefore, logMiddleware, timingBefore } from '../hooks.js';

const app = new Application();

// 1. body 解析（必须在路由之前）
app.use('/', component.bodyParser.json());
app.use('/', component.bodyParser.urlencoded({ extended: true }));

const store = createStore();
const api = new ERest({ info: API_INFO, groups: GROUPS, forceGroup: true });

registerApi(api, store, {
  authBefore: authBefore(store),
  adminBefore: adminBefore(),
  logMiddleware: logMiddleware(),
  timingBefore: timingBefore(),
});

// forceGroup 绑定
api.bind({ framework: 'leizmweb', app, router: Router });

// 错误处理中间件（双参数 = 错误处理中间件）；ERestError 用 statusCode
app.use('/', (ctx, err) => {
  const status = err?.statusCode || err?.status || 500;
  ctx.response.status(status).json({ error: err?.message || 'internal error', code: err?.code });
});

app.server.listen(3100, () => {
  console.log('erest @leizm/web 入口：http://localhost:3100');
});
