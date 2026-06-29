/**
 * @file @leizm/web Integration Tests
 * @author Yourtion Guo <yourtion@gmail.com>
 *
 * 真实集成测试：使用真实的 @leizm/web Application + Router + bodyParser，
 * 覆盖统一 bind() 方法的 forceGroup 与非 forceGroup 两种模式，
 * 以及 LeizmWebAdapter 的 createGroupRouter / attachGroupRouter 路径。
 *
 * 标准化改造后：handler 用标准签名 (ctx)，经 ctx.reply 写响应、ctx.$params 读校验后参数。
 */

import { leizmwebAdapter } from "./adapters";

import { Application, component, Router } from "@leizm/web";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import lib from "./lib";

describe("@leizm/web Integration - bind() 非 forceGroup 模式", () => {
  const app = new Application();
  app.use("/", component.bodyParser.json());

  const apiService = lib({ basePath: "" });
  const { api } = apiService;
  const router = new Router();

  api
    .get("/lei/get")
    .group("Index")
    .title("基础GET")
    .register((ctx: any) => {
      ctx.reply.json({ data: "leizmweb works" });
    });

  api
    .get("/lei/query")
    .group("Index")
    .title("Query校验")
    .query(z.object({ name: z.string() }))
    .register((ctx: any) => {
      ctx.reply.json({ name: ctx.$params.name });
    });

  api
    .post("/lei/body")
    .group("Index")
    .title("Body校验")
    .body(z.object({ id: z.coerce.number().int() }))
    .register((ctx: any) => {
      ctx.reply.json({ id: ctx.$params.id });
    });

  apiService.bind({ adapter: leizmwebAdapter, router });
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

  apiService.bind({ adapter: leizmwebAdapter, app, router: Router });

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

/**
 * 错误 re-throw 能力验证：adapter 不应吞错写死 {error}，而应 re-throw 让 app 级错误中间件
 * 统一处理（与 express/koa adapter + README「app 级错误中间件」约定对齐）。
 * 用真实 HTTP fetch 验证（不走 test 脚手架的 .error()，因其依赖框架错误响应形状）。
 */
describe("@leizm/web Integration - 错误 re-throw", () => {
  const app = new Application();
  app.use("/", component.bodyParser.json());

  const apiService = lib({ basePath: "" });
  const { api } = apiService;
  const router = new Router();

  // 故意抛一个带 statusCode 的业务错误
  api
    .get("/lei/boom")
    .group("Index")
    .title("抛错")
    .register((_ctx: any) => {
      const e: any = new Error("业务错误");
      e.statusCode = 418;
      throw e;
    });

  apiService.bind({ adapter: leizmwebAdapter, router });
  app.use("/", router);
  // app 级错误中间件（双参数）：捕获 re-throw 的错并写自定义信封
  app.use("/", ((ctx: any, err?: any) => {
    if (!err) return ctx.next();
    ctx.response.status(err.statusCode || 500).json({ success: false, error: { code: "ERR", message: err.message } });
  }) as any);

  let port = 0;
  beforeAll(async () => {
    await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    port = (app.server.address() as any).port;
  });
  afterAll(() => app.server.close());

  it("handler 抛错应被 app 级错误中间件捕获（re-throw，非吞错）", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/lei/boom`);
    expect(res.status).toBe(418);
    const body = await res.json();
    expect(body).toStrictEqual({ success: false, error: { code: "ERR", message: "业务错误" } });
  });
});
