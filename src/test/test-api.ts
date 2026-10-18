import { vol } from "memfs";
import { vi } from "vitest";
import { z } from "zod";
import { API, type SUPPORT_METHODS } from "../lib/api.js";
import { apiDelete } from "./helper";
import lib from "./lib";

describe("API 接口测试", () => {
  let apiService: ReturnType<typeof lib>;
  let api: ReturnType<typeof lib>["api"];
  let deleteApi: ReturnType<typeof apiDelete>;

  beforeEach(() => {
    // 重置虚拟文件系统
    vol.reset();
    vol.mkdirSync("/tmp", { recursive: true });

    // 初始化服务
    apiService = lib();
    api = apiService.api;
    deleteApi = apiDelete(api);

    // 使用 mock 的文档生成，不进行真实文件操作
    const genDocsSpy = vi.spyOn(apiService, "genDocs").mockImplementation(() => {
      // 模拟文档生成过程，但不写入真实文件
    });

    apiService.genDocs("/tmp");

    // 验证 genDocs 被调用
    expect(genDocsSpy).toHaveBeenCalledWith("/tmp");
  });

  test("API 接口初始化验证", () => {
    const apiInfo = api.$apis.get("DELETE_/index/:name");
    expect(apiInfo?.key).toBe("DELETE_/index/:name");
    expect(apiInfo?.options.method).toBe("delete");
    expect(apiInfo?.options.path).toBe("/index/:name");
    expect(apiInfo?.options.title).toBe("Delete");
    expect(apiInfo?.options.group).toBe("Index");
    expect(apiInfo?.options.paramsSchema).toBeDefined();
    expect(apiInfo?.options.handler?.name).toBe("del");
  });

  test("API 接口信息更新测试", () => {
    deleteApi.title("newTitle");
    deleteApi.description("Yourtion");
    const example = {
      input: { a: "b" },
      output: { name: "d" },
    };
    const outSchema = z.object({ name: z.string() });
    deleteApi.example(example);
    deleteApi.response(outSchema);
    deleteApi.query(z.object({ numP2: z.number().min(0).max(10) }));

    const apiInfo = api.$apis.get("DELETE_/index/:name");
    expect(apiInfo?.options.title).toBe("newTitle");
    expect(apiInfo?.options.description).toBe("Yourtion");
    expect(apiInfo?.options.examples.length).toBe(1);
    expect(apiInfo?.options.examples[0]).toEqual(example);
  });
});

describe("API 高级功能和错误处理测试", () => {
  let apiService: ReturnType<typeof lib>;
  let api: ReturnType<typeof lib>["api"];

  beforeEach(() => {
    apiService = lib();
    api = apiService.api;
    // 配置测试分组
    apiService.group("Test", "测试分组");
  });

  describe("registerTyped 方法测试", () => {
    test("应该正确设置 schemas 和 handler", async () => {
      const { z } = await import("zod");

      const testApi = api.get("/test-typed").group("Test");

      const schemas = {
        query: z.object({ name: z.string() }),
        body: z.object({ data: z.string() }),
        params: z.object({ id: z.string() }),
        headers: z.object({ auth: z.string() }),
        response: z.object({ result: z.string() }),
      };

      const handler = async (req: any) => {
        return { result: `Hello ${req.query.name}` };
      };

      testApi.registerTyped(schemas, handler);

      // 验证 schemas 被正确设置
      expect(testApi.options.querySchema).toBe(schemas.query);
      expect(testApi.options.bodySchema).toBe(schemas.body);
      expect(testApi.options.paramsSchema).toBe(schemas.params);
      expect(testApi.options.headersSchema).toBe(schemas.headers);
      expect(testApi.options.responseSchema).toBe(schemas.response);
      expect(testApi.options.handler).toBeDefined();
    });

    test("应该正确处理部分 schemas", async () => {
      const { z } = await import("zod");

      const testApi = api.get("/test-partial").group("Test");

      const schemas = {
        query: z.object({ name: z.string() }),
        // 只设置 query schema
      };

      const handler = async (req: any) => {
        return { result: `Hello ${req.query.name}` };
      };

      testApi.registerTyped(schemas, handler);

      // 验证只有 query schema 被设置
      expect(testApi.options.querySchema).toBe(schemas.query);
      expect(testApi.options.bodySchema).toBeUndefined();
      expect(testApi.options.paramsSchema).toBeUndefined();
      expect(testApi.options.headersSchema).toBeUndefined();
      expect(testApi.options.responseSchema).toBeUndefined();
    });
  });

  describe("API 初始化错误处理测试", () => {
    test("应该正确处理 response 的不同类型", async () => {
      const { z } = await import("zod");

      // 测试字符串类型的 response（已注册 schema 名）
      apiService.schema.register("TestSchema", z.object({ name: z.string() }));

      const testApi1 = api.get("/test-response-string").group("Test");
      testApi1.response("TestSchema");
      testApi1.init(apiService as any);
      expect(testApi1.options.responseSchema).toBeDefined();

      // 测试 ZodType 的 response
      const testApi2 = api.get("/test-response-zod").group("Test");
      const zodSchema = z.object({ age: z.number() });
      testApi2.response(zodSchema);
      testApi2.init(apiService as any);
      expect(testApi2.options.responseSchema).toBe(zodSchema);
    });

    test("应该正确设置 mock handler", () => {
      // 设置 mock handler
      apiService.setMockHandler((data: any) => () => data);

      const testApi = api.get("/test-mock").group("Test");
      testApi.mock({ test: "data" });

      // 验证 mock 数据被正确设置
      expect(testApi.options.mock).toEqual({ test: "data" });

      // 确保没有现有的 handler
      expect(testApi.options.handler).toBeUndefined();

      // 初始化后应该有 handler（由 mock handler 生成）
      testApi.init(apiService as any);
      expect(testApi.options.handler).toBeDefined();
    });

    test("mock handler 不应该覆盖现有的 handler", () => {
      // 设置 mock handler
      apiService.setMockHandler((data: any) => () => data);

      const testApi = api.get("/test-mock-existing").group("Test");

      // 先设置一个 handler
      const existingHandler = () => "existing";
      testApi.register(existingHandler);

      // 然后设置 mock
      testApi.mock({ test: "data" });

      // 初始化后应该保持原有的 handler
      testApi.init(apiService as any);
      expect(testApi.options.handler).toBe(existingHandler);
    });

    test("mock() 应返回 this 以支持链式调用", () => {
      // mock() 此前漏了 return this，导致 .mock(...).register(...) 链式调用返回 undefined 而断链
      const testApi = api.get("/test-mock-chain").group("Test");
      const returned = testApi.mock({ test: "data" });
      expect(returned).toBe(testApi);
      // 链式调用应能继续
      testApi.mock({ a: 1 }).title("链式 mock");
      expect(testApi.options.title).toBe("链式 mock");
    });
  });

  describe("API 方法参数验证测试", () => {
    test("middlewares 方法应该验证参数类型", () => {
      const testApi = api.get("/test-middleware").group("Test");

      expect(() => {
        testApi.middlewares("not a function" as any);
      }).toThrow("中间件必须是Function类型");
    });

    test("before 方法应该验证参数类型", () => {
      const testApi = api.get("/test-before").group("Test");

      expect(() => {
        testApi.before("not a function" as any);
      }).toThrow("钩子名称必须是Function类型");
    });

    test("register 方法应该验证参数类型", () => {
      const testApi = api.get("/test-register").group("Test");

      expect(() => {
        testApi.register("not a function" as any);
      }).toThrow("处理函数必须是一个函数类型");
    });
  });

  describe("边界情况测试", () => {
    test("requiredOneOf 应该处理空数组", () => {
      const testApi = api.get("/test-required-empty").group("Test");

      // 空数组不应该添加任何约束
      testApi.requiredOneOf([]);
      expect(testApi.options.requiredOneOf.length).toBe(0);
    });

    test("mock 方法应该处理 undefined 参数", () => {
      const testApi = api.get("/test-mock-undefined").group("Test");

      testApi.mock(undefined);
      expect(testApi.options.mock).toEqual({});
    });

    test("应该正确处理数组类型的参数验证", () => {
      const testApi = api.get("/test-array-type").group("Test");

      // 测试数组类型，如 'JsonSchema[]'
      testApi.query({
        tags: { type: "String[]" } as any,
      });

      // 这应该不会抛出错误，因为 String 是内置类型
      expect(() => {
        testApi.init(apiService as any);
      }).not.toThrow();
    });
  });
});

describe("API 构造与入参校验", () => {
  const SRC = { absolute: "/virtual/test-api.ts", relative: "test-api.ts" };

  test("构造函数应校验 method/path/prefix 入参", () => {
    expect(() => new API(123 as unknown as string, "/p", SRC)).toThrow("`method`必须是字符串类型");
    expect(() => new API("bad" as SUPPORT_METHODS, "/p", SRC)).toThrow("`method`必须是以下请求方法中的一个");
    expect(() => new API("get", 123 as unknown as string, SRC)).toThrow("`path`必须是字符串类型");
    expect(() => new API("get", "p", SRC)).toThrow('`path`必须以"/"开头');
    expect(() => new API("get", "/p", SRC, undefined, "pp")).toThrow('`prefix`必须以"/"开头');
  });

  test("构造函数应归一化 method 大小写并生成 key/realPath", () => {
    const a = new API("GET", "/p1", SRC);
    expect(a.options.method).toBe("get");
    expect(a.key).toBe("GET_/p1");
    expect(a.options.realPath).toBe("/p1");
    expect(a.options.group).toBe("");
    expect(a.inited).toBe(false);
    expect(a.pathTestRegExp.test("/p1")).toBe(true);
    expect(a.pathTestRegExp.test("/other")).toBe(false);
  });

  test("pathTest 应同时匹配 method（大小写归一）与路径", () => {
    const s = lib().api.get("/pt-check");
    expect(s.pathTest("get", "/pt-check")).toBe(true);
    expect(s.pathTest("GET", "/pt-check")).toBe(true);
    expect(s.pathTest("post", "/pt-check")).toBe(false);
    expect(s.pathTest("get", "/pt-other")).toBe(false);
  });

  test("example 应校验 input/output 为对象", () => {
    const s = new API("get", "/ex-validate", SRC);
    expect(() => s.example({ input: "str" as unknown as Record<string, unknown>, output: {} })).toThrow(
      "`input`必须是一个对象"
    );
    expect(() => s.example({ input: {} })).toThrow("`output`必须是一个对象");
    // 合法 example 正常入列
    s.example({ input: { a: 1 }, output: { b: 2 } });
    expect(s.options.examples).toEqual([{ input: { a: 1 }, output: { b: 2 } }]);
  });
});

describe("API define 全量选项归一化", () => {
  test("define 应把全部选项归一化到 options", () => {
    const erest = lib();
    const bodyS = z.object({ b: z.string() });
    const queryS = z.object({ q: z.number() });
    const paramsS = z.object({ p: z.string() });
    const headersS = z.object({ h: z.string() });
    const responseS = z.object({ r: z.boolean() });
    const midFn = () => {};
    const beforeFn = () => {};
    const handlerFn = () => {};
    const s = erest.api.define({
      method: "POST",
      path: "/define-full",
      title: "T",
      description: "D",
      group: "Index",
      response: responseS,
      body: bodyS,
      query: queryS,
      params: paramsS,
      headers: headersS,
      requiredOneOf: ["a", "b"],
      middlewares: [midFn],
      before: [beforeFn],
      handler: handlerFn,
      mock: { m: 1 },
    });
    expect(s.options.title).toBe("T");
    expect(s.options.description).toBe("D");
    expect(s.options.group).toBe("Index");
    expect(s.options.response).toBe(responseS);
    expect(s.options.bodySchema).toBe(bodyS);
    expect(s.options.querySchema).toBe(queryS);
    expect(s.options.paramsSchema).toBe(paramsS);
    expect(s.options.headersSchema).toBe(headersS);
    expect(s.options.requiredOneOf).toEqual([["a", "b"]]);
    expect(Array.from(s.options.middlewares)).toEqual([midFn]);
    expect(Array.from(s.options.beforeHooks)).toEqual([beforeFn]);
    expect(s.options.handler).toBe(handlerFn);
    expect(s.options.mock).toEqual({ m: 1 });
  });

  test("define 仅传必填项时应保持各字段为空", () => {
    const erest = lib();
    const handlerFn = () => {};
    const s = erest.api.define({
      method: "GET",
      path: "/define-min",
      title: "T2",
      handler: handlerFn,
      middlewares: [],
      before: [],
    });
    expect(s.options.description).toBeUndefined();
    expect(s.options.response).toBeUndefined();
    expect(s.options.bodySchema).toBeUndefined();
    expect(s.options.paramsSchema).toBeUndefined();
    expect(s.options.headersSchema).toBeUndefined();
    expect(s.options.requiredOneOf).toEqual([]);
    expect(s.options.mock).toBeUndefined();
    expect(Array.from(s.options.middlewares)).toEqual([]);
    expect(Array.from(s.options.beforeHooks)).toEqual([]);
  });
});

describe("API registerTyped 包装 handler 行为", () => {
  const SRC = { absolute: "/virtual/test-api.ts", relative: "test-api.ts" };

  test("handler 返回 undefined 时不应触发 response schema 校验", async () => {
    const rt = new API("get", "/rt-no-return", SRC);
    rt.group("Index");
    rt.registerTyped({ response: z.object({ ok: z.boolean() }) }, () => {
      // 返回 undefined：response schema 不应 parse(undefined)
    });
    const ctx: Record<string, unknown> = {};
    await (rt.options.handler as unknown as (c: unknown) => Promise<void>)(ctx);
    expect(ctx.__returned).toBe(true);
    expect(ctx.__returnValue).toBeUndefined();
  });

  test("$validated 部分层级缺失时应补空对象", async () => {
    const rt2 = new API("get", "/rt-layers", SRC);
    rt2.group("Index");
    let captured: Record<string, unknown> = {};
    rt2.registerTyped({}, (req) => {
      captured = req as unknown as Record<string, unknown>;
    });
    const ctx2 = { $validated: { params: { id: 7 }, query: { q: "s" } } };
    await (rt2.options.handler as unknown as (c: unknown) => Promise<void>)(ctx2);
    expect(captured.params).toEqual({ id: 7 });
    expect(captured.query).toEqual({ q: "s" });
    expect(captured.body).toEqual({});
    expect(captured.headers).toEqual({});
  });
});
