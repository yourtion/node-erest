/**
 * @file Koa Integration Tests
 * @author Yourtion Guo <yourtion@gmail.com>
 *
 * 真实集成测试：使用真实的 Koa + koa-router + koa-bodyparser，
 * 覆盖统一 bind() 方法的 forceGroup 与非 forceGroup 两种模式，
 * 以及 KoaAdapter 的 createGroupRouter / attachGroupRouter 路径。
 */

import Koa, { type Context as KoaContext } from "koa";
import bodyParser from "koa-bodyparser";
import KoaRouter from "koa-router";
import { afterAll, describe, expect, it } from "vitest";
import { build, TYPES } from "./helper";
import lib from "./lib";

function returnJson(ctx: KoaContext, data: unknown) {
  ctx.type = "application/json";
  ctx.body = JSON.stringify(data);
}

describe("Koa Integration - bind() 非 forceGroup 模式", () => {
  const app = new Koa();
  app.use(bodyParser());
  // 统一错误处理：参数校验失败时返回错误信息
  app.use(async (ctx, next) => {
    try {
      await next();
    } catch (err: unknown) {
      ctx.status = (err as { status?: number }).status || 500;
      returnJson(ctx, { message: (err as Error).message });
    }
  });

  const apiService = lib({ basePath: "" });
  const { api } = apiService;
  const router = new KoaRouter();

  api
    .get("/koa/get")
    .group("Index")
    .title("基础GET")
    .register(async (ctx: KoaContext) => {
      returnJson(ctx, { data: "koa works" });
    });

  api
    .get("/koa/query")
    .group("Index")
    .title("Query校验")
    .query({ name: build(TYPES.String, "名称", true) })
    .register(async (ctx: KoaContext) => {
      returnJson(ctx, { name: ctx.$params.name });
    });

  api
    .post("/koa/body")
    .group("Index")
    .title("Body校验")
    .body({ id: build(TYPES.Integer, "ID", true) })
    .register(async (ctx: KoaContext) => {
      returnJson(ctx, { id: ctx.$params.id });
    });

  apiService.bind({ framework: "koa", router });
  app.use(router.routes()).use(router.allowedMethods());

  const server = app.listen();
  afterAll(() => server.close());
  apiService.initTest(server);

  it("应正确处理基础 GET 请求", async () => {
    const ret = await apiService.test.get("/koa/get").success();
    expect(ret).toStrictEqual({ data: "koa works" });
  });

  it("应校验 query 参数（成功）", async () => {
    const ret = await apiService.test.get("/koa/query").query({ name: "tester" }).success();
    expect(ret).toStrictEqual({ name: "tester" });
  });

  it("应校验 query 参数（失败 - 缺少必填）", async () => {
    const ret = await apiService.test.get("/koa/query").error();
    expect(ret).toBeInstanceOf(Error);
  });

  it("应校验 body 参数（成功）", async () => {
    const ret = await apiService.test.post("/koa/body").input({ id: 123 }).success();
    expect(ret).toStrictEqual({ id: 123 });
  });

  it("应校验 body 参数（失败 - 类型错误）", async () => {
    const ret = await apiService.test.post("/koa/body").input({ id: "abc" }).error();
    expect(ret).toBeInstanceOf(Error);
  });
});

describe("Koa Integration - bind() forceGroup 模式", () => {
  const app = new Koa();
  app.use(bodyParser());
  app.use(async (ctx, next) => {
    try {
      await next();
    } catch (err: unknown) {
      ctx.status = (err as { status?: number }).status || 500;
      returnJson(ctx, { message: (err as Error).message });
    }
  });

  const apiService = lib({
    forceGroup: true,
    info: { basePath: "" },
    groups: {
      // 显式前缀
      v1: { name: "Version 1", prefix: "/v1" },
      // 默认前缀（camelCase2underscore -> user）
      user: { name: "User Group" },
    },
  });

  apiService
    .group("v1")
    .get("/grouped")
    .title("v1分组")
    .register(async (ctx: KoaContext) => {
      returnJson(ctx, { group: "v1 works" });
    });

  apiService
    .group("user")
    .get("/info")
    .title("user分组")
    .query({ name: build(TYPES.String, "名称", true) })
    .register(async (ctx: KoaContext) => {
      returnJson(ctx, { group: "user info", name: ctx.$params.name });
    });

  // forceGroup 模式：提供 app 和 Router 构造函数
  // 此调用覆盖 KoaAdapter.createGroupRouter 与 attachGroupRouter
  apiService.bind({ framework: "koa", app, router: KoaRouter });

  const server = app.listen();
  afterAll(() => server.close());
  apiService.initTest(server);

  it("应处理显式前缀分组的请求", async () => {
    const ret = await apiService.test.get("/v1/grouped").success();
    expect(ret).toStrictEqual({ group: "v1 works" });
  });

  it("应处理默认前缀分组的请求", async () => {
    const ret = await apiService.test.get("/user/info").query({ name: "tom" }).success();
    expect(ret).toStrictEqual({ group: "user info", name: "tom" });
  });

  it("应对分组路由中的参数进行校验", async () => {
    const ret = await apiService.test.get("/user/info").error();
    expect(ret).toBeInstanceOf(Error);
  });
});
