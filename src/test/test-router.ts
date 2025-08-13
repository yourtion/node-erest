/**
 * Router binding and configuration tests
 * Tests for API router binding functionality
 * Refactored to use shared utilities and improve readability
 */

import express from "express";
import { describe, expect, test } from "vitest";
import { build, TYPES } from "./helper";
import lib from "./lib";
import { commonParams, createAllCrudApis, createGetApi, createPostApi } from "./utils/api-helpers";
import { assertApiRegistered, assertRouterStackOrder, assertThrowsWithMessage } from "./utils/assertion-helpers";
import { createMockHook, createStandardHooks, STANDARD_HOOK_ORDER } from "./utils/mock-factories";
import { createTestERestInstance, setupExpressTest } from "./utils/test-setup";

describe("Router - Basic Binding Functionality", () => {
  describe("Empty Router Binding", () => {
    test("should bind empty router successfully", () => {
      const apiService = createTestERestInstance();
      const router = express.Router();

      apiService.bindRouter(router, apiService.checkerExpress);

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

      apiService.bindRouter(router, apiService.checkerExpress);

      // Should have multiple routes bound
      expect(router.stack.length).toBeGreaterThan(0);
    });

    test("should register APIs with correct configuration", () => {
      const apiService = createTestERestInstance();
      const api = apiService.api;
      const router = express.Router();

      const getApi = createGetApi(api, "/test", "Test GET API");
      const postApi = createPostApi(api, "/test", "Test POST API");

      apiService.bindRouter(router, apiService.checkerExpress);

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
      getApi.query({
        num: build(TYPES.Number, "Number", true, 10, { max: 10, min: 0 }),
        type: build(TYPES.ENUM, "ENUM", true, undefined, ["a", "b"]),
      });

      apiService.bindRouter(router, apiService.checkerExpress);

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
    test("should maintain correct hook execution order", () => {
      const apiService = createTestERestInstance();
      const api = apiService.api;
      const router = express.Router();

      // Create standard hooks
      const hooks = createStandardHooks();

      // Register global hooks
      apiService.beforeHooks(hooks.globalBefore);
      apiService.afterHooks(hooks.globalAfter);

      // Create API with hooks
      api
        .get("/hook-test")
        .group("Index")
        .title("Hook Test")
        .before(hooks.beforHook)
        .middlewares(hooks.middleware)
        .register(function testHandler(_req: any, res: any) {
          res.end("Hook Test Response");
        });

      apiService.bindRouter(router, apiService.checkerExpress);

      expect(router.stack.length).toBe(1);

      // Verify hook order
      const routerStack = router.stack[0].route?.stack;
      if (!routerStack) {
        throw new Error("Router stack is undefined");
      }

      assertRouterStackOrder(routerStack, [
        "globalBefore",
        "beforHook",
        "apiParamsChecker",
        "middleware",
        "testHandler",
      ]);
    });

    test("should handle APIs without custom hooks", () => {
      const apiService = createTestERestInstance();
      const api = apiService.api;
      const router = express.Router();

      // Create global hooks only
      const globalBefore = createMockHook("globalBefore");
      apiService.beforeHooks(globalBefore);

      // Create simple API without custom hooks
      api
        .get("/simple")
        .group("Index")
        .title("Simple API")
        .register(function simpleHandler(_req: any, res: any) {
          res.end("Simple Response");
        });

      apiService.bindRouter(router, apiService.checkerExpress);

      const routerStack = router.stack[0].route?.stack;
      if (!routerStack) {
        throw new Error("Router stack is undefined");
      }

      assertRouterStackOrder(routerStack, ["globalBefore", "apiParamsChecker", "simpleHandler"]);
    });
  });

  describe("Multiple Hook Types", () => {
    test("should handle multiple before hooks", () => {
      const apiService = createTestERestInstance();
      const api = apiService.api;
      const router = express.Router();

      const hook1 = createMockHook("hook1");
      const hook2 = createMockHook("hook2");
      const hook3 = createMockHook("hook3");

      api
        .get("/multi-hooks")
        .group("Index")
        .title("Multi Hooks Test")
        .before(hook1, hook2, hook3)
        .register(function multiHandler(_req: any, res: any) {
          res.end("Multi Hooks Response");
        });

      apiService.bindRouter(router, apiService.checkerExpress);

      const routerStack = router.stack[0].route?.stack;
      if (!routerStack) {
        throw new Error("Router stack is undefined");
      }

      // Should include all hooks in order
      const hookNames = routerStack.map((r: { name: string }) => r.name);
      expect(hookNames).toContain("hook1");
      expect(hookNames).toContain("hook2");
      expect(hookNames).toContain("hook3");
      expect(hookNames).toContain("apiParamsChecker");
      expect(hookNames).toContain("multiHandler");
    });

    test("should handle multiple middleware functions", () => {
      const apiService = createTestERestInstance();
      const api = apiService.api;
      const router = express.Router();

      const middleware1 = createMockHook("middleware1");
      const middleware2 = createMockHook("middleware2");

      api
        .get("/multi-middleware")
        .group("Index")
        .title("Multi Middleware Test")
        .middlewares(middleware1, middleware2)
        .register(function middlewareHandler(_req: any, res: any) {
          res.end("Multi Middleware Response");
        });

      apiService.bindRouter(router, apiService.checkerExpress);

      const routerStack = router.stack[0].route?.stack;
      if (!routerStack) {
        throw new Error("Router stack is undefined");
      }

      const hookNames = routerStack.map((r: { name: string }) => r.name);
      expect(hookNames).toContain("middleware1");
      expect(hookNames).toContain("middleware2");
      expect(hookNames).toContain("middlewareHandler");
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
        .query({
          search: commonParams.name,
          limit: build(TYPES.Integer, "Limit", false, 10, { min: 1, max: 100 }),
          sort: build(TYPES.ENUM, "Sort", false, "asc", ["asc", "desc"]),
        })
        .register(function queryHandler(_req: any, res: any) {
          res.json({ message: "Query validation passed" });
        });

      apiService.bindRouter(router, apiService.checkerExpress);

      // Verify API is registered with query parameters
      const apiInfo = api.$apis.get("GET_/query-validation");
      expect(apiInfo?.options.query).toBeDefined();
      expect(apiInfo?.options.query.search).toEqual(commonParams.name);
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
        .body({
          name: commonParams.name,
          age: commonParams.age,
          email: build(TYPES.String, "Email", false),
        })
        .required(["name"])
        .register(function bodyHandler(_req: any, res: any) {
          res.json({ message: "Body validation passed" });
        });

      apiService.bindRouter(router, apiService.checkerExpress);

      // Verify API is registered with body parameters
      const apiInfo = api.$apis.get("POST_/body-validation");
      expect(apiInfo?.options.body).toBeDefined();
      expect(apiInfo?.options.required).toContain("name");
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
        .params({
          id: commonParams.id,
          postId: build(TYPES.String, "Post ID", true),
        })
        .register(function pathHandler(_req: any, res: any) {
          res.json({ message: "Path validation passed" });
        });

      apiService.bindRouter(router, apiService.checkerExpress);

      // Verify API is registered with path parameters
      const apiInfo = api.$apis.get("GET_/users/:id/posts/:postId");
      expect(apiInfo?.options.params).toBeDefined();
      expect(apiInfo?.options.params.id).toEqual(commonParams.id);
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
        .headers({
          authorization: build(TYPES.String, "Authorization", true),
          "content-type": build(TYPES.String, "Content Type", false, "application/json"),
        })
        .register(function headerHandler(_req: any, res: any) {
          res.json({ message: "Header validation passed" });
        });

      apiService.bindRouter(router, apiService.checkerExpress);

      // Verify API is registered with header parameters
      const apiInfo = api.$apis.get("GET_/header-validation");
      expect(apiInfo?.options.headers).toBeDefined();
      expect(apiInfo?.options.headers.authorization).toBeDefined();
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
        query: {
          version: build(TYPES.String, "API Version", false, "v1"),
        },
        body: {
          data: build(TYPES.JSON, "Request Data", true),
        },
        headers: {
          "x-api-key": build(TYPES.String, "API Key", true),
        },
        required: ["data"],
        handler: function definedHandler(_req: any, res: any) {
          res.json({ message: "Defined API response" });
        },
      };

      api.define(apiDefinition);
      apiService.bindRouter(router, apiService.checkerExpress);

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

      const responseSchema = {
        success: build(TYPES.Boolean, "Success", true),
        data: build(TYPES.JSON, "Response Data", false),
        message: build(TYPES.String, "Message", false),
      };

      api
        .get("/response-schema")
        .group("Index")
        .title("Response Schema Test")
        .response(responseSchema)
        .register(function responseHandler(_req: any, res: any) {
          res.json({
            success: true,
            data: { id: 1, name: "Test" },
            message: "Success",
          });
        });

      apiService.bindRouter(router, apiService.checkerExpress);

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
        .body({
          name: commonParams.name,
          age: commonParams.age,
        })
        .example(exampleData)
        .register(function exampleHandler(_req: any, res: any) {
          res.json({ success: true, id: 123 });
        });

      apiService.bindRouter(router, apiService.checkerExpress);

      // Verify example is configured
      const apiInfo = api.$apis.get("POST_/example-api");
      expect(apiInfo?.options.examples).toContain(exampleData);
    });
  });
});

describe("Router - Error Handling and Edge Cases", () => {
  describe("Invalid Router Configuration", () => {
    test("should handle null router gracefully", () => {
      const apiService = createTestERestInstance();

      // Test that null router is handled without throwing
      expect(() => {
        apiService.bindRouter(null as any, apiService.checkerExpress);
      }).not.toThrow();
    });

    test("should handle invalid checker function", () => {
      const apiService = createTestERestInstance();
      const router = express.Router();

      // Test that null checker is handled without throwing
      expect(() => {
        apiService.bindRouter(router, null as any);
      }).not.toThrow();
    });
  });

  describe("API Registration Edge Cases", () => {
    test("should handle APIs without handlers", () => {
      const apiService = createTestERestInstance();
      const api = apiService.api;
      const router = express.Router();

      // Create API without registering handler
      const incompleteApi = api.get("/incomplete").group("Index").title("Incomplete API");

      // Binding router with incomplete APIs should throw an error
      expect(() => {
        apiService.bindRouter(router, apiService.checkerExpress);
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
          .register(function emptyPathHandler(_req: any, res: any) {
            res.end("Empty path response");
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
          .register(function dynamicHandler(_req: any, res: any) {
            res.json({ id: i, message: `API ${i} response` });
          });
      }

      const startTime = Date.now();
      apiService.bindRouter(router, apiService.checkerExpress);
      const endTime = Date.now();

      // Should bind all APIs
      expect(router.stack.length).toBe(apiCount);

      // Should complete in reasonable time (less than 1 second)
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });
});
