/**
 * @leizm/web 入口。
 *
 * 仅做框架装配：中间件链 + bind()。handler 在 src/api.js 声明一次，此处复用。
 *
 * 中间件链（@leizm/web 按函数参数个数区分普通/错误处理中间件）：
 *   1. 请求日志（普通）  2. body 解析  3. erest 路由  4. 404 兜底  5. 错误处理（双参数）
 *
 * 运行：npm install && npm run start:leizmweb
 */
import { Application, Router, component } from '@leizm/web';
import ERest from 'erest';
import { API_INFO, GROUPS, registerUserApi } from '../api.js';
import { createStore } from '../store.js';

const app = new Application();
const store = createStore();
const api = new ERest({ info: API_INFO, groups: GROUPS });

// 1. 请求日志
app.use('/', (ctx) => {
  console.log(`${ctx.request.method} ${ctx.request.path}`);
  ctx.next();
});
// 2. body 解析
app.use('/', component.bodyParser.json());
app.use('/', component.bodyParser.urlencoded({ extended: true }));

// 3. erest 路由（handler 在 api.js 声明，此处仅 bind）
const router = new Router();
registerUserApi(api.api, store);
api.bind({ framework: 'leizmweb', router });
app.use('/api', router);

// 4. 404 兜底
app.use('/', (ctx) => {
  ctx.response.status(404).json({ error: 'not found' });
});
// 5. 错误处理（双参数 = 错误处理中间件）；ERestError 用 statusCode，默认 400
app.use('/', (ctx, err) => {
  const status = err?.statusCode || err?.status || 500;
  ctx.response.status(status).json({ error: err?.message || 'internal error' });
});

app.server.listen(3100, () => {
  console.log('erest @leizm/web 入口：http://localhost:3100/api');
});
