import { resolve } from "node:path";
import express from "express";
import { vol } from "memfs";
import { vi } from "vitest";
import { z } from "zod";

import { apiAll, apiJson, build, TYPES } from "./helper";
import lib from "./lib";

describe("ERest 测试套件", () => {
  let app: express.Application;
  let router: express.Router;
  let apiService: ReturnType<typeof lib>;
  let api: ReturnType<typeof lib>["api"];
  let DOC_DATA: Map<string, unknown>;

  beforeAll(() => {
    // 重置虚拟文件系统
    vol.reset();
    vol.mkdirSync("/tmp", { recursive: true });

    // 创建测试文件
    vol.writeFileSync("/tmp/lib.ts", 'export default function() { return "test"; }');

    // 初始化 Express
    app = express();
    router = express.Router();
    router.use(express.json());
    router.use(express.urlencoded({ extended: true }));
    app.use("/api", router);

    // 初始化 ERest
    apiService = lib();
    api = apiService.api;
    apiAll(api as any);
    apiJson(api as any);
    apiJson(api as any, "/json3").response({});
    const jsonApi = apiJson(api as any, "/json2");
    jsonApi.description("测试JSON用");
    const JsonSchemaObj = {
      num: build(TYPES.Number, "Number", false, 10, { max: 10, min: 0 }),
      type: build(TYPES.ENUM, "类型", false, undefined, ["a", "b"]),
      int_arr: build(TYPES.IntArray, "数组"),
      date: build(TYPES.Date, "日期"),
    } as any;
    const JsonSchema = apiService.createSchema(JsonSchemaObj);
    jsonApi.response(JsonSchemaObj);
    jsonApi.query(JsonSchemaObj);
    jsonApi.requiredOneOf(["age", "type"]);

    apiService.schema.register("JsonSchema", JsonSchema);
    apiJson(api as any, "/json4").query({ a: build("JsonSchema[]", "JsonSchema Array") } as any);

    // 绑定路由并开始测试
    apiService.bindRouter(router, apiService.checkerExpress);
    // 绑定路由后再加载错误处理中间件
    router.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (err) return res.end((err as Error).message);
      next();
    });

    // 初始化测试 - 使用模拟的临时目录
    apiService.initTest(app, "/tmp", "/tmp");

    // 添加测试格式化函数
    function format(data: unknown): [Error | null, unknown] {
      if (typeof data === "object" && data !== null) {
        if ((data as any).success) {
          return [null, (data as any).result || "success"];
        }
        return [(data as any).msg || "error", null];
      }
      return [null, data];
    }
    apiService.setFormatOutput(format);

    DOC_DATA = new Map();
    // 配置文档输出方法
    function writter(path: string, data: unknown) {
      return DOC_DATA.set(path, data);
    }
    apiService.setDocWritter(writter);
  });

  const share = {
    name: "Yourtion",
    age: 22,
    ageStr: "abc",
  };

  // 使用 session 和 apiService.test 进行测试
  describe("API 测试", () => {
    const testCases = [
      { name: "Express Session 测试", getAgent: () => apiService.test.session() },
      { name: "Express 无 Session 测试", getAgent: () => apiService.test },
    ];

    testCases.forEach(({ name, getAgent }) => {
      describe(name, () => {
        let agent: any;

        beforeEach(() => {
          agent = getAgent();
        });
        test("GET 请求成功测试", async () => {
          const { text: ret } = await agent
            .get("/api/index")
            .input({
              name: share.name,
            })
            .takeExample("Index-Get")
            .raw();
          expect(ret).toBe(`Get ${share.name}`);
        });

        test("POST 请求成功测试", async () => {
          const { text: ret } = await agent
            .post("/api/index")
            .query({
              name: share.name,
            })
            .input({
              age: share.age,
            })
            .takeExample("Index-Post")
            .raw();
          expect(ret).toBe(`Post ${share.name}:${share.age}`);
        });

        test("PUT 请求成功测试", async () => {
          const { text: ret } = await agent
            .put("/api/index")
            .input({
              age: share.age,
            })
            .takeExample("Index-Put")
            .raw();
          expect(ret).toBe(`Put ${share.age}`);
        });

        test("DELETE 请求成功测试", async () => {
          const { text: ret } = await agent.delete(`/api/index/${share.name}`).takeExample("Index-Delete").raw();
          expect(ret).toBe(`Delete ${share.name}`);
        });

        test("PATCH 请求成功测试", async () => {
          const { text: ret } = await agent.patch("/api/index").takeExample("Index-Patch").raw();
          expect(ret).toBe(`Patch`);
        });

        test("POST 缺少参数测试", async () => {
          const { text: ret } = await agent
            .post("/api/index")
            .query({
              name: "a",
            })
            .attach({
              field: 666,
              file: vi.fn(() => ({
                pipe: vi.fn(),
                on: vi.fn(),
                read: vi.fn(),
                pause: vi.fn(),
                resume: vi.fn(),
                destroy: vi.fn(),
                readable: true,
                readableEnded: false,
              }))(),
            })
            .takeExample("Index-Post")
            .raw();
          expect(ret).toBe("missing required parameter 'age'");
        });

        test("PUT 参数错误测试", async () => {
          const { text: ret } = await agent
            .put("/api/index")
            .input({
              age: share.ageStr,
            })
            .takeExample("Index-Post")
            .raw();
          expect(ret).toBe("incorrect parameter 'age' should be valid Integer");
        });

        test("JSON 格式输出错误测试", async () => {
          const ret = await agent
            .get("/api/json")
            .input({
              age: 10,
            })
            .takeExample("Index-JSON")
            .error();
          expect(ret).toBe("error");
        });

        test("JSON 格式输出成功测试", async () => {
          const ret = await agent
            .get("/api/json")
            .input({
              age: share.age,
            })
            .takeExample("Index-JSON")
            .success();
          expect(ret).toEqual({ age: share.age });
        });

        test("请求头成功测试", async () => {
          const { body } = await agent
            .get("/api/json")
            .headers({
              test: true,
            })
            .input({
              age: share.age,
            })
            .takeExample("Index-Header")
            .raw();
          expect(body.result).toEqual({ age: share.age });
          expect(body.headers.test).toEqual("true");
        });

        test("API 必需参数错误测试", async () => {
          const ret = await agent.get("/api/json2").takeExample("Index-JSON").error();
          expect(ret).toBe("error");
        });

        test("API 默认值测试", async () => {
          const ret = await agent
            .get("/api/json2")
            .input({
              age: share.age,
              $a: "a",
            })
            .headers({ hello: "world" })
            .takeExample("Index-JSON")
            .success();
          expect(ret).toEqual({ age: 22, num: 10 });
        });

        test("期望错误但成功的情况测试", async () => {
          try {
            const ret = await agent.get("/api/json2").success();
            expect(ret).toBeUndefined();
          } catch (err) {
            expect((err as Error).message).toContain("期望API输出成功结果，但实际输出失败结果");
          }
        });

        test("期望成功但错误的情况测试", async () => {
          try {
            const ret = await agent.get("/api/json").input({ age: share.age }).error();
            expect(ret).toBeUndefined();
          } catch (err) {
            expect((err as Error).message).toContain("期望API输出失败结果，但实际输出成功结果");
          }
        });

        test("未注册 API session 测试", async () => {
          try {
            const ret = await agent.get("/api/qqq").error();
            expect(ret).toBeUndefined();
          } catch (err) {
            expect((err as Error).message).toContain("尝试请求未注册的API");
          }
        });

        test("未注册 API 测试", async () => {
          try {
            const ret = await apiService.test.get("/api/qqq").error();
            expect(ret).toBeUndefined();
          } catch (err) {
            expect((err as Error).message).toContain("尝试请求未注册的API");
          }
        });

        test("请求头参数成功测试", async () => {
          const { text: ret } = await agent
            .get("/api/header")
            .headers({
              name: share.name,
            })
            .takeExample("Index-Header")
            .raw();
          expect(ret).toBe(`Get ${share.name}`);
        });
      });
    });
  });

  describe("文档生成测试", () => {
    beforeAll(async () => {
      // 添加自定义类型用于文档生成
      apiService.type.register("Any2", z.unknown());
    });

    test("生成文档测试", () => {
      // 使用 mock 确保目录存在
      vol.mkdirSync("/", { recursive: true });
      apiService.genDocs("/", false);
      expect(DOC_DATA.size).toEqual(11);
    });

    test("文档插件测试", () => {
      const mockPlugin = vi.fn((_data, _dir, _options, _writter) => {});
      apiService.addDocPlugin("test", mockPlugin);
      vol.mkdirSync("/", { recursive: true });
      apiService.genDocs("/", false);
      expect(mockPlugin.mock.calls.length).toBe(1);
    });

    test("获取 Swagger 信息测试", () => {
      const data = apiService.buildSwagger();
      expect(data).toBeInstanceOf(Object);
    });
  });
});
