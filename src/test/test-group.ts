import express from "express";
import { Application, Router, Context } from "@leizm/web";

import { hook } from "./helper";
import lib from "./lib";

function reqFn(req: express.Request, res: express.Response) {
  res.json("Hello, API Framework Index");
}

function reqFnLeiWeb(ctx: Context) {
  ctx.response.json("Hello, API Framework Index");
}

const globalBefore = hook("globalBefore");
const globalAfter = hook("globalAfter");
const beforHook = hook("beforHook");
const middleware = hook("middleware");
const subBefore = hook("subBefore");
const subMidd = hook("subMidd");

const ORDER = ["globalBefore", "beforHook", "apiParamsChecker", "middleware", "reqFn"];
const ORDER_SUB = ["globalBefore", "subBefore", "beforHook", "apiParamsChecker", "subMidd", "middleware", "reqFn"];

test("Group - 开启forceGroup必须使用bindGroupToApp", () => {
  const apiService = lib({ forceGroup: true });
  const router = express.Router();
  const fn = () => apiService.bindRouter(router, apiService.checkerExpress);
  expect(fn).toThrow("internal error 使用了 forceGroup，请使用bindGroupToApp");
});

test("Group - 没有开启forceGroup必须使用bindRouter", () => {
  const apiService = lib();
  apiService.group("test");
  const app = express();
  const fn = () => apiService.bindRouterToApp(app, express.Router, apiService.checkerExpress);
  expect(fn).toThrow("internal error 没有开启 forceGroup，请使用bindRouter");
});

describe("Group - 绑定分组路由到App上", () => {
  const apiService = lib({ forceGroup: true, info: { basePath: "" } });
  const api = apiService.group("Index");
  const app = express();
  apiService.beforeHooks(globalBefore);
  apiService.afterHooks(globalAfter);

  api
    .get("/")
    .title("Get")
    .before(beforHook)
    .middlewares(middleware)
    .register(reqFn);
  api.post("/").register(reqFn);
  api.put("/").register(reqFn);
  api.delete("/").register(reqFn);
  api.patch("/").register(reqFn);
  apiService.bindRouterToApp(app, express.Router, apiService.checkerExpress);

  test("routerStack顺序", () => {
    const appRoute = app._router.stack[2].handle;
    const routerStack = appRoute.stack[0].route.stack;

    expect(routerStack.length).toBe(ORDER.length);
    const hooksName = routerStack.map((r: any) => r.name);
    expect(hooksName).toEqual(ORDER);
  });

  test("Get请求成功", async () => {
    apiService.initTest(app);

    const { text: ret } = await apiService.test.get("/index").raw();
    expect(ret).toBe(`"Hello, API Framework Index"`);
  });
});

describe("Group - 使用define定义路由", () => {
  const apiService = lib({ forceGroup: true });
  const api = apiService.group("Index");
  const app = express();
  const router = express.Router();
  app.use("/api", router);
  apiService.beforeHooks(globalBefore);
  apiService.afterHooks(globalAfter);

  api.define({
    method: "patch",
    path: "/",
    title: "Patch",
    description: "test patch",
    response: {},
    body: {},
    params: {},
    required: [],
    requiredOneOf: [],
    before: [beforHook],
    middlewares: [middleware],
    handler: reqFn,
  });
  apiService.bindRouterToApp(router, express.Router, apiService.checkerExpress);

  test("routerStack顺序", () => {
    const appRoute = app._router.stack[2].handle;
    const apiRoute = appRoute.stack[0].handle;
    const routerStack = apiRoute.stack[0].route.stack;

    expect(routerStack.length).toBe(ORDER.length);
    const hooksName = routerStack.map((r: any) => r.name);
    expect(hooksName).toEqual(ORDER);
  });

  test("Get请求成功", async () => {
    apiService.initTest(app);

    const ret = await apiService.test.patch("/api/index").success();
    expect(ret).toBe("Hello, API Framework Index");
  });
});

describe("Group - 使用@leizm/web框架", () => {
  const apiService = lib({ forceGroup: true, info: { basePath: "" } });
  const api = apiService.group("Index");
  const app = new Application();
  api
    .get("/")
    .title("Get")
    .register(reqFnLeiWeb);
  apiService.bindRouterToApp(app, Router, apiService.checkerLeiWeb);

  test("Get请求成功", async () => {
    apiService.initTest(app.server);

    const { text: ret } = await apiService.test.get("/index/").raw();
    expect(ret).toBe(`"Hello, API Framework Index"`);
  });
});

describe("Group - 高级分组配置", () => {
  const apiService = lib({
    forceGroup: true,
    groups: {
      Index: "首页",
      Index2: { name: "首页2" },
      Sub: { name: "子路由", prefix: "/h5/sub" },
    },
  });
  const api = apiService.group("Sub");
  api.before(subBefore);
  api.middleware(subMidd);
  const app = express();
  const router = express.Router();
  app.use("/api", router);
  apiService.beforeHooks(globalBefore);
  apiService.afterHooks(globalAfter);

  api.define({
    method: "patch",
    path: "/index",
    title: "Patch",
    description: "test patch",
    response: {},
    body: {},
    params: {},
    required: [],
    requiredOneOf: [],
    before: [beforHook],
    middlewares: [middleware],
    handler: reqFn,
  });
  apiService.bindRouterToApp(router, express.Router, apiService.checkerExpress);

  test("routerStack顺序", () => {
    const appRoute = app._router.stack[2].handle;
    const apiRoute = appRoute.stack[0].handle;
    const routerStack = apiRoute.stack[0].route.stack;

    expect(routerStack.length).toBe(ORDER_SUB.length);
    const hooksName = routerStack.map((r: any) => r.name);
    expect(hooksName).toEqual(ORDER_SUB);
  });

  test("Get请求成功", async () => {
    apiService.initTest(app);

    const ret = await apiService.test.patch("/api/h5/sub/index").success();
    expect(ret).toBe("Hello, API Framework Index");
  });
});
