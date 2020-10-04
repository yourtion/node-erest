import os from "os";
import { createReadStream } from "fs";
import { resolve } from "path";

import express from "express";

import { apiAll, apiJson, build, TYPES } from "./helper";
import lib from "./lib";

// 初始化 Express
const app = express();
const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: true }));
app.use("/api", router);

// 初始化 ERest
const apiService = lib();
const api = apiService.api;
apiAll(api);
apiJson(api);
apiJson(api, "/json3").response({});
const jsonApi = apiJson(api, "/json2");
jsonApi.description("测试JSON用");
const JsonSchema = {
  num: build(TYPES.Number, "Number", false, 10, { max: 10, min: 0 }),
  type: build(TYPES.ENUM, "类型", false, undefined, ["a", "b"]),
  int_arr: build(TYPES.IntArray, "数组"),
  date: build(TYPES.Date, "日期"),
};
jsonApi.response(JsonSchema);
jsonApi.query(JsonSchema);
jsonApi.requiredOneOf(["age", "type"]);

apiService.schema.register("JsonSchema", JsonSchema);
apiJson(api, "/json4").query({ a: build("JsonSchema[]", "JsonSchema Array") });

// 绑定路由并开始测试
apiService.bindRouter(router, apiService.checkerExpress);
// 绑定路由后再加载错误处理中间件
router.use((err: any, req: any, res: any, next: any) => {
  if (err) return res.end(err.message);
  next();
});

// 初始化测试
apiService.initTest(app, __dirname, os.tmpdir());

// 添加测试格式化函数
function format(data: any): [Error | null, any] {
  if (typeof data === "object") {
    if (data.success) {
      return [null, data.result || "success"];
    }
    return [data.msg || "error", null];
  }
  return [null, data];
}
apiService.setFormatOutput(format);

const DOC_DATA = new Map();
// 配置文档输出方法
function writter(path: string, data: any) {
  return DOC_DATA.set(path, data);
}
apiService.setDocWritter(writter);

const share = {
  name: "Yourtion",
  age: 22,
  ageStr: "abc",
};

// 使用 session 和 apiService.test 进行测试
for (const agent of [apiService.test.session(), apiService.test]) {
  const info = agent === apiService.test ? "No session" : "Session";

  describe(`TEST - ${info}`, () => {
    test("Get success", async () => {
      const { text: ret } = await agent
        .get("/api/index")
        .input({
          name: share.name,
        })
        .takeExample("Index-Get")
        .raw();
      expect(ret).toBe(`Get ${share.name}`);
    });

    test("Post success", async () => {
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

    test("Put success", async () => {
      const { text: ret } = await agent
        .put("/api/index")
        .input({
          age: share.age,
        })
        .takeExample("Index-Put")
        .raw();
      expect(ret).toBe(`Put ${share.age}`);
    });

    test("Delete success", async () => {
      const { text: ret } = await agent
        .delete("/api/index/" + share.name)
        .takeExample("Index-Delete")
        .raw();
      expect(ret).toBe(`Delete ${share.name}`);
    });

    test("Patch success", async () => {
      const { text: ret } = await agent.patch("/api/index").takeExample("Index-Patch").raw();
      expect(ret).toBe(`Patch`);
    });

    test("Post missing params", async () => {
      const { text: ret } = await agent
        .post("/api/index")
        .query({
          name: "a",
        })
        .attach({
          field: 666,
          file: createReadStream(resolve(__dirname, "./lib.ts")),
        })
        .takeExample("Index-Post")
        .raw();
      expect(ret).toBe("missing required parameter 'age'");
    });

    test("Post missing params", async () => {
      const { text: ret } = await agent
        .put("/api/index")
        .input({
          age: share.ageStr,
        })
        .takeExample("Index-Post")
        .raw();
      expect(ret).toBe("incorrect parameter 'age' should be valid Integer");
    });

    test("JSON FormatOutput error", async () => {
      const ret = await agent
        .get("/api/json")
        .input({
          age: 10,
        })
        .takeExample("Index-JSON")
        .error();
      expect(ret).toBe("error");
    });

    test("JSON FormatOutput success", async () => {
      const ret = await agent
        .get("/api/json")
        .input({
          age: share.age,
        })
        .takeExample("Index-JSON")
        .success();
      expect(ret).toEqual({ age: share.age });
    });

    test("Header success", async () => {
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

    test("API requiredOneOf error", async () => {
      const ret = await agent.get("/api/json2").takeExample("Index-JSON").error();
      expect(ret).toBe("error");
    });

    test("API default value", async () => {
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

    test("success when error", async () => {
      try {
        const ret = await agent.get("/api/json2").success();
        expect(ret).toBeUndefined();
      } catch (err) {
        expect(err.message).toContain("期望API输出成功结果，但实际输出失败结果");
      }
    });

    test("error when success", async () => {
      try {
        const ret = await agent.get("/api/json").input({ age: share.age }).error();
        expect(ret).toBeUndefined();
      } catch (err) {
        expect(err.message).toContain("期望API输出失败结果，但实际输出成功结果");
      }
    });

    test("unregister api session", async () => {
      try {
        const ret = await agent.get("/api/qqq").error();
        expect(ret).toBeUndefined();
      } catch (err) {
        expect(err.message).toContain("尝试请求未注册的API");
      }
    });

    test("unregister api seeion", async () => {
      try {
        const ret = await apiService.test.get("/api/qqq").error();
        expect(ret).toBeUndefined();
      } catch (err) {
        expect(err.message).toContain("尝试请求未注册的API");
      }
    });

    test("Header params success", async () => {
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
}

describe("Doc - 文档生成", () => {
  beforeAll(async () => {
    // 添加自定义类型用于文档生成
    apiService.type.register("Any2", { checker: (v) => v });
  });

  test("Gen docs", () => {
    apiService.genDocs("/", false);
    expect(DOC_DATA.size).toEqual(10);
  });

  test("Docs plugin", () => {
    const mockPlugin = jest.fn((data, dir, options, writter) => {});
    apiService.addDocPlugin("test", mockPlugin);
    apiService.genDocs("/", false);
    expect(mockPlugin.mock.calls.length).toBe(1);
  });

  test("getSwaggerInfo", () => {
    const data = apiService.buildSwagger();
    expect(data).toBeInstanceOf(Object);
  });
});
