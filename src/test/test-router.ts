import { apiAll, apiGet, apiPost, build, hook, TYPES } from "./helper";
import lib from "./lib";
import { GROUPS, INFO } from "./lib";

import * as express from "express";

test("Router - bind empty", () => {
  const apiService = lib();
  const api = apiService.api;
  const router = express.Router();
  apiService.bindRouter(router);
  expect(router.stack.length).toBe(0);
});

test("Router - bind", () => {
  const apiService = lib();
  const api = apiService.api;
  const router = express.Router();
  apiAll(api);
  apiService.bindRouter(router);
  expect(router.stack.length).toBe(6);
});

test("Router - api after init error", () => {
  const apiService = lib();
  const api = apiService.api;
  const router = express.Router();
  const getApi = apiGet(api);
  getApi.title("aaa");
  getApi.query({
    num: build(TYPES.Number, "Number", true, 10, { max: 10, min: 0 }),
    type: build(TYPES.ENUM, "类型", true, undefined, ["a", "b"]),
  });

  apiService.bindRouter(router);
  const fn = () => getApi.title("bbb");
  expect(fn).toThrow();
});

test("Router - hooks", () => {
  const apiService = lib();
  const api = apiService.api;
  const router = express.Router();
  const globalBefore = hook("globalBefore");
  const globalAfter = hook("globalAfter");
  apiService.beforeHooks(globalBefore);
  apiService.afterHooks(globalAfter);

  const beforHook = hook("beforHook");
  const afterHook = hook("afterHook");
  const middleware = hook("middleware");
  api
    .get("/")
    .group("Index")
    .title("Get")
    .before(beforHook)
    .after(afterHook)
    .middlewares(middleware)
    .register(function fn(req, res) {
      res.end("Hello, API Framework Index");
    });
  apiService.bindRouter(router);
  expect(router.stack.length).toBe(1);

  const order = [
    "globalBefore",
    "beforHook",
    "apiParamsChecker",
    "middleware",
    "fn",
    "afterHook",
    "globalAfter",
  ];
  const routerStack = router.stack[0].route.stack;
  expect(routerStack.length).toBe(7);
  const hooksName = routerStack.map((r: any) => r.name);
  expect(hooksName).toEqual(order);
});

test("Router - duplicate router path error", () => {
  const apiService = lib();
  const api = apiService.api;
  apiGet(api);
  apiPost(api);
  const fn = () => apiGet(api);
  expect(fn).toThrow();
});
