/**
 * Koa 入口。
 *
 * 仅做框架装配：中间件链 + bind()。handler 在 src/api.js 声明一次，此处复用。
 * forceGroup 模式：bind({ adapter, app, router: KoaRouter })。
 *
 * 运行：npm install && npm run start:koa
 */
import Koa from "koa";
import bodyParser from "koa-bodyparser";
import KoaRouter from "koa-router";
import ERest from "erest";
import { KoaAdapter, createErrorHandler } from "@erest/koa";
import { API_INFO, GROUPS, registerApi } from "../api.js";
import { createStore } from "../store.js";
import { authBefore, adminBefore, logMiddleware, timingBefore } from "../hooks.js";

const app = new Koa();
const store = createStore();
const api = new ERest({ info: API_INFO, groups: GROUPS, forceGroup: true });
app.use(createErrorHandler(api));
app.use(bodyParser());

registerApi(api, store, {
  authBefore: authBefore(store),
  adminBefore: adminBefore(),
  logMiddleware: logMiddleware(),
  timingBefore: timingBefore(),
});

// forceGroup 绑定
api.bind({ adapter: new KoaAdapter(), app, router: KoaRouter });

app.listen(3100, () => {
  console.log("erest Koa 入口：http://localhost:3100");
});
