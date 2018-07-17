import { hook } from "./helper";
import lib from "./lib";

import express from "express";
import { Connect, Router, Context } from "@leizm/web";

function reqFn(req: any, res: any) {
  res.json("Hello, API Framework Index");
}

function reqFnLeiWeb(ctx: Context) {
  ctx.response.json("Hello, API Framework Index");
}

const globalBefore = hook("globalBefore");
const globalAfter = hook("globalAfter");
const beforHook = hook("beforHook");
const middleware = hook("middleware");

const ORDER = ["globalBefore", "beforHook", "apiParamsChecker", "middleware", "reqFn"];

test("Group - bindRouter error when forceGroup", () => {
  const apiService = lib({ forceGroup: true });
  const router = express.Router();
  const fn = () => apiService.bindRouter(router, apiService.checkerExpress);
  expect(fn).toThrow("internal error 使用了 forceGroup，请使用bindGroupToApp");
});

test("Group - bindGroupToApp error when not forceGroup", () => {
  const apiService = lib();
  apiService.group("test");
  const app = express();
  const fn = () => apiService.bindRouterToApp(app, express.Router, apiService.checkerExpress);
  expect(fn).toThrow("internal error 没有开启 forceGroup，请使用bindRouter");
});

describe("Group - bindGroupToApp", () => {
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

  it("TEST - routerStack order", () => {
    const appRoute = app._router.stack[2].handle;
    const routerStack = appRoute.stack[0].route.stack;

    expect(routerStack.length).toBe(ORDER.length);
    const hooksName = routerStack.map((r: any) => r.name);
    expect(hooksName).toEqual(ORDER);
  });

  it("TEST - Get success", async () => {
    apiService.initTest(app);

    const { text: ret } = await apiService.test.get("/index").raw();
    expect(ret).toBe(`"Hello, API Framework Index"`);
  });
});

describe("Group - define and use route bindGroupToApp", () => {
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

  it("TEST - routerStack order", () => {
    const appRoute = app._router.stack[2].handle;
    const apiRoute = appRoute.stack[0].handle;
    const routerStack = apiRoute.stack[0].route.stack;

    expect(routerStack.length).toBe(ORDER.length);
    const hooksName = routerStack.map((r: any) => r.name);
    expect(hooksName).toEqual(ORDER);
  });

  it("TEST - Get success", async () => {
    apiService.initTest(app);

    const ret = await apiService.test.patch("/api/index").success();
    expect(ret).toBe("Hello, API Framework Index");
  });
});

describe("Group - simple @leizm/web", () => {
  const apiService = lib({ forceGroup: true, info: { basePath: "" } });
  const api = apiService.group("Index");
  const app = new Connect();
  api
    .get("/")
    .title("Get")
    .register(reqFnLeiWeb);
  apiService.bindRouterToApp(app, Router, apiService.checkerLeiWeb);

  it("TEST - Get success", async () => {
    apiService.initTest(app.server);

    const { text: ret } = await apiService.test.get("/index/").raw();
    expect(ret).toBe(`"Hello, API Framework Index"`);
  });
});
