/**
 * @file Koa Integration Tests
 * @author Yourtion Guo <yourtion@gmail.com>
 *
 * 真实集成测试：使用真实的 Koa + koa-router + koa-bodyparser，
 * 覆盖统一 bind() 方法的 forceGroup 与非 forceGroup 两种模式，
 * 以及 KoaAdapter 的 createGroupRouter / attachGroupRouter 路径。
 *
 * 标准化改造后：handler 用标准签名 (ctx)，经 ctx.reply 写响应、ctx.$params 读校验后参数。
 */

import Koa from "koa";
import bodyParser from "koa-bodyparser";
import KoaRouter from "koa-router";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import lib from "./lib";

describe("Koa Integration - bind() 非 forceGroup 模式", () => {
  const app = new Koa();
  app.use(bodyParser());
  // 统一错误处理：参数校验失败时返回错误信息
  app.use(async (ctx, next) => {
    try {
      await next();
    } catch (err: unknown) {
      ctx.status =
        (err as { statusCode?: number; status?: number }).statusCode || (err as { status?: number }).status || 500;
      ctx.type = "application/json";
      ctx.body = JSON.stringify({ message: (err as Error).message });
    }
  });

  const apiService = lib({ basePath: "" });
  const { api } = apiService;
  const router = new KoaRouter();

  api
    .get("/koa/get")
    .group("Index")
    .title("基础GET")
    .register((ctx: any) => {
      ctx.reply.json({ data: "koa works" });
    });

  api
    .get("/koa/query")
    .group("Index")
    .title("Query校验")
    .query(z.object({ name: z.string() }))
    .register((ctx: any) => {
      ctx.reply.json({ name: ctx.$params.name });
    });

  api
    .post("/koa/body")
    .group("Index")
    .title("Body校验")
    .body(z.object({ id: z.coerce.number().int() }))
    .register((ctx: any) => {
      ctx.reply.json({ id: ctx.$params.id });
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
      ctx.status =
        (err as { statusCode?: number; status?: number }).statusCode || (err as { status?: number }).status || 500;
      ctx.type = "application/json";
      ctx.body = JSON.stringify({ message: (err as Error).message });
    }
  });

  const apiService = lib({
    forceGroup: true,
    info: { basePath: "" },
    groups: {
      v1: { name: "Version 1", prefix: "/v1" },
      user: { name: "User Group" },
    },
  });

  apiService
    .group("v1")
    .get("/grouped")
    .title("v1分组")
    .register((ctx: any) => {
      ctx.reply.json({ group: "v1 works" });
    });

  apiService
    .group("user")
    .get("/info")
    .title("user分组")
    .query(z.object({ name: z.string() }))
    .register((ctx: any) => {
      ctx.reply.json({ group: "user info", name: ctx.$params.name });
    });

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
