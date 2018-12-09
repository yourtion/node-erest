import { apiAll, apiGet, apiPost, build, hook, TYPES } from "./helper";
import lib from "./lib";

import * as express from "express";

test("Router - 绑定空路由", () => {
  const apiService = lib();
  const router = express.Router();
  apiService.bindRouter(router, apiService.checkerExpress);
  expect(router.stack.length).toBe(0);
});

test("Router - 绑定路由成功", () => {
  const apiService = lib();
  const api = apiService.api;
  const router = express.Router();
  apiAll(api);
  apiService.bindRouter(router, apiService.checkerExpress);
  expect(router.stack.length).toBe(6);
});

test("Router - API 绑定后不允许修改", () => {
  const apiService = lib();
  const api = apiService.api;
  const router = express.Router();
  const getApi = apiGet(api);
  getApi.title("aaa");
  getApi.query({
    num: build(TYPES.Number, "Number", true, 10, { max: 10, min: 0 }),
    type: build(TYPES.ENUM, "ENUM", true, undefined, ["a", "b"]),
  });

  apiService.bindRouter(router, apiService.checkerExpress);
  const fn = () => getApi.title("bbb");
  expect(fn).toThrow();
});

test("Router - Hook测试", () => {
  const apiService = lib();
  const api = apiService.api;
  const router = express.Router();
  const globalBefore = hook("globalBefore");
  const globalAfter = hook("globalAfter");
  apiService.beforeHooks(globalBefore);
  apiService.afterHooks(globalAfter);

  const beforHook = hook("beforHook");
  const middleware = hook("middleware");
  api
    .get("/")
    .group("Index")
    .title("Get")
    .before(beforHook)
    .middlewares(middleware)
    .register(function fn(req, res) {
      res.end("Hello, API Framework Index");
    });
  apiService.bindRouter(router, apiService.checkerExpress);
  expect(router.stack.length).toBe(1);

  const ORDER = ["globalBefore", "beforHook", "apiParamsChecker", "middleware", "fn"];
  const routerStack = router.stack[0].route.stack;
  expect(routerStack.length).toBe(ORDER.length);
  const hooksName = routerStack.map((r: any) => r.name);
  expect(hooksName).toEqual(ORDER);
});

test("Router - 不能绑定同路径路由", () => {
  const apiService = lib();
  const api = apiService.api;
  apiGet(api);
  apiPost(api);
  const fn = () => apiGet(api);
  expect(fn).toThrow();
});
