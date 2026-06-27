import { Application, type Context as LeiContext, Router } from "@leizm/web";
import express from "express";
import Koa from "koa";
import KoaRouter from "koa-router";
import { z } from "zod";

import type { Context } from "../lib/adapters/types.js";
import { hook } from "./helper";
import lib from "./lib";

// 标准化后 hook 签名是 (ctx, next)，写 ctx.state["$name"]
const globalBefore = hook("globalBefore");
const globalAfter = hook("globalAfter");
const beforHook = hook("beforHook");
const middleware = hook("middleware");
const subBefore = hook("subBefore");
const subMidd = hook("subMidd");

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
  app.use(express.json());
  apiService.beforeHooks(globalBefore);
  apiService.afterHooks(globalAfter);

  // handler 通过 ctx.reply 写响应，并记录执行顺序到 ctx.state.order
  api
    .get("/")
    .title("Get")
    .before(beforHook)
    .middlewares(middleware)
    .register((ctx: Context) => {
      const order = ctx.state.order || [];
      order.push("reqFn");
      ctx.reply.json({ order });
    });
  api.post("/").register((ctx: Context) => ctx.reply.json("ok"));
  api.put("/").register((ctx: Context) => ctx.reply.json("ok"));
  api.delete("/").register((ctx: Context) => ctx.reply.json("ok"));
  api.patch("/").register((ctx: Context) => ctx.reply.json("ok"));
  apiService.bindRouterToApp(app, express.Router, apiService.checkerExpress);

  // 错误处理（标准化后错误经 dispatch 的 reject 传播到 Express next(err)）
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: (err as Error).message });
  });

  // 用记录执行顺序的 hook 替代直接检查 routerStack（标准化后框架只看到单个中间件）
  test("hook 执行顺序正确（before -> checker -> middleware -> handler）", async () => {
    const apiService2 = lib({ forceGroup: true, info: { basePath: "" } });
    const app2 = express();
    app2.use(express.json());
    const orderHook = (name: string) => (ctx: Context, next: () => Promise<void> | void) => {
      ctx.state.order = ctx.state.order || [];
      ctx.state.order.push(name);
      return next();
    };
    apiService2.beforeHooks(orderHook("globalBefore"));
    apiService2.group("Index").before(orderHook("groupBefore"));
    apiService2.group("Index").middleware(orderHook("groupMiddleware"));
    apiService2
      .group("Index")
      .get("/order")
      .before(orderHook("apiBefore"))
      .middlewares(orderHook("apiMiddleware"))
      .register((ctx: Context) => {
        ctx.state.order.push("handler");
        ctx.reply.json({ order: ctx.state.order });
      });
    apiService2.bindRouterToApp(app2, express.Router, apiService2.checkerExpress);
    app2.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ error: (err as Error).message });
    });
    apiService2.initTest(app2);

    const ret = await apiService2.test.get("/index/order").success();
    // 执行顺序：globalBefore -> groupBefore -> apiBefore -> checker(参数校验，无 order 记录)
    //          -> groupMiddleware -> apiMiddleware -> handler
    expect(ret.order).toEqual([
      "globalBefore",
      "groupBefore",
      "apiBefore",
      "groupMiddleware",
      "apiMiddleware",
      "handler",
    ]);
  });

  test("Get请求成功", async () => {
    apiService.initTest(app);
    const ret = await apiService.test.get("/index/").success();
    expect(ret.order).toEqual(["reqFn"]);
  });
});

describe("Group - 使用define定义路由", () => {
  const apiService = lib({ forceGroup: true, info: { basePath: "" } });
  const api = apiService.group("Index");
  const app = express();
  app.use(express.json());
  apiService.beforeHooks(globalBefore);
  apiService.afterHooks(globalAfter);

  api.define({
    method: "patch",
    path: "/",
    title: "Patch",
    description: "test patch",
    response: z.object({}),
    before: [beforHook],
    middlewares: [middleware],
    handler: (ctx: Context) => {
      ctx.reply.json("Hello, API Framework Index");
    },
  });
  apiService.bindRouterToApp(app, express.Router, apiService.checkerExpress);
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).end((err as Error).message);
  });

  test("Get请求成功", async () => {
    apiService.initTest(app);
    const ret = await apiService.test.patch("/index/").success();
    expect(ret).toBe("Hello, API Framework Index");
  });
});

describe("Group - 使用@leizm/web框架", () => {
  const apiService = lib({ forceGroup: true, info: { basePath: "" } });
  const api = apiService.group("Index");
  const app = new Application();
  app.use("/", (ctx: LeiContext) => {
    // body parser 占位
    ctx.next();
  });
  api
    .get("/")
    .title("Get")
    .register((ctx: Context) => {
      ctx.reply.json("Hello, API Framework Index");
    });
  apiService.bindRouterToApp(app, Router, apiService.checkerLeiWeb);

  test("Get请求成功", async () => {
    apiService.initTest(app.server);
    const { text: ret } = await apiService.test.get("/index/").raw();
    expect(ret).toBe(`"Hello, API Framework Index"`);
  });
});

describe("Group - 使用koa框架", () => {
  const apiService = lib({ forceGroup: true, info: { basePath: "" } });
  const api = apiService.group("Index");
  const app = new Koa();
  api
    .get("/")
    .title("Get")
    .register((ctx: Context) => {
      ctx.reply.json("Hello, API Framework Index");
    });
  apiService.bindKoaRouterToApp(app, KoaRouter, apiService.checkerKoa);

  test("Get请求成功", async () => {
    apiService.initTest(app.callback());
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
    info: { basePath: "" },
  });
  const api = apiService.group("Sub");
  api.before(subBefore);
  api.middleware(subMidd);
  const app = express();
  app.use(express.json());
  apiService.beforeHooks(globalBefore);
  apiService.afterHooks(globalAfter);

  api.define({
    method: "patch",
    path: "/index",
    title: "Patch",
    description: "test patch",
    response: z.object({}),
    before: [beforHook],
    middlewares: [middleware],
    handler: (ctx: Context) => {
      ctx.reply.json("Hello, API Framework Index");
    },
  });
  apiService.bindRouterToApp(app, express.Router, apiService.checkerExpress);
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).end((err as Error).message);
  });

  test("Get请求成功", async () => {
    apiService.initTest(app);
    const ret = await apiService.test.patch("/h5/sub/index").success();
    expect(ret).toBe("Hello, API Framework Index");
  });
});
