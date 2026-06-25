/**
 * Koa 入口。
 *
 * 仅做框架装配：中间件链 + bind()。handler 在 src/api.js 声明一次，此处复用。
 * forceGroup 模式：bind({ framework, app, router: KoaRouter })。
 *
 * 运行：npm install && npm run start:koa
 */
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import KoaRouter from 'koa-router';
import ERest from 'erest';
import { z } from 'zod';
import { API_INFO, GROUPS, registerApi } from '../api.js';
import { createStore } from '../store.js';
import { koaAuthBefore, koaAdminBefore, koaLogMiddleware, koaTimingBefore } from '../hooks.js';

const app = new Koa();
app.use(bodyParser());

// 错误兜底：ERestError 用 statusCode，默认 400
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    ctx.status = err.statusCode || err.status || 400;
    ctx.body = { error: err.message, code: err.code };
  }
});

const store = createStore();
const api = new ERest({ info: API_INFO, groups: GROUPS, forceGroup: true });

registerApi(api, store, {
  authBefore: koaAuthBefore(store),
  adminBefore: koaAdminBefore(),
  logMiddleware: koaLogMiddleware(),
  timingBefore: koaTimingBefore(),
});

// define() 声明式定义示例（handler 入参框架相关）
api.group('admin').define({
  method: 'delete',
  path: '/users/:id',
  title: '删除用户（define 示例）',
  params: z.object({ id: z.coerce.number() }),
  handler: (ctx) => {
    ctx.body = { success: true, deleted: ctx.$params.id };
  },
});

// forceGroup 绑定
api.bind({ framework: 'koa', app, router: KoaRouter });

app.listen(3100, () => {
  console.log('erest Koa 入口：http://localhost:3100');
});
