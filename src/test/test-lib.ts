import { expressAdapter } from "./adapters";

import express from "express";
import { vi } from "vitest";
import { z } from "zod";
import type { FrameworkAdapter, IApiOption } from "../lib";
import ERest, { ERestError } from "../lib";
import { buildHandlerChain } from "../lib/adapters/utils";
import { Manager } from "../lib/manager/manager";
import {
  camelCase2underscore,
  getCallerSourceLine,
  getPath,
  getRealPath,
  getSchemaKey,
  jsonStringify,
} from "../lib/utils";
import lib, { GROUPS, INFO } from "./lib";

describe("ERest - 基础测试", () => {
  const apiService = lib();

  test("ERest - 信息初始化", () => {
    const libInfo = apiService.getTestView().info;
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
        expect(erest.getTestView().info).toEqual({});
        expect(erest.api.$apis.size).toBe(0);
      });

      test("should create ERest instance with custom options", () => {
        const customOptions: IApiOption = {
          info: {
            title: "Test API",
            description: "Test Description",
            version: new Date("2023-01-01"),
            host: "localhost",
            basePath: "/api",
          },
          path: "/custom/path",
          forceGroup: true,
          groups: {
            v1: "Version 1",
            user: { name: "User Management", prefix: "/users" },
          },
          docs: {
            markdown: true,
            swagger: true,
            json: false,
          },
        };

        const erest = new ERest(customOptions);
        expect(erest.getTestView().info.title).toBe("Test API");
        expect(erest.getTestView().info.description).toBe("Test Description");
        expect(erest.getDocsView().groups.v1).toBe("Version 1");
        expect(erest.getDocsView().groups.user).toBe("User Management");
        expect(erest.getDocsView().groupInfo.user.prefix).toBe("/users");
      });

      test("should handle custom error functions", () => {
        const customMissingError = (msg: string) => new Error(`Custom missing: ${msg}`);
        const customInvalidError = (msg: string) => new Error(`Custom invalid: ${msg}`);
        const customInternalError = (msg: string) => new Error(`Custom internal: ${msg}`);

        const erest = new ERest({
          missingParameterError: customMissingError,
          invalidParameterError: customInvalidError,
          internalError: customInternalError,
        });

        expect(erest.getError().missingParameter("test").message).toBe("Custom missing: test");
        expect(erest.getError().invalidParameter("test").message).toBe("Custom invalid: test");
        expect(erest.getError().internalError("test").message).toBe("Custom internal: test");
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
    });

    describe("API Registration", () => {
      test("should register APIs with different HTTP methods", () => {
        const erest = new ERest({});

        erest.api.get("/test-get");
        erest.api.post("/test-post");
        erest.api.put("/test-put");
        erest.api.delete("/test-delete");
        erest.api.patch("/test-patch");

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
          handler: () => {},
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
            user: { name: "User Management", prefix: "/users" },
          },
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
          groups: { test: "Test Group" },
        });

        const middleware1 = () => {};
        const middleware2 = () => {};
        const beforeHook = () => {};

        erest.group("test").middleware(middleware1, middleware2).before(beforeHook);

        expect(erest.getDocsView().groupInfo.test.middleware).toContain(middleware1);
        expect(erest.getDocsView().groupInfo.test.middleware).toContain(middleware2);
        expect(erest.getDocsView().groupInfo.test.before).toContain(beforeHook);
      });

      test("should create group with dynamic info", () => {
        const erest = new ERest({ forceGroup: true });

        erest.group("dynamic", { name: "Dynamic Group", prefix: "/dyn" });
        expect(erest.getDocsView().groups.dynamic).toBe("Dynamic Group");
        expect(erest.getDocsView().groupInfo.dynamic.prefix).toBe("/dyn");
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

        erest.setDocOutputFormat(docFormatFn);
        expect(erest.api.docOutputFormat).toBe(docFormatFn);
      });

      test("should set mock handler", () => {
        const erest = new ERest({});
        const mockHandler = (data: unknown) => () => data;

        erest.setMockHandler(mockHandler);
        expect(erest.getMockHandler()).toBe(mockHandler);
      });

      test("should build swagger documentation", () => {
        const erest = new ERest({
          info: {
            host: "http://localhost:3000",
            basePath: "/api",
          },
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

        expect(() => {
          erest.bind({ adapter: expressAdapter, router: mockRouter });
        }).toThrow("forceGroup 模式需要提供 app 和 router");
      });

      test("should throw error when using bind with forceGroup but missing app/router", () => {
        const erest = new ERest({ forceGroup: false });
        const mockRouter = {};

        // 非 forceGroup 模式提供 app 应抛错（需 router）
        expect(() => {
          erest.bind({ adapter: expressAdapter, router: mockRouter });
        }).not.toThrow();
      });
    });

    describe("Error Handling", () => {
      test("should handle group registration with forceGroup", () => {
        const erest = new ERest({
          forceGroup: true,
          groups: { test: "Test Group" },
        });

        expect(() => {
          erest
            .group("test")
            .get("/test-path")
            .register(() => {});
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
          groups: { defined: "Defined Group" },
        });

        // Test that defined groups work
        expect(() => {
          erest
            .group("defined")
            .get("/test")
            .register(() => {});
        }).not.toThrow();

        // Test that the group was created
        expect(erest.getDocsView().groups.defined).toBe("Defined Group");
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
    expect(apiService.getDocsView().groups).toEqual(GROUPS);
  });

  test("ERest - 注册文件输出函数", () => {
    const org = (apiService as { apiInfo: { docOutputFormat: unknown } }).apiInfo.docOutputFormat;
    const fn = (out: unknown) => out;
    apiService.setDocOutputFormat(fn);
    const now = (apiService as { apiInfo: { docOutputFormat: unknown } }).apiInfo.docOutputFormat;
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
    // Stage 1：直接注册 Zod schema（createSchema 已移除）
    const aSchema = z.object({ a: z.string() });
    apiService.schema.register("a", aSchema);

    apiService.api
      .get("/")
      .group("Index")
      .query(z.object({ a: z.string() }))
      .register(() => {});

    const router = express();
    apiService.bind({ adapter: expressAdapter, router });
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

    test("getCallerSourceLine：ESM/vitest 无括号栈帧（file:// URL）也能定位到源文件", () => {
      // ESM 栈帧形如 `at /abs/path/file.ts:1:1`（无圆括号），修复前恒返回 undefined。
      // 传调用者所在目录（与 index.ts 内 getCallerSourceLine(__dirname) 用法一致），
      // 跳过 utils.ts 自身帧后命中本测试文件。
      const { relative, absolute } = getCallerSourceLine(`${process.cwd()}/src/test`);
      expect(absolute).toMatch(/src[/\\]test[/\\]test-lib\.ts$/);
      expect(relative).toBe("test-lib.ts");
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
});

describe("ERestError - 自定义错误类", () => {
  // ERestError 已从 src 顶部 import（见文件顶部）

  test("should create ERestError with basic properties", () => {
    const error = new ERestError("MISSING_PARAM", "missing required parameter 'name'", { field: "name" });
    expect(error.code).toBe("MISSING_PARAM");
    expect(error.message).toBe("missing required parameter 'name'");
    expect(error.details?.field).toBe("name");
    expect(error.statusCode).toBe(400);
    expect(error.name).toBe("ERestError");
  });

  test("should create error with custom status code", () => {
    const error = new ERestError("INTERNAL_ERROR", "internal error", undefined, 500);
    expect(error.statusCode).toBe(500);
  });

  test("should create missingParam error using static method", () => {
    const error = ERestError.missingParam("username");
    expect(error.code).toBe("MISSING_PARAM");
    expect(error.message).toContain("username");
    expect(error.details?.field).toBe("username");
  });

  test("should create invalidParam error using static method", () => {
    const error = ERestError.invalidParam("age", "Integer", "abc");
    expect(error.code).toBe("INVALID_PARAM");
    expect(error.message).toContain("age");
    expect(error.details?.expected).toBe("Integer");
    expect(error.details?.received).toBe("abc");
  });

  test("should create internal error using static method", () => {
    const error = ERestError.internal("database connection failed");
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.statusCode).toBe(500);
  });

  test("should create validation error using static method", () => {
    const error = ERestError.validation("validation failed", { field: "email" });
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.details?.field).toBe("email");
  });

  test("should convert to JSON correctly", () => {
    const error = new ERestError("INVALID_PARAM", "test error", { field: "test" }, 422);
    const json = error.toJSON();
    expect(json.name).toBe("ERestError");
    expect(json.code).toBe("INVALID_PARAM");
    expect(json.message).toBe("test error");
    expect(json.statusCode).toBe(422);
  });

  test("should be instanceof Error", () => {
    const error = new ERestError("MISSING_PARAM", "test");
    expect(error instanceof Error).toBe(true);
    expect(error instanceof ERestError).toBe(true);
  });
});

describe("ERest - 默认错误工厂", () => {
  test("missingParameter 默认工厂应生成 MISSING_PARAM 错误", () => {
    const s = new ERest({});
    const err = s.getError().missingParameter("'name'") as ERestError;
    expect(err).toBeInstanceOf(ERestError);
    expect(err.code).toBe("MISSING_PARAM");
    expect(err.message).toBe("missing required parameter 'name'");
    expect(err.details).toEqual({ field: "name" });
  });

  test("invalidParameter 默认工厂应提取首个字段名", () => {
    const s = new ERest({});
    const err = s.getError().invalidParameter("'age' should be valid") as ERestError;
    expect(err.code).toBe("INVALID_PARAM");
    expect(err.message).toBe("incorrect parameter 'age' should be valid");
    expect(err.details).toEqual({ field: "age" });
  });

  test("internalError 默认工厂应生成 500 错误", () => {
    const s = new ERest({});
    const err = s.getError().internalError("boom") as ERestError;
    expect(err.code).toBe("INTERNAL_ERROR");
    expect(err.message).toBe("internal error boom");
    expect(err.statusCode).toBe(500);
  });
});

describe("ERest - 门面行为与文档惰性初始化", () => {
  test("未配置 hooks 时 hasHooks 应返回 false", () => {
    const s = new ERest({});
    expect(s.hasHooks()).toBe(false);
  });

  test("groups 配置对象缺 name 时应归一化为空字符串", () => {
    const s = new ERest({ groups: { Weird: {} } });
    expect(s.getInternalGroups().Weird).toBe("");
  });

  test("groups 值为 undefined 时应归一化为空字符串与空初始结构", () => {
    const s = new ERest({ groups: { U: undefined } });
    expect(s.getInternalGroups().U).toBe("");
    expect(s.getDocsView().groupInfo.U).toEqual({ middleware: [], before: [] });
  });

  test("type.value 对未注册类型应返回失败信息", () => {
    const s = new ERest({});
    const r = s.type.value("NoSuchType", 42);
    expect(r.ok).toBe(false);
    expect(r.message).toBe("Unknown type: NoSuchType");
    expect(r.value).toBe(42);
  });

  test("docs 选项应按默认值归一化", () => {
    const s = new ERest({ docs: { markdown: "custom.md", index: true } });
    expect(s.getDocsView().docsOptions).toEqual({
      markdown: "custom.md",
      wiki: "./",
      index: true,
      home: true,
      swagger: false,
      openapi: false,
      postman: false,
      json: false,
      axios: false,
      all: false,
    });
  });

  test("重复注册相同 key 的 API 应报错并指明已注册", () => {
    const s = new ERest({});
    s.api.get("/dup").register(() => {});
    expect(() => s.api.get("/dup").register(() => {})).toThrow(/失败，因为该API已在文件/);
    s.api.define({ method: "get", path: "/dup2", title: "d", handler: () => {} });
    expect(() => s.api.define({ method: "get", path: "/dup2", title: "d", handler: () => {} })).toThrow(
      /失败，因为该API已在文件/
    );
  });

  test("initTest 二次调用应保持首次的 app 与 docs 实例", () => {
    const s = new ERest({});
    const app1 = express();
    s.initTest(app1, "/tmp", "/tmp");
    const docs1 = s.api.docs;
    const app2 = express();
    s.initTest(app2, "/tmp", "/tmp");
    expect(s.getTestView().app).toBe(app1);
    expect(s.api.docs).toBe(docs1);
  });

  test("setResponseEnvelopers 应注册 testUnwrapper 到 formatOutputReverse", () => {
    const s = new ERest({});
    const success = vi.fn();
    const errorFn = vi.fn();
    const unwrap = vi.fn();
    s.setResponseEnvelopers({ success, error: errorFn, testUnwrapper: unwrap });
    expect(s.api.formatOutputReverse).toBe(unwrap);
    expect(s.api.successEnveloper).toBe(success);
    expect(s.api.errorEnveloper).toBe(errorFn);
    // 不带 testUnwrapper 时不应覆盖 formatOutputReverse
    const s2 = new ERest({});
    s2.setResponseEnvelopers({ success: vi.fn(), error: vi.fn() });
    expect(s2.api.formatOutputReverse).toBeUndefined();
  });

  test("docs 未初始化时 setDocWritter 与 addDocPlugin 应安全跳过", () => {
    const s = new ERest({});
    expect(() => s.setDocWritter(vi.fn())).not.toThrow();
    expect(() => s.addDocPlugin("p", vi.fn())).not.toThrow();
  });

  test("buildSwagger 应复用已初始化的 docs 实例", () => {
    const s = new ERest({});
    const stub = { getSwaggerInfo: vi.fn(() => ({ stub: true })) };
    s.api.docs = stub as never;
    expect(s.buildSwagger()).toEqual({ stub: true });
    expect(s.api.docs).toBe(stub);
  });

  test("genDocs 默认保存路径应为 cwd/docs/ 且走 saveOnExit", () => {
    const s = new ERest({});
    const saveOnExit = vi.fn();
    const save = vi.fn();
    s.api.docs = { genDocs: vi.fn(), saveOnExit, save } as never;
    s.genDocs();
    expect(saveOnExit).toHaveBeenCalledTimes(1);
    expect(saveOnExit).toHaveBeenCalledWith(`${process.cwd()}/docs/`);
    expect(save).not.toHaveBeenCalled();
  });

  test("genDocs onExit=false 时应立即 save 到指定目录", () => {
    const s = new ERest({});
    const saveOnExit = vi.fn();
    const save = vi.fn();
    s.api.docs = { genDocs: vi.fn(), saveOnExit, save } as never;
    s.genDocs("/custom/docs", false);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("/custom/docs");
    expect(saveOnExit).not.toHaveBeenCalled();
  });
});

describe("ERest - group 注册与 bind 装配", () => {
  test("group 传描述字符串应写入 groups 与 groupInfo 初始结构", () => {
    const s = new ERest({ forceGroup: true });
    s.group("DescG", "描述分组");
    expect(s.getInternalGroups().DescG).toBe("描述分组");
    expect(s.getDocsView().groupInfo.DescG).toEqual({
      name: "描述分组",
      prefix: "",
      middleware: [],
      before: [],
    });
  });

  test("group 无 prefix 时注册 key 应派生自驼峰转下划线的组名", () => {
    const s = new ERest({ forceGroup: true });
    s.group("DescG", "描述分组")
      .get("/k1")
      .register(() => {});
    expect(s.api.$apis.has("GET_/desc_g/k1")).toBe(true);
  });

  test("forceGroup 模式 bind 时 API 缺 handler 应抛错", () => {
    const s = new ERest({ forceGroup: true, groups: { g1: "G1" } });
    s.group("g1").get("/no-handler");
    expect(() => s.bind({ adapter: expressAdapter, app: express(), router: express.Router() })).toThrow(
      /没有注册处理函数/
    );
  });

  test("forceGroup 模式 bind 应按 group prefix 派生子路由并挂载", () => {
    const route = { marker: "route" };
    const createGroupRouter = vi.fn(() => route);
    const attachGroupRouter = vi.fn();
    const bindRoute = vi.fn();
    const adapter = {
      name: "mock",
      createGroupRouter,
      attachGroupRouter,
      bindRoute,
      makeParamsChecker: () => vi.fn(),
    } as unknown as FrameworkAdapter<unknown>;
    const s = new ERest({
      forceGroup: true,
      groups: { g1: "G1", u: { name: "U", prefix: "/users" } },
    });
    s.group("g1")
      .get("/a")
      .register(() => {});
    s.group("u")
      .post("/b")
      .register(() => {});
    const app = {};
    const router = {};
    s.bind({ adapter, app, router });
    // 无 prefix 的 g1 派生为 camelCase2underscore("g1")；u 用显式 prefix "/users"
    expect(createGroupRouter.mock.calls.map((c) => c[1])).toEqual(["g1", "/users"]);
    expect(attachGroupRouter).toHaveBeenCalledTimes(2);
    expect(attachGroupRouter.mock.calls.map((c) => c[0])).toEqual([app, app]);
    expect(attachGroupRouter.mock.calls.map((c) => c[1])).toEqual([route, route]);
    expect(attachGroupRouter.mock.calls.map((c) => c[2])).toEqual(["g1", "/users"]);
    expect(bindRoute).toHaveBeenCalledTimes(2);
  });

  test("非 forceGroup 模式 bind 缺 router 应抛错", () => {
    const s = new ERest({});
    expect(() => s.bind({ adapter: expressAdapter })).toThrow("非 forceGroup 模式需要提供 router");
  });

  test("非 forceGroup 模式 bind 时 API 缺 handler 应抛错", () => {
    const s = lib();
    s.api.get("/no-handler-2").group("Index");
    expect(() => s.bind({ adapter: expressAdapter, router: express.Router() })).toThrow(/没有注册处理函数/);
  });
});

// ---- utils / adapters / manager 补测 ----

describe("utils: getSchemaKey", () => {
  test("无 prefix：method 大写 + path", () => {
    expect(getSchemaKey("get", "/path")).toBe("GET_/path");
    expect(getSchemaKey("delete", "/x")).toBe("DELETE_/x");
  });

  test("prefix 不以 / 开头：转下划线并补 /", () => {
    expect(getSchemaKey("post", "/path", "v1")).toBe("POST_/v1/path");
    expect(getSchemaKey("get", "/p", "apiV2")).toBe("GET_/api_v2/p");
  });

  test("prefix 以 / 开头：原样使用", () => {
    expect(getSchemaKey("get", "/path", "/v2")).toBe("GET_/v2/path");
  });

  test("双斜杠合并、尾斜杠去除、根路径回退 /", () => {
    expect(getSchemaKey("get", "/a//b")).toBe("GET_/a/b");
    expect(getSchemaKey("get", "/a/")).toBe("GET_/a");
    expect(getSchemaKey("get", "/")).toBe("GET_/");
  });
});

describe("utils: camelCase2underscore", () => {
  test("常规转换", () => {
    expect(camelCase2underscore("camelCase")).toBe("camel_case");
    expect(camelCase2underscore("aB")).toBe("a_b");
    expect(camelCase2underscore("v1")).toBe("v1");
    expect(camelCase2underscore("X")).toBe("x");
    expect(camelCase2underscore("")).toBe("");
  });

  test("连续大写逐个加下划线", () => {
    expect(camelCase2underscore("APIV2")).toBe("a_p_i_v2");
  });

  test("首字符仅匹配非空白（前导空格保留原样）", () => {
    expect(camelCase2underscore(" AbC")).toBe(" _ab_c");
  });
});

describe("utils: jsonStringify", () => {
  test("紧凑输出", () => {
    expect(jsonStringify({ a: 1 }, 0)).toBe('{"a":1}');
  });

  test("缩进输出与 JSON.stringify 一致", () => {
    expect(jsonStringify({ a: { b: [1] } }, 2)).toBe('{\n  "a": {\n    "b": [\n      1\n    ]\n  }\n}');
  });

  test("数组与 null 值", () => {
    expect(jsonStringify([1, "x", null], 0)).toBe('[1,"x",null]');
  });
});

describe("utils: getPath / getRealPath", () => {
  test("getPath：string 覆盖默认值，boolean 用默认值", () => {
    expect(getPath("def")).toBe("def");
    expect(getPath("def", "opt")).toBe("opt");
    expect(getPath("def", true)).toBe("def");
    expect(getPath("def", false)).toBe("def");
    expect(getPath("def", undefined)).toBe("def");
  });

  test("getRealPath：截取第一个 _ 后的路径", () => {
    expect(getRealPath("GET_/a/b")).toBe("/a/b");
    expect(getRealPath("GET_/")).toBe("/");
  });
});

// ============ error.ts ============

// ============ adapters/utils.ts ============

/** handler 链各位置的共享 no-op 桩（引用相等断言用） */
const chainStub = {
  globalBefore: () => {},
  groupBefore: () => {},
  apiBefore: () => {},
  checker: () => {},
  groupMiddleware: () => {},
  apiMiddleware: () => {},
  middleware: () => {},
  handler: () => {},
};

describe("adapters/utils: buildHandlerChain", () => {
  test("完整顺序：全局 before → 组 before → API before → checker → 组 middleware → API middleware → handler", () => {
    const { globalBefore, groupBefore, apiBefore, checker, groupMiddleware, apiMiddleware, handler } = chainStub;
    const chain = buildHandlerChain({
      beforeHooks: new Set([globalBefore]),
      api: { options: { beforeHooks: new Set([apiBefore]), middlewares: [apiMiddleware], handler } } as never,
      checker,
      groupInfo: { before: [groupBefore], middleware: [groupMiddleware] } as never,
    });
    expect(chain).toEqual([globalBefore, groupBefore, apiBefore, checker, groupMiddleware, apiMiddleware, handler]);
  });

  test("无 groupInfo：仅全局 before + checker + API 中间件 + handler", () => {
    const { globalBefore, apiBefore, checker, middleware, handler } = chainStub;
    const chain = buildHandlerChain({
      beforeHooks: new Set([globalBefore]),
      api: { options: { beforeHooks: new Set([apiBefore]), middlewares: [middleware], handler } } as never,
      checker,
    });
    expect(chain).toEqual([globalBefore, apiBefore, checker, middleware, handler]);
  });

  test("非函数项（undefined/字符串）被过滤", () => {
    const { checker, middleware, handler } = chainStub;
    const chain = buildHandlerChain({
      beforeHooks: new Set(),
      api: {
        options: {
          beforeHooks: new Set([undefined as never, "str" as never]),
          middlewares: [null as never, middleware],
          handler,
        },
      } as never,
      checker,
      groupInfo: { before: [123 as never], middleware: [] } as never,
    });
    expect(chain).toEqual([checker, middleware, handler]);
    expect(chain.every((h) => typeof h === "function")).toBe(true);
  });
});

// ============ manager/manager.ts ============

describe("manager: Manager get/forEach", () => {
  class TestManager extends Manager<string> {
    public set(key: string, value: string) {
      (this as unknown as { map: Map<string, string> }).map.set(key, value);
    }
  }

  test("get 按名读取，不存在返回 undefined", () => {
    const m = new TestManager();
    m.set("a", "1");
    expect(m.get("a")).toBe("1");
    expect(m.get("missing")).toBeUndefined();
  });

  test("forEach 按 Map 插入顺序遍历", () => {
    const m = new TestManager();
    m.set("a", "1");
    m.set("b", "2");
    const seen: Array<[string, string]> = [];
    m.forEach((value, key) => seen.push([key, value]));
    expect(seen).toEqual([
      ["a", "1"],
      ["b", "2"],
    ]);
  });
});
