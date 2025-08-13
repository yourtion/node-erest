import { vol } from "memfs";
import { vi } from "vitest";
import { apiDelete, build, nameParams, TYPES } from "./helper";
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
    expect((apiInfo?.options.params as any)?.name).toEqual(nameParams);
    expect(apiInfo?.options._allParams.get("name")).toEqual(nameParams);
    expect(apiInfo?.options.handler?.name).toBe("del");
  });

  test("API 接口信息更新测试", () => {
    deleteApi.title("newTitle");
    deleteApi.description("Yourtion");
    const example = {
      input: { a: "b" },
      output: { name: "d" },
    };
    const outSchema = { name: nameParams } as any;
    deleteApi.example(example);
    deleteApi.response(outSchema);
    deleteApi.query({
      numP2: build(TYPES.Number, "Number", true, 10, { max: 10, min: 0 }),
    });

    const apiInfo = api.$apis.get("DELETE_/index/:name");
    expect(apiInfo?.options.title).toBe("newTitle");
    expect(apiInfo?.options.description).toBe("Yourtion");
    expect(apiInfo?.options.examples.length).toBe(1);
    expect(apiInfo?.options.examples[0]).toEqual(example);
    expect(apiInfo?.options.response).toEqual(outSchema);
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
    test("应该在 ENUM 类型缺少 params 时抛出错误", () => {
      const testApi = api.get("/test-enum").group("Test");

      testApi.query({
        status: { type: "ENUM" } as any, // 缺少 params
      });

      expect(() => {
        testApi.init(apiService as any);
      }).toThrow("ENUM is require a params");
    });

    test("应该在使用未知类型时抛出错误", () => {
      const testApi = api.get("/test-unknown").group("Test");

      testApi.query({
        data: { type: "UnknownCustomType" } as any,
      });

      expect(() => {
        testApi.init(apiService as any);
      }).toThrow("Unknown type: UnknownCustomType. Please register this type first.");
    });

    test("应该正确处理 response 的不同类型", async () => {
      const { z } = await import("zod");

      // 测试字符串类型的 response
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

      // 测试 ISchemaType 的 response
      const testApi3 = api.get("/test-response-ischema").group("Test");
      testApi3.response({ type: "String" } as any);
      testApi3.init(apiService as any);
      expect(testApi3.options.responseSchema).toBeDefined();
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

    test("headers 方法应该验证参数类型", () => {
      const testApi = api.get("/test-headers").group("Test");

      expect(() => {
        testApi.headers("invalid type" as any);
      }).toThrow("Headers parameter must be either ISchemaType record or Zod schema");
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
