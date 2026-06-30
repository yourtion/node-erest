/**
 * Router binding and configuration tests
 * Tests for API router binding functionality
 * Refactored to use shared utilities and improve readability
 */

import { expressAdapter, koaAdapter, leizmwebAdapter } from "./adapters";

import express from "express";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { compose } from "../lib/adapters/utils.js";
import type { Context } from "../lib/adapters/types.js";
import { commonSchemas, createAllCrudApis, createGetApi, createPostApi } from "./utils/api-helpers";
import { assertApiRegistered, assertThrowsWithMessage } from "./utils/assertion-helpers";
import { createMockHook, createStandardHooks } from "./utils/mock-factories";
import { createTestERestInstance } from "./utils/test-setup";

describe("Router - Basic Binding Functionality", () => {
  describe("Empty Router Binding", () => {
    test("should bind empty router successfully", () => {
      const apiService = createTestERestInstance();
      const router = express.Router();

      apiService.bind({ adapter: expressAdapter, router });

      expect(router.stack.length).toBe(0);
    });
  });

  describe("Router Binding with APIs", () => {
    test("should bind router with multiple APIs successfully", () => {
      const apiService = createTestERestInstance();
      const api = apiService.api;
      const router = express.Router();

      // Create all CRUD APIs using helper
      createAllCrudApis(api);

      apiService.bind({ adapter: expressAdapter, router });

      // Should have multiple routes bound
      expect(router.stack.length).toBeGreaterThan(0);
    });

    test("should register APIs with correct configuration", () => {
      const apiService = createTestERestInstance();
      const api = apiService.api;
      const router = express.Router();

      createGetApi(api, "/test", "Test GET API");
      createPostApi(api, "/test", "Test POST API");

      apiService.bind({ adapter: expressAdapter, router });

      // Verify APIs are registered correctly
      assertApiRegistered(api, "get", "/test", "GET_/test");
      assertApiRegistered(api, "post", "/test", "POST_/test");
    });
  });

  describe("API Modification After Binding", () => {
    test("should prevent API modification after binding", () => {
      const apiService = createTestERestInstance();
      const api = apiService.api;
      const router = express.Router();

      const getApi = createGetApi(api, "/test", "Original Title");

      // Configure API before binding
      getApi.title("Updated Title");
      getApi.query(
        z.object({
          num: z.number().min(0).max(10),
          type: z.enum(["a", "b"]),
        })
      );

      apiService.bind({ adapter: expressAdapter, router });

      // Should throw error when trying to modify after binding
      assertThrowsWithMessage(() => getApi.title("Should Fail"), /已经完成初始化，不能再进行更改/);
    });
  });

  describe("Duplicate Route Prevention", () => {
    test("should prevent binding duplicate routes", () => {
      const apiService = createTestERestInstance();
      const api = apiService.api;

      // Create first API
      createGetApi(api, "/duplicate", "First API");
      createPostApi(api, "/duplicate", "Second API");

      // Attempting to create another GET API with same path should throw
      assertThrowsWithMessage(() => createGetApi(api, "/duplicate", "Duplicate API"), /该API已在文件.*中注册过/);
    });
  });
});

describe("Router - Hook System Integration", () => {
  describe("Hook Order Validation", () => {
    test("should maintain correct hook execution order", async () => {
      const apiService = createTestERestInstance();
      const api = apiService.api;
      const app = express();
      app.use(express.json());

      const hooks = createStandardHooks();
      apiService.beforeHooks(hooks.globalBefore);

      api
        .get("/hook-test")
        .group("Index")
        .title("Hook Test")
        .before(hooks.beforHook)
        .middlewares(hooks.middleware)
        .register(function testHandler(ctx: any) {
          ctx.state.order = ctx.state.order || [];
          ctx.state.order.push("testHandler");
          ctx.reply.json({ order: ctx.state.order });
        });

      apiService.bind({ adapter: expressAdapter, router: app });
      app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.status(500).end((err as Error).message);
      });
      apiService.initTest(app);

      // 标准化后 handler 链被 compose 包装，无法检查 Express routerStack 内部名字。
      // 改为行为测试：hook 记录执行顺序到 ctx.state.order，验证顺序正确。
      const ret = await apiService.test.get("/hook-test").success();
      expect(ret.order).toEqual(["globalBefore", "beforHook", "middleware", "testHandler"]);
    });

    test("should handle APIs without custom hooks", async () => {
      const apiService = createTestERestInstance();
      const api = apiService.api;
      const app = express();
      app.use(express.json());

      const globalBefore = createMockHook("globalBefore");
      apiService.beforeHooks(globalBefore);

      api
        .get("/simple")
        .group("Index")
        .title("Simple API")
        .register(function simpleHandler(ctx: any) {
          ctx.state.order = ctx.state.order || [];
          ctx.state.order.push("simpleHandler");
          ctx.reply.json({ order: ctx.state.order });
        });

      apiService.bind({ adapter: expressAdapter, router: app });
      app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.status(500).end((err as Error).message);
      });
      apiService.initTest(app);

      const ret = await apiService.test.get("/simple").success();
      expect(ret.order).toEqual(["globalBefore", "simpleHandler"]);
    });
  });

  describe("Multiple Hook Types", () => {
    test("should handle multiple before hooks", async () => {
      const apiService = createTestERestInstance();
      const api = apiService.api;
      const app = express();
      app.use(express.json());

      const hook1 = createMockHook("hook1");
      const hook2 = createMockHook("hook2");
      const hook3 = createMockHook("hook3");

      api
        .get("/multi-hooks")
        .group("Index")
        .title("Multi Hooks Test")
        .before(hook1, hook2, hook3)
        .register(function multiHandler(ctx: any) {
          ctx.reply.json({ order: ctx.state.order });
        });

      apiService.bind({ adapter: expressAdapter, router: app });
      app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.status(500).end((err as Error).message);
      });
      apiService.initTest(app);

      const ret = await apiService.test.get("/multi-hooks").success();
      // 三个 before hook 按注册顺序执行（在 checker 与 handler 之前）
      expect(ret.order).toEqual(["hook1", "hook2", "hook3"]);
      expect(hook1).toHaveBeenCalled();
      expect(hook2).toHaveBeenCalled();
      expect(hook3).toHaveBeenCalled();
    });

    test("should handle multiple middleware functions", async () => {
      const apiService = createTestERestInstance();
      const api = apiService.api;
      const app = express();
      app.use(express.json());

      const middleware1 = createMockHook("middleware1");
      const middleware2 = createMockHook("middleware2");

      api
        .get("/multi-middleware")
        .group("Index")
        .title("Multi Middleware Test")
        .middlewares(middleware1, middleware2)
        .register(function middlewareHandler(ctx: any) {
          ctx.reply.json({ order: ctx.state.order });
        });

      apiService.bind({ adapter: expressAdapter, router: app });
      app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.status(500).end((err as Error).message);
      });
      apiService.initTest(app);

      const ret = await apiService.test.get("/multi-middleware").success();
      // middleware 在 checker 之后、handler 之前执行
      expect(ret.order).toEqual(["middleware1", "middleware2"]);
      expect(middleware1).toHaveBeenCalled();
      expect(middleware2).toHaveBeenCalled();
    });
  });
});

describe("Router - Parameter Validation Integration", () => {
  describe("Query Parameter Validation", () => {
    test("should integrate query parameter validation", () => {
      const apiService = createTestERestInstance();
      const api = apiService.api;
      const router = express.Router();

      api
        .get("/query-validation")
        .group("Index")
        .title("Query Validation Test")
        .query(
          z.object({
            search: commonSchemas.name,
            limit: z.coerce.number().int().min(1).max(100),
            sort: z.enum(["asc", "desc"]).optional(),
          })
        )
        .register(function queryHandler(ctx) {
          ctx.reply.json({ message: "Query validation passed" });
        });

      apiService.bind({ adapter: expressAdapter, router });

      // Verify API is registered with query schema
      const apiInfo = api.$apis.get("GET_/query-validation");
      expect(apiInfo?.options.querySchema).toBeDefined();
    });
  });

  describe("Body Parameter Validation", () => {
    test("should integrate body parameter validation", () => {
      const apiService = createTestERestInstance();
      const api = apiService.api;
      const router = express.Router();

      api
        .post("/body-validation")
        .group("Index")
        .title("Body Validation Test")
        .body(
          z.object({
            name: commonSchemas.name,
            age: commonSchemas.age,
            email: z.string().email().optional(),
          })
        )
        .register(function bodyHandler(ctx) {
          ctx.reply.json({ message: "Body validation passed" });
        });

      apiService.bind({ adapter: expressAdapter, router });

      const apiInfo = api.$apis.get("POST_/body-validation");
      expect(apiInfo?.options.bodySchema).toBeDefined();
    });
  });

  describe("Path Parameter Validation", () => {
    test("should integrate path parameter validation", () => {
      const apiService = createTestERestInstance();
      const api = apiService.api;
      const router = express.Router();

      api
        .get("/users/:id/posts/:postId")
        .group("Index")
        .title("Path Validation Test")
        .params(z.object({ id: commonSchemas.id, postId: z.string() }))
        .register(function pathHandler(ctx) {
          ctx.reply.json({ message: "Path validation passed" });
        });

      apiService.bind({ adapter: expressAdapter, router });

      const apiInfo = api.$apis.get("GET_/users/:id/posts/:postId");
      expect(apiInfo?.options.paramsSchema).toBeDefined();
    });
  });

  describe("Header Parameter Validation", () => {
    test("should integrate header parameter validation", () => {
      const apiService = createTestERestInstance();
      const api = apiService.api;
      const router = express.Router();

      api
        .get("/header-validation")
        .group("Index")
        .title("Header Validation Test")
        .headers(
          z.object({
            authorization: z.string(),
            "content-type": z.string().optional(),
          })
        )
        .register(function headerHandler(ctx) {
          ctx.reply.json({ message: "Header validation passed" });
        });

      apiService.bind({ adapter: expressAdapter, router });

      // Verify API is registered with header schema
      const apiInfo = api.$apis.get("GET_/header-validation");
      expect(apiInfo?.options.headersSchema).toBeDefined();
    });
  });
});

describe("Router - Advanced Configuration", () => {
  describe("API Definition Method", () => {
    test("should support define method for API creation", () => {
      const apiService = createTestERestInstance();
      const api = apiService.api;
      const router = express.Router();

      const apiDefinition = {
        method: "patch" as const,
        path: "/defined-api",
        group: "Index",
        title: "Defined API",
        description: "API created using define method",
        query: z.object({ version: z.string().optional() }),
        body: z.object({ data: z.unknown() }),
        headers: z.object({ "x-api-key": z.string() }),
        handler: function definedHandler(ctx) {
          ctx.reply.json({ message: "Defined API response" });
        },
      };

      api.define(apiDefinition);
      apiService.bind({ adapter: expressAdapter, router });

      // Verify API is registered correctly
      const apiInfo = api.$apis.get("PATCH_/defined-api");
      expect(apiInfo?.options.title).toBe("Defined API");
      expect(apiInfo?.options.description).toBe("API created using define method");
      expect(apiInfo?.options.method).toBe("patch");
    });
  });

  describe("Response Configuration", () => {
    test("should handle response schema configuration", () => {
      const apiService = createTestERestInstance();
      const api = apiService.api;
      const router = express.Router();

      const responseSchema = z.object({
        success: z.boolean(),
        data: z.unknown().optional(),
        message: z.string().optional(),
      });

      api
        .get("/response-schema")
        .group("Index")
        .title("Response Schema Test")
        .response(responseSchema)
        .register(function responseHandler(ctx) {
          ctx.reply.json({
            success: true,
            data: { id: 1, name: "Test" },
            message: "Success",
          });
        });

      apiService.bind({ adapter: expressAdapter, router });

      // Verify response schema is configured
      const apiInfo = api.$apis.get("GET_/response-schema");
      expect(apiInfo?.options.response).toEqual(responseSchema);
    });
  });

  describe("Example Configuration", () => {
    test("should handle API examples configuration", () => {
      const apiService = createTestERestInstance();
      const api = apiService.api;
      const router = express.Router();

      const exampleData = {
        input: { name: "John Doe", age: 30 },
        output: { success: true, id: 123 },
      };

      api
        .post("/example-api")
        .group("Index")
        .title("Example API")
        .body(z.object({ name: commonSchemas.name, age: commonSchemas.age }))
        .example(exampleData)
        .register(function exampleHandler(ctx) {
          ctx.reply.json({ success: true, id: 123 });
        });

      apiService.bind({ adapter: expressAdapter, router });

      // Verify example is configured
      const apiInfo = api.$apis.get("POST_/example-api");
      expect(apiInfo?.options.examples).toContain(exampleData);
    });
  });
});

describe("Router - Error Handling and Edge Cases", () => {
  describe("Invalid Router Configuration", () => {
    test("should handle empty bind without throwing", () => {
      const apiService = createTestERestInstance();
      const router = express.Router();

      // bind 无 API 时不应抛错
      expect(() => {
        apiService.bind({ adapter: expressAdapter, router });
      }).not.toThrow();
    });
  });

  describe("API Registration Edge Cases", () => {
    test("should handle APIs without handlers", () => {
      const apiService = createTestERestInstance();
      const api = apiService.api;
      const router = express.Router();

      // Create API without registering handler
      api.get("/incomplete").group("Index").title("Incomplete API");

      // Binding router with incomplete APIs should throw an error
      expect(() => {
        apiService.bind({ adapter: expressAdapter, router });
      }).toThrow();
    });

    test("should handle APIs with empty paths", () => {
      const apiService = createTestERestInstance();
      const api = apiService.api;

      // Empty path should throw an error as paths must start with "/"
      expect(() => {
        api
          .get("")
          .group("Index")
          .title("Empty Path API")
          .register(function emptyPathHandler(ctx) {
            ctx.reply.send("Empty path response");
          });
      }).toThrow(/必须以.*开头/);
    });
  });

  describe("Memory and Performance", () => {
    test("should handle large number of APIs efficiently", () => {
      const apiService = createTestERestInstance();
      const api = apiService.api;
      const router = express.Router();

      // Create many APIs
      const apiCount = 100;
      for (let i = 0; i < apiCount; i++) {
        api
          .get(`/api-${i}`)
          .group("Index")
          .title(`API ${i}`)
          .register(function dynamicHandler(ctx) {
            ctx.reply.json({ id: i, message: `API ${i} response` });
          });
      }

      const startTime = Date.now();
      apiService.bind({ adapter: expressAdapter, router });
      const endTime = Date.now();

      // Should bind all APIs
      expect(router.stack.length).toBe(apiCount);

      // Should complete in reasonable time (less than 1 second)
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });
});

describe("Router - Unified bind() Method", () => {
  describe("Express Framework", () => {
    test("should bind router using unified bind() method", () => {
      const apiService = createTestERestInstance();
      const api = apiService.api;
      const router = express.Router();

      api
        .get("/unified-test")
        .group("Index")
        .title("Unified Bind Test")
        .register(function unifiedHandler(ctx) {
          ctx.reply.send("Unified bind response");
        });

      apiService.bind({ adapter: expressAdapter, router });

      expect(router.stack.length).toBe(1);
      expect(router.stack[0].route?.path).toBe("/unified-test");
    });

    test("should throw error when router is not provided in non-forceGroup mode", () => {
      const apiService = createTestERestInstance();
      const api = apiService.api;

      api
        .get("/test")
        .group("Index")
        .title("Test")
        .register((ctx) => ctx.reply.send("ok"));

      expect(() => {
        apiService.bind({ adapter: expressAdapter });
      }).toThrow();
    });

    test("should include params checker in handler chain (validated via behavior)", async () => {
      const apiService = createTestERestInstance();
      const api = apiService.api;
      const app = express();
      app.use(express.json());

      api
        .get("/with-params")
        .group("Index")
        .title("Params Test")
        .query(z.object({ name: z.string() }))
        .register(function paramsHandler(ctx: any) {
          ctx.reply.json({ name: ctx.$params.name });
        });

      apiService.bind({ adapter: expressAdapter, router: app });
      app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.status(400).end((err as Error).message);
      });
      apiService.initTest(app);

      // 标准化后 checker 在 compose 链内部，无法通过 routerStack 名字验证。
      // 改为行为测试：缺参应校验失败、有参应成功（证明 checker 在链中执行）。
      const err = await apiService.test.get("/with-params").error();
      expect(err).toBeInstanceOf(Error);
      const ret = await apiService.test.get("/with-params").query({ name: "ok" }).success();
      expect(ret).toEqual({ name: "ok" });
    });
  });

  describe("Koa Framework", () => {
    test("should bind routes to a real koa-router using koa adapter", () => {
      const KoaRouter = require("koa-router");
      const apiService = createTestERestInstance();
      const api = apiService.api;
      const router = new KoaRouter();

      api
        .get("/koa-test")
        .group("Index")
        .title("Koa Test")
        .register(function koaHandler(ctx) {
          ctx.reply.send("ok");
        });

      apiService.bind({ adapter: koaAdapter, router });

      // koa-router keeps registered layers in router.stack
      expect(router.stack.length).toBe(1);
      expect(router.stack[0].path).toBe("/koa-test");
      expect(router.stack[0].methods).toContain("GET");
    });

    test("should include params checker in koa handler chain (validated via registration)", () => {
      const KoaRouter = require("koa-router");
      const apiService = createTestERestInstance();
      const api = apiService.api;
      const router = new KoaRouter();

      api
        .get("/koa-params")
        .group("Index")
        .title("Koa Params Test")
        .query(z.object({ name: z.string() }))
        .register(function koaParamsHandler(_ctx: any) {});

      apiService.bind({ adapter: koaAdapter, router });

      // 标准化后 checker 在 compose 链内部，验证路由已注册（含 checker 的链被包装为一个中间件）
      expect(router.stack.length).toBe(1);
      expect(router.stack[0].path).toBe("/koa-params");
    });
  });

  describe("@leizm/web Framework", () => {
    test("should bind routes to a real @leizm/web Router using leizmweb adapter", () => {
      const { Router } = require("@leizm/web");
      const apiService = createTestERestInstance();
      const api = apiService.api;
      const router = new Router();

      api
        .get("/leizm-test")
        .group("Index")
        .title("Leizm Test")
        .register(function leizmHandler(ctx) {
          ctx.reply.send("ok");
        });

      apiService.bind({ adapter: leizmwebAdapter, router });

      // @leizm/web Router stores each handler as a separate layer, with path info in `raw`
      const paths = router.stack.map((layer: { raw?: { path?: string } }) => layer.raw?.path);
      expect(paths).toContain("/leizm-test");
    });

    test("should bind handler chain per route (checker + handler wrapped)", () => {
      const { Router } = require("@leizm/web");
      const apiService = createTestERestInstance();
      const api = apiService.api;
      const router = new Router();

      api
        .get("/leizm-params")
        .group("Index")
        .title("Leizm Params Test")
        .query(z.object({ name: z.string() }))
        .register(function leizmParamsHandler(_ctx: any) {});

      apiService.bind({ adapter: leizmwebAdapter, router });

      // 标准化后 checker + handler 被 compose 包装为单个中间件，注册为一个 layer
      const matching = router.stack.filter((layer: { raw?: { path?: string } }) => layer.raw?.path === "/leizm-params");
      expect(matching.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// compose 洋葱模型单元测试（bind 路由的中间件链核心，直接 import 源码确保 coverage）
describe("compose 洋葱模型", () => {
  /** 构造最小 Context */
  function mockCtx(): Context {
    return {
      method: "GET",
      path: "/",
      headers: {},
      params: {},
      query: {},
      body: {},
      state: {},
      reply: { status: () => undefined, json: () => undefined, send: () => undefined, raw: {} },
    } as Context;
  }

  test("按顺序执行中间件链（洋葱：next 前后）", async () => {
    const order: string[] = [];
    const mws = [
      (ctx: Context, next: () => Promise<void>) => {
        order.push("a-before");
        return next().then(() => order.push("a-after"));
      },
      (_ctx: Context, next: () => Promise<void>) => {
        order.push("b");
        return next();
      },
    ];
    await compose(mws)(mockCtx());
    expect(order).toEqual(["a-before", "b", "a-after"]);
  });

  test("不调 next 则终止后续链", async () => {
    const order: string[] = [];
    const mws = [
      () => {
        order.push("a");
      },
      () => {
        order.push("b");
      },
    ];
    await compose(mws)(mockCtx());
    expect(order).toEqual(["a"]);
  });

  test("中间件 reject 向上抛", async () => {
    const mws = [() => Promise.reject(new Error("boom"))];
    await expect(compose(mws)(mockCtx())).rejects.toThrow("boom");
  });

  test("中间件同步抛错也 reject", async () => {
    const mws = [
      () => {
        throw new Error("sync-boom");
      },
    ];
    await expect(compose(mws)(mockCtx())).rejects.toThrow("sync-boom");
  });

  test("next 重复调用时报错（防循环）", async () => {
    const mws = [
      async (_ctx: Context, next: () => Promise<void>) => {
        await next();
        await next();
      },
    ];
    await expect(compose(mws)(mockCtx())).rejects.toThrow("next() called multiple times");
  });

  test("空中间件链直接完成", async () => {
    const ret = await compose([])(mockCtx());
    expect(ret).toBeUndefined();
  });
});
