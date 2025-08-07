import express from "express";
import { vi } from "vitest";
import { z } from "zod";
import { getCallerSourceLine, getPath } from "../lib/utils";
import { build, TYPES } from "./helper";
import lib, { GROUPS, INFO } from "./lib";
import ERest from "../lib";
import type { IApiOption } from "../lib";

describe("ERest - 基础测试", () => {
  const apiService = lib();

  test("ERest - 信息初始化", () => {
    const libInfo = apiService.privateInfo.info;
    expect(libInfo.title).toBe(INFO.title);
    expect(libInfo.description).toBe(INFO.description);
    expect(libInfo.version).toBe(INFO.version);
    expect(libInfo.host).toBe(INFO.host);
  });

// Comprehensive tests for index.ts functionality
describe("ERest - Comprehensive Index Tests", () => {
  describe("Constructor and Initialization", () => {
    test("should create ERest instance with default options", () => {
      const erest = new ERest({});
      expect(erest.privateInfo.info).toEqual({});
      expect(erest.api.$apis.size).toBe(0);
    });

    test("should create ERest instance with custom options", () => {
      const customOptions: IApiOption = {
        info: {
          title: "Test API",
          description: "Test Description",
          version: new Date("2023-01-01"),
          host: "localhost",
          basePath: "/api"
        },
        path: "/custom/path",
        forceGroup: true,
        groups: {
          v1: "Version 1",
          user: { name: "User Management", prefix: "/users" }
        },
        docs: {
          markdown: true,
          swagger: true,
          json: false
        }
      };

      const erest = new ERest(customOptions);
      expect(erest.privateInfo.info.title).toBe("Test API");
      expect(erest.privateInfo.info.description).toBe("Test Description");
      expect(erest.privateInfo.groups.v1).toBe("Version 1");
      expect(erest.privateInfo.groups.user).toBe("User Management");
      expect(erest.privateInfo.groupInfo.user.prefix).toBe("/users");
    });

    test("should handle custom error functions", () => {
      const customMissingError = (msg: string) => new Error(`Custom missing: ${msg}`);
      const customInvalidError = (msg: string) => new Error(`Custom invalid: ${msg}`);
      const customInternalError = (msg: string) => new Error(`Custom internal: ${msg}`);

      const erest = new ERest({
        missingParameterError: customMissingError,
        invalidParameterError: customInvalidError,
        internalError: customInternalError
      });

      expect(erest.privateInfo.error.missingParameter("test").message).toBe("Custom missing: test");
      expect(erest.privateInfo.error.invalidParameter("test").message).toBe("Custom invalid: test");
      expect(erest.privateInfo.error.internalError("test").message).toBe("Custom internal: test");
    });
  });

  describe("Type Management", () => {
    test("should register and retrieve custom types", () => {
      const erest = new ERest({});
      const customSchema = z.string().min(5);
      
      erest.type.register("CustomString", customSchema);
      expect(erest.type.has("CustomString")).toBe(true);
      expect(erest.type.get("CustomString")).toBe(customSchema);
    });

    test("should validate values with registered types", () => {
      const erest = new ERest({});
      const customSchema = z.string().min(5);
      erest.type.register("CustomString", customSchema);

      const validResult = erest.type.value("CustomString", "hello world");
      expect(validResult.ok).toBe(true);
      expect(validResult.value).toBe("hello world");

      const invalidResult = erest.type.value("CustomString", "hi");
      expect(invalidResult.ok).toBe(false);
      expect(invalidResult.message).toContain("Too small");
    });

    test("should handle unknown types", () => {
      const erest = new ERest({});
      const result = erest.type.value("UnknownType", "test");
      expect(result.ok).toBe(false);
      expect(result.message).toBe("Unknown type: UnknownType");
      expect(result.value).toBe("test");
    });
  });

  describe("Schema Management", () => {
    test("should register and retrieve schemas", () => {
      const erest = new ERest({});
      const testSchema = z.object({ name: z.string() });
      
      erest.schema.register("TestSchema", testSchema);
      expect(erest.schema.has("TestSchema")).toBe(true);
      expect(erest.schema.get("TestSchema")).toBe(testSchema);
    });

    test("should validate data with registered schemas", () => {
      const erest = new ERest({});
      const testSchema = z.object({ name: z.string() });
      erest.schema.register("TestSchema", testSchema);

      expect(erest.schema.check("TestSchema", { name: "John" })).toBe(true);
      expect(erest.schema.check("TestSchema", { age: 25 })).toBe(false);
      expect(erest.schema.check("NonExistentSchema", {})).toBe(false);
    });

    test("should create schema from ISchemaType objects", () => {
      const erest = new ERest({});
      const schemaObj = {
        name: { type: "String", required: true },
        age: { type: "Integer", required: false }
      };

      const schema = erest.createSchema(schemaObj);
      expect(schema).toBeDefined();
      
      // Test valid data
      const validResult = schema.safeParse({ name: "John", age: 25 });
      expect(validResult.success).toBe(true);
    });
  });

  describe("API Registration", () => {
    test("should register APIs with different HTTP methods", () => {
      const erest = new ERest({});
      
      const getApi = erest.api.get("/test-get");
      const postApi = erest.api.post("/test-post");
      const putApi = erest.api.put("/test-put");
      const deleteApi = erest.api.delete("/test-delete");
      const patchApi = erest.api.patch("/test-patch");

      expect(erest.api.$apis.has("GET_/test-get")).toBe(true);
      expect(erest.api.$apis.has("POST_/test-post")).toBe(true);
      expect(erest.api.$apis.has("PUT_/test-put")).toBe(true);
      expect(erest.api.$apis.has("DELETE_/test-delete")).toBe(true);
      expect(erest.api.$apis.has("PATCH_/test-patch")).toBe(true);
    });

    test("should prevent duplicate API registration", () => {
      const erest = new ERest({});
      
      erest.api.get("/duplicate").register(() => {});
      
      expect(() => {
        erest.api.get("/duplicate").register(() => {});
      }).toThrow();
    });

    test("should register API using define method", () => {
      const erest = new ERest({});
      
      const api = erest.api.define({
        method: "post",
        path: "/defined-api",
        title: "Defined API",
        handler: () => {}
      });

      expect(erest.api.$apis.has("POST_/defined-api")).toBe(true);
      expect(api.options.title).toBe("Defined API");
    });
  });

  describe("Group Management", () => {
    test("should create and manage groups", () => {
      const erest = new ERest({
        forceGroup: true,
        groups: {
          v1: "Version 1",
          user: { name: "User Management", prefix: "/users" }
        }
      });

      const v1Group = erest.group("v1");
      const userGroup = erest.group("user");

      expect(v1Group).toBeDefined();
      expect(userGroup).toBeDefined();
      expect(typeof v1Group.get).toBe("function");
      expect(typeof userGroup.post).toBe("function");
    });

    test("should add middleware and before hooks to groups", () => {
      const erest = new ERest({
        forceGroup: true,
        groups: { test: "Test Group" }
      });

      const middleware1 = () => {};
      const middleware2 = () => {};
      const beforeHook = () => {};

      const group = erest.group("test")
        .middleware(middleware1, middleware2)
        .before(beforeHook);

      expect(erest.privateInfo.groupInfo.test.middleware).toContain(middleware1);
      expect(erest.privateInfo.groupInfo.test.middleware).toContain(middleware2);
      expect(erest.privateInfo.groupInfo.test.before).toContain(beforeHook);
    });

    test("should create group with dynamic info", () => {
      const erest = new ERest({ forceGroup: true });
      
      const group = erest.group("dynamic", { name: "Dynamic Group", prefix: "/dyn" });
      expect(erest.privateInfo.groups.dynamic).toBe("Dynamic Group");
      expect(erest.privateInfo.groupInfo.dynamic.prefix).toBe("/dyn");
    });
  });

  describe("Hook Management", () => {
    test("should add global before and after hooks", () => {
      const erest = new ERest({});
      const beforeHook = () => {};
      const afterHook = () => {};

      erest.beforeHooks(beforeHook);
      erest.afterHooks(afterHook);

      expect(erest.api.beforeHooks.has(beforeHook)).toBe(true);
      expect(erest.api.afterHooks.has(afterHook)).toBe(true);
    });

    test("should validate hook functions", () => {
      const erest = new ERest({});
      
      expect(() => {
        erest.beforeHooks("not a function" as any);
      }).toThrow("钩子名称必须是Function类型");

      expect(() => {
        erest.afterHooks("not a function" as any);
      }).toThrow("钩子名称必须是Function类型");
    });
  });

  describe("Documentation and Testing", () => {
    test("should initialize test system", () => {
      const erest = new ERest({});
      const mockApp = {};
      
      erest.initTest(mockApp, "/test/path", "/docs/path");
      expect(erest.test).toBeDefined();
      expect(erest.api.docs).toBeDefined();
    });

    test("should set format output function", () => {
      const erest = new ERest({});
      const formatFn = (out: unknown) => [null, out] as [Error | null, unknown];
      
      erest.setFormatOutput(formatFn);
      expect(erest.api.formatOutputReverse).toBe(formatFn);
    });

    test("should set doc output format function", () => {
      const erest = new ERest({});
      const docFormatFn = (out: unknown) => out;
      
      erest.setDocOutputForamt(docFormatFn);
      expect(erest.api.docOutputForamt).toBe(docFormatFn);
    });

    test("should set mock handler", () => {
      const erest = new ERest({});
      const mockHandler = (data: unknown) => () => data;
      
      erest.setMockHandler(mockHandler);
      expect(erest.privateInfo.mockHandler).toBe(mockHandler);
    });

    test("should build swagger documentation", () => {
      const erest = new ERest({
        info: {
          host: "http://localhost:3000",
          basePath: "/api"
        }
      });
      const swaggerInfo = erest.buildSwagger();
      expect(swaggerInfo).toBeDefined();
    });

    test("should generate docs with different options", () => {
      const erest = new ERest({});
      
      // Test genDocs with default parameters
      expect(() => erest.genDocs()).not.toThrow();
      
      // Test genDocs with custom parameters
      expect(() => erest.genDocs("/custom/docs", false)).not.toThrow();
    });
  });

  describe("Router Binding", () => {
    test("should throw error when using bindRouter with forceGroup", () => {
      const erest = new ERest({ forceGroup: true });
      const mockRouter = {};
      const mockChecker = () => () => {};

      expect(() => {
        erest.bindRouter(mockRouter, mockChecker);
      }).toThrow("使用了 forceGroup，请使用bindGroupToApp");
    });

    test("should throw error when using bindRouterToApp without forceGroup", () => {
      const erest = new ERest({ forceGroup: false });
      const mockApp = {};
      const mockRouter = {};
      const mockChecker = () => () => {};

      expect(() => {
        erest.bindRouterToApp(mockApp, mockRouter, mockChecker);
      }).toThrow("没有开启 forceGroup，请使用bindRouter");
    });

    test("should throw error when using bindKoaRouterToApp without forceGroup", () => {
      const erest = new ERest({ forceGroup: false });
      const mockApp = {};
      const mockKoaRouter = {};
      const mockChecker = () => () => {};

      expect(() => {
        erest.bindKoaRouterToApp(mockApp, mockKoaRouter, mockChecker);
      }).toThrow("没有开启 forceGroup，请使用 bindRouterToKoa");
    });
  });

  describe("Checker Methods", () => {
    test("should create parameter checker", () => {
      const erest = new ERest({});
      const checker = erest.paramsChecker();
      expect(typeof checker).toBe("function");
    });

    test("should create schema checker", () => {
      const erest = new ERest({});
      const checker = erest.schemaChecker();
      expect(typeof checker).toBe("function");
    });

    test("should create response checker", () => {
      const erest = new ERest({});
      const checker = erest.responseChecker();
      expect(typeof checker).toBe("function");
    });

    test("should create API params checker", () => {
      const erest = new ERest({});
      const checker = erest.apiParamsCheck();
      expect(typeof checker).toBe("function");
    });
  });

  describe("Error Handling", () => {
    test("should handle group registration with forceGroup", () => {
      const erest = new ERest({
        forceGroup: true,
        groups: { test: "Test Group" }
      });

      expect(() => {
        erest.group("test").get("/test-path").register(() => {});
      }).not.toThrow();
    });

    test("should throw error when registering API without group in forceGroup mode", () => {
      const erest = new ERest({ forceGroup: true });

      expect(() => {
        erest.api.get("/test").register(() => {});
      }).toThrow();
    });

    test("should handle group registration validation", () => {
      const erest = new ERest({
        forceGroup: true,
        groups: { defined: "Defined Group" }
      });

      // Test that defined groups work
      expect(() => {
        erest.group("defined").get("/test").register(() => {});
      }).not.toThrow();
      
      // Test that the group was created
      expect(erest.privateInfo.groups.defined).toBe("Defined Group");
    });
  });

  describe("Utility Access", () => {
    test("should provide access to utils", () => {
      const erest = new ERest({});
      expect(erest.utils).toBeDefined();
      expect(typeof erest.utils.getCallerSourceLine).toBe("function");
    });

    test("should provide access to errors manager", () => {
      const erest = new ERest({});
      expect(erest.errors).toBeDefined();
      expect(typeof erest.errors.register).toBe("function");
    });
  });
});

  test("ERest - 分组信息", () => {
    expect(apiService.privateInfo.groups).toEqual(GROUPS);
  });

  test("ERest - 注册文件输出函数", () => {
    const org = (apiService as { apiInfo: { docOutputForamt: unknown } }).apiInfo.docOutputForamt;
    const fn = (out: unknown) => out;
    apiService.setDocOutputForamt(fn);
    const now = (apiService as { apiInfo: { docOutputForamt: unknown } }).apiInfo.docOutputForamt;
    expect(org).not.toEqual(now);
    expect(now).toEqual(fn);
  });

  test("ERest - 注册错误信息", () => {
    apiService.errors.register("TEST", {});
  });
});

describe("ERest - schema 注册与使用", () => {
  const apiService = lib();

  test("add Type", () => {
    apiService.type.register("Any2", z.unknown());
    expect(apiService.type.has("Any2")).toBeTruthy();
  });

  test("add Schema", () => {
    // 注册一个名字为`a`的 schema
    const aSchema = apiService.createSchema({
      a: build(TYPES.String, "str"),
    });
    apiService.schema.register("a", aSchema);

    apiService.api
      .get("/")
      .group("Index")
      .query({
        a: build("a", "Object-a", true),
        // 使用 a 类型对象的数组
        b: build("a[]", "Object-a Array", true),
      })
      .register(() => {});

    const router = express();
    apiService.bindRouter(router, apiService.checkerExpress);
    expect(apiService.schema.has("a")).toBeTruthy();
  });
});

describe("ERest - 更多测试（完善覆盖率）", () => {
  const apiService = lib();

  describe("Utils", () => {
    test("getCallerSourceLine", () => {
      const { relative, absolute } = getCallerSourceLine("z:/getCallerSourceLine");
      expect(relative).toBeUndefined();
      expect(absolute).toBeUndefined();
    });

    test("getPath", () => {
      const p = getPath("Yourtion", "/a");
      expect(p).toBe("/a");
    });
  });

  describe("ERest", () => {
    test("genDocs", () => {
      apiService.genDocs(undefined, true);
    });

    test("error mamager modify", () => {
      apiService.errors.modify("PERMISSIONS_ERROR", { code: -999, isShow: false });
      const e = apiService.errors.get("PERMISSIONS_ERROR");
      expect(e?.isShow).toEqual(false);
      expect(e?.isDefault).toEqual(false);
    });
  });

  // TODO: 完善 Mock 方法
  apiService.setMockHandler(() => () => {});
  apiService.api.get("/b").mock();

  describe("Checker", () => {
    const api = apiService.api.define({
      method: "get",
      path: "/a",
      group: "Index",
      title: "ENUM Without params Test",
      query: { p: build(TYPES.ENUM, "ENUM Without params", true) },
      handler: () => {},
    });

    test("apiParamsCheck", () => {
      expect(() => api.init(apiService)).toThrow("ENUM is require a params");
    });

    test("responseChecker", () => {
      const checker = apiService.responseChecker();
      const ret = checker({}, { type: "object" });
      expect(ret).toEqual({ ok: true, message: "success", value: {} });
    });

    test("require params", () => {
      expect(() => api.init(apiService)).toThrow("ENUM is require a params");
    });
  });
});
