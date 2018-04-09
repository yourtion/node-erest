import { apiAll, apiGet, apiPost, build, hook, TYPES } from "./helper";
import lib from "./lib";
import { GROUPS, INFO } from "./lib";

import * as express from "express";

test("Group - bindRouter error when forceGroup", () => {
  const apiService = lib({ forceGroup: true });
  const api = apiService.api;
  const router = express.Router();
  const fn = () => apiService.bindRouter(router);
  expect(fn).toThrow("internal error 使用了 forceGroup，请使用bindGroupToApp");
});

test("Group - bindGroupToApp error when not forceGroup", () => {
  const apiService = lib();
  const api = apiService.group("test");
  const app = express();
  const fn = () => apiService.bindGroupToApp(app, express);
  expect(fn).toThrow("internal error 没有开启 forceGroup，请使用bindRouter");
});

test("Group - bindGroupToApp", () => {
  const apiService = lib({ forceGroup: true });
  const api = apiService.group("Index");
  const app = express();
  const globalBefore = hook("globalBefore");
  const globalAfter = hook("globalAfter");
  apiService.beforeHooks(globalBefore);
  apiService.afterHooks(globalAfter);

  const beforHook = hook("beforHook");
  const afterHook = hook("afterHook");
  const middleware = hook("middleware");
  api
    .get("/")
    .title("Get")
    .before(beforHook)
    .after(afterHook)
    .middlewares(middleware)
    .register(function fn(req, res) {
      res.end("Hello, API Framework Index");
    });
  apiService.bindGroupToApp(app, express);
  const appRoute = app._router.stack[2].handle;
  const routerStack = appRoute.stack[0].route.stack;

  const order = [
    "globalBefore",
    "beforHook",
    "apiParamsChecker",
    "middleware",
    "fn",
    "afterHook",
    "globalAfter",
  ];
  expect(routerStack.length).toBe(7);
  const hooksName = routerStack.map((r: any) => r.name);
  expect(hooksName).toEqual(order);
});
