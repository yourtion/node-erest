/**
 * Koa 入口。
 *
 * 仅做框架装配：中间件链 + bind()。handler 在 src/api.js 声明一次，此处复用。
 * handler 内的 reply 已封装 Koa 的 ctx.body/status。
 *
 * 运行：npm install && npm run start:koa
 */
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import KoaRouter from 'koa-router';
import ERest from 'erest';
import { API_INFO, GROUPS, registerUserApi } from '../api.js';
import { createStore } from '../store.js';

const app = new Koa();
app.use(bodyParser());

// 错误兜底：参数校验失败时返回错误信息（ERestError 用 statusCode，默认 400）
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    ctx.status = err.statusCode || err.status || 400;
    ctx.body = { error: err.message };
  }
});

const store = createStore();
const api = new ERest({ info: API_INFO, groups: GROUPS });

// erest 路由（handler 在 api.js 声明，此处仅 bind；统一挂到 /api 前缀）
const router = new KoaRouter({ prefix: '/api' });
registerUserApi(api.api, store);
api.bind({ framework: 'koa', router });
app.use(router.routes()).use(router.allowedMethods());

app.listen(3100, () => {
  console.log('erest Koa 入口：http://localhost:3100/api');
});
