/**
 * @file @leizm/web Integration Tests
 * @author Yourtion Guo <yourtion@gmail.com>
 *
 * 真实集成测试：使用真实的 @leizm/web Application + Router + bodyParser，
 * 覆盖统一 bind() 方法的 forceGroup 与非 forceGroup 两种模式，
 * 以及 LeizmWebAdapter 的 createGroupRouter / attachGroupRouter 路径。
 */

import { Application, component, type Context as LeiContext, Router } from "@leizm/web";
import { afterAll, describe, expect, it } from "vitest";
import { build, TYPES } from "./helper";
import lib from "./lib";

function returnJson(ctx: LeiContext, data: unknown) {
  ctx.response.json(data);
}

describe("@leizm/web Integration - bind() 非 forceGroup 模式", () => {
  const app = new Application();
  // 内置 body 解析中间件，用于读取 POST body
  app.use("/", component.bodyParser.json());

  const apiService = lib({ basePath: "" });
  const { api } = apiService;
  const router = new Router();

  api
    .get("/lei/get")
    .group("Index")
    .title("基础GET")
    .register((ctx: LeiContext) => {
      returnJson(ctx, { data: "leizmweb works" });
    });

  api
    .get("/lei/query")
    .group("Index")
    .title("Query校验")
    .query({ name: build(TYPES.String, "名称", true) })
    .register((ctx: LeiContext) => {
      returnJson(ctx, { name: ctx.request.$params.name });
    });

  api
    .post("/lei/body")
    .group("Index")
    .title("Body校验")
    .body({ id: build(TYPES.Integer, "ID", true) })
    .register((ctx: LeiContext) => {
      returnJson(ctx, { id: ctx.request.$params.id });
    });

  apiService.bind({ framework: "leizmweb", router });
  app.use("/", router);

  apiService.initTest(app.server);
  afterAll(() => app.server.close());

  it("应正确处理基础 GET 请求", async () => {
    const ret = await apiService.test.get("/lei/get").success();
    expect(ret).toStrictEqual({ data: "leizmweb works" });
  });

  it("应校验 query 参数（成功）", async () => {
    const ret = await apiService.test.get("/lei/query").query({ name: "tester" }).success();
    expect(ret).toStrictEqual({ name: "tester" });
  });

  it("应校验 query 参数（失败 - 缺少必填）", async () => {
    const ret = await apiService.test.get("/lei/query").error();
    expect(ret).toBeInstanceOf(Error);
  });

  it("应校验 body 参数（成功）", async () => {
    const ret = await apiService.test.post("/lei/body").input({ id: 123 }).success();
    expect(ret).toStrictEqual({ id: 123 });
  });

  it("应校验 body 参数（失败 - 类型错误）", async () => {
    const ret = await apiService.test.post("/lei/body").input({ id: "abc" }).error();
    expect(ret).toBeInstanceOf(Error);
  });
});

describe("@leizm/web Integration - bind() forceGroup 模式", () => {
  const app = new Application();
  app.use("/", component.bodyParser.json());

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
    .register((ctx: LeiContext) => {
      returnJson(ctx, { group: "v1 works" });
    });

  apiService
    .group("user")
    .get("/info")
    .title("user分组")
    .query({ name: build(TYPES.String, "名称", true) })
    .register((ctx: LeiContext) => {
      returnJson(ctx, { group: "user info", name: ctx.request.$params.name });
    });

  // forceGroup 模式：提供 app 和 Router 构造函数
  // 此调用覆盖 LeizmWebAdapter.createGroupRouter 与 attachGroupRouter
  apiService.bind({ framework: "leizmweb", app, router: Router });

  apiService.initTest(app.server);
  afterAll(() => app.server.close());

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
