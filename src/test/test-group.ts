import { apiAll, apiGet, apiPost, build, hook, TYPES } from "./helper";
import lib from "./lib";
import { GROUPS, INFO } from "./lib";

import * as express from "express";

function reqFn(req: any, res: any) {
  res.json("Hello, API Framework Index");
}

const globalBefore = hook("globalBefore");
const globalAfter = hook("globalAfter");
const beforHook = hook("beforHook");
const afterHook = hook("afterHook");
const middleware = hook("middleware");

const order = [
  "globalBefore",
  "beforHook",
  "apiParamsChecker",
  "middleware",
  "reqFn",
  "afterHook",
  "globalAfter",
];

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
    .after(afterHook)
    .middlewares(middleware)
    .register(reqFn);
  api.post("/").register(reqFn);
  api.delete("/").register(reqFn);
  api.patch("/").register(reqFn);
  apiService.bindGroupToApp(app, express);

  it("TEST - routerStack order", () => {
    const appRoute = app._router.stack[2].handle;
    const routerStack = appRoute.stack[0].route.stack;

    expect(routerStack.length).toBe(7);
    const hooksName = routerStack.map((r: any) => r.name);
    expect(hooksName).toEqual(order);
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
    param: {},
    required: [],
    requiredOneOf: [],
    before: [beforHook],
    after: [afterHook],
    middlewares: [middleware],
    handler: reqFn,
  });
  apiService.bindGroupToApp(router, express);

  it("TEST - routerStack order", () => {
    const appRoute = app._router.stack[2].handle;
    const apiRoute = appRoute.stack[0].handle;
    const routerStack = apiRoute.stack[0].route.stack;

    expect(routerStack.length).toBe(7);
    const hooksName = routerStack.map((r: any) => r.name);
    expect(hooksName).toEqual(order);
  });

  it("TEST - Get success", async () => {
    apiService.initTest(app);

    const ret = await apiService.test.patch("/api/index").success();
    expect(ret).toBe("Hello, API Framework Index");
  });
});
