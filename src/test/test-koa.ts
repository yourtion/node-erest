import Koa from "koa";
import bodyParser from "koa-bodyparser";
import KoaRouter from "koa-router";
import { TYPES } from "./helper";
import lib from "./lib";

// Helper to set up ERest instance for forceGroup: true
const setupERestWithGroup = () => {
  return lib({
    forceGroup: true,
    groups: {
      v1: { name: "Version 1", prefix: "/v1" },
      user: { name: "User Group" },
    },
  });
};

describe("ERest Koa Integration", () => {
  let server: import("http").Server;
  afterAll(() => {
    server.close();
  });
  describe("forceGroup: false", () => {
    const app = new Koa();
    app.use(bodyParser());
    app.use(async (ctx, next) => {
      try {
        await next();
      } catch (err: unknown) {
        ctx.status =
          (err as { statusCode?: number; status?: number }).statusCode || (err as { status?: number }).status || 500;
        ctx.body = JSON.stringify({ message: (err as Error).message });
      }
    });
    const apiService = lib();
    const router = new KoaRouter();
    server = app.listen();
    apiService.initTest(server);
    const { api } = apiService;

    api
      .get("/test-koa")
      .group("Index")
      .register((ctx: any) => {
        ctx.reply.json({ data: "koa works" });
      });
    api
      .get("/query-test")
      .group("Index")
      .query({ name: { type: TYPES.String, required: true } })
      .register((ctx: any) => {
        ctx.reply.json({ name: ctx.$params.name });
      });
    api
      .post("/body-test")
      .group("Index")
      .body({ id: { type: TYPES.Integer, required: true } })
      .register((ctx: any) => {
        ctx.reply.json({ id: ctx.$params.id });
      });

    apiService.bindRouter(router, apiService.checkerKoa);
    app.use(router.routes()).use(router.allowedMethods());

    it("should handle basic GET request (execution)", async () => {
      const ret = await apiService.test.get("/test-koa").success();
      expect(ret).toStrictEqual({ data: "koa works" });
    });
    it("should validate query parameters (execution)", async () => {
      const ret = await apiService.test.get("/query-test").query({ name: "tester" }).success();
      expect(ret).toStrictEqual({ name: "tester" });
    });
    it("should validate POST body parameters (success)", async () => {
      const ret = await apiService.test.post("/body-test").input({ id: "abc" }).error();
      expect(ret).toBeInstanceOf(Error);
    });
    it("should validate POST body parameters (error)", async () => {
      const ret1 = await apiService.test.post("/body-test").input({ id: 123 }).success();
      expect(ret1).toStrictEqual({ id: 123 });
    });
  });

  describe("forceGroup: true", () => {
    const appGroup = new Koa();
    appGroup.use(bodyParser());
    const erestGroup = setupERestWithGroup();
    server = appGroup.listen();
    erestGroup.initTest(server);

    erestGroup
      .group("v1")
      .get("/grouped-test")
      .register((ctx: any) => {
        ctx.reply.json({ group: "v1 works" });
      });
    erestGroup
      .group("user")
      .get("/info")
      .register((ctx: any) => {
        ctx.reply.json({ group: "user info" });
      });

    erestGroup.bindKoaRouterToApp(appGroup, KoaRouter, erestGroup.checkerKoa);

    it("should handle basic GET request in a group with explicit prefix (execution)", async () => {
      const ret = await erestGroup.test.get("/v1/grouped-test").success();
      expect(ret).toStrictEqual({ group: "v1 works" });
    });
    it("should handle GET request in a group with default prefix (execution)", async () => {
      const ret = await erestGroup.test.get("/user/info").success();
      expect(ret).toStrictEqual({ group: "user info" });
    });
  });
});
