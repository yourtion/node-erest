import { createServer, type AddressInfo, type IncomingMessage, Server, type ServerResponse } from "node:http";
import * as stream from "node:stream";

import { expressAdapter } from "./adapters";

import express from "express";
import { vol } from "memfs";
import { afterAll, vi } from "vitest";
import { z } from "zod";

import { SUPPORT_METHOD, type SUPPORT_METHODS } from "../lib/api.js";
import { TestAgent } from "../lib/agent.js";
import IAPITest from "../lib/extend/test";
import { normalizeTestTarget } from "../lib/test-server.js";
import { apiAll, apiJson } from "./helper";
import lib from "./lib";

/** ANSI 颜色码（ESC + [ + 数字 + m），用于校验/剥离 util.inspect colors 输出 */
const ESC = String.fromCharCode(27);
const ANSI = new RegExp(`${ESC}\\[\\d+m`, "g");
const stripAnsi = (s: string) => s.replace(ANSI, "");

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
    apiJson(api as any, "/json3").response(z.object({}));
    const jsonApi = apiJson(api as any, "/json2");
    jsonApi.description("测试JSON用");
    // 迁移到原生 Zod：age + num(可选带默认)、type(enum)、int_arr(可选)、date(可选)
    const JsonSchemaObj = z.object({
      age: z.coerce.number().int(),
      num: z.number().min(0).max(10).default(10),
      type: z.enum(["a", "b"]).optional(),
      int_arr: z.array(z.number().int()).optional(),
      date: z.coerce.date().optional(),
    });
    const JsonSchema = JsonSchemaObj;
    jsonApi.response(JsonSchemaObj);
    jsonApi.query(JsonSchemaObj);
    jsonApi.requiredOneOf(["age", "type"]);

    apiService.schema.register("JsonSchema", JsonSchema);
    apiJson(api as any, "/json4").query(z.object({ a: z.array(JsonSchemaObj) }));

    // 绑定路由并开始测试
    apiService.bind({ adapter: expressAdapter, router });
    // 绑定路由后再加载错误处理中间件。
    // 注意：Express 5 改变了子 router 内部错误的传播语义，router 级错误中间件
    // 可能捕获不到子层抛出的错误，因此挂到 app 级以兼容 Express 4 与 5。
    app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
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
          expect(ret).toBe("incorrect parameter 'age' should be valid");
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

  describe("Session cookie 持久化测试", () => {
    test("$agent.updateCookies 应把 set-cookie 写入 jar", () => {
      const session = apiService.test.session();
      session.$agent.updateCookies({ "set-cookie": "sessionid=abc123; Path=/; HttpOnly" });
      expect(session.$agent.getCookieHeader()).toBe("sessionid=abc123");
    });

    test("多 cookie 应累加到 jar", () => {
      const session = apiService.test.session();
      session.$agent.updateCookies({ "set-cookie": "a=1" });
      session.$agent.updateCookies({ "set-cookie": "b=2" });
      const header = session.$agent.getCookieHeader() || "";
      expect(header).toContain("a=1");
      expect(header).toContain("b=2");
    });

    test("session 跨请求应携带已存储的 cookie", async () => {
      // 一次真实请求触发 onResponse（验证 agent 把 set-cookie 写回 jar 的链路）
      // 注：erest 测试 API 本身不 set-cookie，这里验证 session 的 cookie 注入逻辑：
      // 预先写入 jar，发起请求时 header 应携带该 cookie（服务端行为不依赖）
      const session = apiService.test.session();
      session.$agent.updateCookies({ "set-cookie": "tracking=xyz" });
      // session.get 返回的 TestAgent 会通过 cookieHeader 回调注入 tracking=xyz
      // 用一个会成功的请求验证链路不报错（cookie 被附加到请求）
      const ret = await session.get("/api/json").input({ age: 22 }).success();
      expect(ret).toEqual({ age: 22 });
      expect(session.$agent.getCookieHeader()).toContain("tracking=xyz");
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

  describe("success<T>() 返回类型从 response schema 推导", () => {
    it("声明 response schema 时 success() 返回内层数据（运行时）", async () => {
      const app2 = express();
      app2.use(express.json());
      const apiService2 = lib({ basePath: "" });
      const UserVO = z.object({ id: z.number(), name: z.string() });
      apiService2.api
        .get("/vo-test")
        .group("Index")
        .title("vo")
        .registerTyped({ response: UserVO }, (req: any, ctx: any) =>
          ctx.reply.json({ result: { id: 1, name: "Tom" } })
        );
      apiService2.bind({ adapter: expressAdapter, router: app2 });
      apiService2.setFormatOutput((data: unknown): [Error | null, unknown] => {
        const d = data as { result?: unknown };
        return d && typeof d === "object" && "result" in d ? [null, d.result] : [null, data];
      });
      apiService2.initTest(app2, "/tmp", "/tmp");

      const ret = await apiService2.test.get("/vo-test").success();
      expect(ret).toEqual({ id: 1, name: "Tom" });
    });

    it("声明 response schema 时 success<T>() 的 T 被正确推导（类型层）", async () => {
      const app2 = express();
      app2.use(express.json());
      const apiService2 = lib({ basePath: "" });
      const UserVO = z.object({ id: z.number(), name: z.string() });
      apiService2.api
        .get("/vo-type")
        .group("Index")
        .title("vo-type")
        .registerTyped({ response: UserVO }, (req: any, ctx: any) =>
          ctx.reply.json({ result: { id: 1, name: "Tom" } })
        );
      apiService2.bind({ adapter: expressAdapter, router: app2 });
      apiService2.setFormatOutput((data: unknown): [Error | null, unknown] => {
        const d = data as { result?: unknown };
        return d && typeof d === "object" && "result" in d ? [null, d.result] : [null, data];
      });
      apiService2.initTest(app2, "/tmp", "/tmp");

      type UserVO = z.infer<typeof UserVO>;
      const ret = await apiService2.test.get<UserVO>("/vo-type").success<UserVO>();
      // 类型断言：ret 必须是 UserVO，不是 unknown
      const _check: UserVO = ret;
      expect(_check.id).toBe(1);
    });
  });
});

describe("TestAgent 行为（fetch 驱动）", () => {
  const SRC = { absolute: "/virtual/test-test.ts", relative: "test-test.ts" };
  let erestA: ReturnType<typeof lib>;
  let seen: Array<{ method: string; url: string; headers: Record<string, string>; body: string }>;
  let baseUrl: string;
  let server: ReturnType<typeof createServer>;
  const last = () => seen[seen.length - 1];

  const makeAgent = (
    erestIns: ReturnType<typeof lib>,
    method: SUPPORT_METHODS,
    path: string,
    key: string,
    cookieHeader?: () => string | undefined,
    onResponse?: (headers: Record<string, string>) => void
  ) => {
    const a = new TestAgent(method, path, key, SRC, erestIns as never);
    a.bindRequest(
      async () => baseUrl,
      async () => {},
      cookieHeader,
      onResponse
    );
    return a;
  };

  beforeAll(async () => {
    erestA = lib();
    seen = [];
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c: Buffer) => (body += c.toString()));
      req.on("end", () => {
        seen.push({ method: req.method as string, url: req.url as string, headers: req.headers as never, body });
        if (req.url!.includes("plain-json")) {
          res.setHeader("content-type", "text/plain");
          res.end('{"a":1}');
          return;
        }
        if (req.url!.includes("set-cookie")) {
          res.setHeader("Set-Cookie", "sid=abc; Path=/");
        }
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ method: req.method, url: req.url, body }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    // 注册两个 API：echo-t / echo-err 用于 tested 与 Example 断言
    erestA.api
      .get("/echo-t")
      .group("Index")
      .register(() => {});
    erestA.api
      .get("/echo-err")
      .group("Index")
      .register(() => {});
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test("构造函数应校验 method/path 入参", () => {
    const ins = erestA as never;
    expect(() => new TestAgent(123 as unknown as string, "/p", "k", SRC, ins)).toThrow("`method` must be string");
    expect(() => new TestAgent("bad" as SUPPORT_METHODS, "/p", "k", SRC, ins)).toThrow(
      `\`method\` must be one of ${SUPPORT_METHOD}`
    );
    expect(() => new TestAgent("get", 123 as unknown as string, "k", SRC, ins)).toThrow("`path` must be string");
    expect(() => new TestAgent("get", "no-slash", "k", SRC, ins)).toThrow('`path` must be start with "/"');
  });

  test("未 bindRequest 时默认 getBaseUrl 应返回空字符串", async () => {
    const a = new TestAgent("get", "/d", "GET_/d", SRC, erestA as never);
    expect(await a.options.getBaseUrl()).toBe("");
  });

  test("takeExample/headers 应记录状态并支持链式", () => {
    const a = makeAgent(erestA, "get", "/st", "GET_/st");
    expect(a.takeExample("N1")).toBe(a);
    expect(a.options.takeExample).toBe(true);
    expect(a.options.agentTestName).toBe("N1");
    a.headers({ "x-t": "1" });
    expect(a.options.agentHeader).toEqual({ "x-t": "1" });
  });

  test("attach 应把流写入 form、普通值字符串化且不丢失 agentInput", () => {
    const a = makeAgent(erestA, "post", "/att", "POST_/att");
    const readable = new stream.Readable({ read() {} });
    a.attach({ f: "x", s: readable });
    const form = (a as unknown as { state: { form: FormData } }).state.form;
    // 普通值走 String() 序列化分支
    expect(form.get("f")).toBe("x");
    // 流走 FormData 分支（非 null）
    expect(form.get("s")).not.toBe(null);
    // 流字段被 delete，不进入 agentInput；普通字段保留
    expect(a.options.agentInput).toEqual({ f: "x" });
  });

  test("未注册 key 上 saveExample 应安全跳过", () => {
    const u = makeAgent(erestA, "get", "/nx", "GET_/nx");
    u.takeExample("X");
    expect(() => (u as unknown as { saveExample: () => void }).saveExample()).not.toThrow();
    expect(erestA.api.$apis.get("GET_/nx")).toBeUndefined();
  });

  test("GET input 应序列化为 query string", async () => {
    const g = makeAgent(erestA, "get", "/echo", "GET_/echo4");
    await g.input({ name: "N" }).raw();
    const r = last();
    expect(r.url).toBe("/echo?name=N");
    expect(r.method).toBe("GET");
    expect(r.body).toBe("");
    expect(r.headers["content-type"]).toBeUndefined();
  });

  test("query 中 undefined/null 应被过滤，对象应 JSON 编码", async () => {
    const a = makeAgent(erestA, "get", "/echo", "GET_/echo5");
    await a.query({ a: undefined, b: null, k: "v" }).raw();
    expect(last().url).toBe("/echo?k=v");

    const b = makeAgent(erestA, "get", "/echo", "GET_/echo6");
    await b.query({ o: { x: 1 } }).raw();
    expect(last().url).toBe(`/echo?o=${encodeURIComponent('{"x":1}')}`);
  });

  test("POST input 应发送 JSON body 并设置 content-type", async () => {
    const p = makeAgent(erestA, "post", "/echo", "POST_/echo7");
    await p.input({ age: 22 }).raw();
    const r = last();
    expect(r.method).toBe("POST");
    expect(r.body).toBe('{"age":22}');
    expect(r.headers["content-type"]).toBe("application/json");
  });

  test("POST 未设置 input 时不应发送 body 与 content-type", async () => {
    const p2 = makeAgent(erestA, "post", "/echo", "POST_/echo8");
    await p2.raw();
    const r = last();
    expect(r.body).toBe("");
    expect(r.headers["content-type"]).toBeUndefined();
  });

  test("DELETE input 应归入 query 而非 body", async () => {
    const d = makeAgent(erestA, "delete", "/echo", "DELETE_/echo9");
    await d.input({ id: 5 }).raw();
    const r = last();
    expect(r.method).toBe("DELETE");
    expect(r.url).toBe("/echo?id=5");
    expect(r.body).toBe("");
    expect(r.headers["content-type"]).toBeUndefined();
  });

  test("attach 后应以 multipart form 发送", async () => {
    const f = makeAgent(erestA, "post", "/echo", "POST_/echo10");
    await f.attach({ field: "v" }).raw();
    const r = last();
    expect(r.headers["content-type"]).toContain("multipart/form-data");
    expect(r.body).toContain('name="field"');
  });

  test("cookieHeader 回调返回值应注入请求 cookie 头", async () => {
    const c = makeAgent(erestA, "get", "/echo", "GET_/echo11", () => "sid=abc");
    await c.raw();
    expect(last().headers.cookie).toBe("sid=abc");
  });

  test("单条 Set-Cookie 响应头应透传给 onResponse", async () => {
    const onResponse = vi.fn();
    const a = makeAgent(erestA, "get", "/set-cookie", "GET_/set-cookie", undefined, onResponse);
    await a.raw();
    expect(onResponse).toHaveBeenCalledTimes(1);
    const headers = onResponse.mock.calls[0][0] as Record<string, string>;
    expect(headers["set-cookie"]).toBe("sid=abc; Path=/");
  });

  test("非 JSON 响应（合法 JSON 文本的 text/plain）body 应保持 {}", async () => {
    const k = makeAgent(erestA, "get", "/plain-json", "GET_/plain-json");
    const raw = (await k.raw()) as unknown as {
      status: number;
      text: string;
      body: unknown;
      headers: Record<string, string>;
    };
    expect(raw.status).toBe(200);
    expect(raw.text).toBe('{"a":1}');
    expect(raw.body).toEqual({});
    expect(raw.headers["content-type"]).toBe("text/plain");
  });

  test("JSON 响应应解析为对象并保留全部响应头", async () => {
    const j = makeAgent(erestA, "get", "/echo", "GET_/echo12");
    const raw = (await j.raw()) as unknown as {
      status: number;
      body: Record<string, unknown>;
      headers: Record<string, string>;
    };
    expect(raw.status).toBe(200);
    expect(raw.body.url).toBe("/echo");
    expect(raw.headers["content-type"]).toBe("application/json");
  });

  test("请求后应把对应 API 标记为 tested", async () => {
    const apiIns = erestA.api.$apis.get("GET_/echo-t")!;
    expect(apiIns.options.tested).toBe(false);
    const t = makeAgent(erestA, "get", "/echo-t", "GET_/echo-t");
    await t.raw();
    expect(apiIns.options.tested).toBe(true);
  });

  test("未注册 key 的请求应正常完成（不写 tested 标记）", async () => {
    const nx = makeAgent(erestA, "get", "/nx2", "GET_/nx2");
    const raw = (await nx.raw()) as unknown as { status: number };
    expect(raw.status).toBe(200);
  });

  test("success 应保存 takeExample 记录（含 headers/input/output）", async () => {
    const n = makeAgent(erestA, "get", "/echo-t", "GET_/echo-t");
    await n.headers({ h: "1" }).input({ a: 1 }).takeExample("ExSuccess").success();
    const ex = erestA.api.$apis.get("GET_/echo-t")!.options.examples;
    expect(ex.length).toBe(1);
    expect(ex[0].name).toBe("ExSuccess");
    expect(ex[0].path).toBe("/echo-t?a=1");
    expect(ex[0].headers).toEqual({ h: "1" });
    expect(ex[0].input).toEqual({ a: 1 });
    expect((ex[0].output as Record<string, unknown>).url).toBe("/echo-t?a=1");
  });

  test("error 对成功响应应返回含提示的 Error 并保存 example", async () => {
    const o1 = makeAgent(erestA, "get", "/echo", "GET_/echo13");
    const err1 = (await o1.error()) as Error;
    expect(err1).toBeInstanceOf(Error);
    expect(err1.message).toContain("期望API输出失败结果，但实际输出成功结果");

    const o2 = makeAgent(erestA, "get", "/echo-err", "GET_/echo-err");
    await o2.takeExample("ExError").error();
    const ex2 = erestA.api.$apis.get("GET_/echo-err")!.options.examples;
    expect(ex2.length).toBe(1);
    expect(ex2[0].name).toBe("ExError");
  });

  test("error 应透传 formatOutputReverse 返回的错误", async () => {
    const erestB = lib();
    erestB.api
      .get("/boom")
      .group("Index")
      .register(() => {});
    erestB.api.formatOutputReverse = () => [new Error("boom"), null];
    const b = makeAgent(erestB, "get", "/boom", "GET_/boom");
    const errB = (await b.error()) as Error;
    expect(errB.message).toBe("boom");
  });

  test("debug 通道应记录链式操作与请求方法", async () => {
    // 用 POST：GET 携带 attach 的 form body 会被 fetch 拒绝
    const a = makeAgent(erestA, "post", "/dbg", "POST_/dbg");
    const dbg = vi.fn();
    a.debug = dbg as never;
    a.takeExample("D1");
    a.headers({ d: "1" });
    a.query({ q: 1 });
    a.input({ i: 1 });
    a.attach({ f: "v" });
    (a as unknown as { saveExample: () => void }).saveExample();
    await a.raw();
    await a.success().catch(() => {});
    const firstArgs = dbg.mock.calls.map((c) => c[0] as string);
    expect(firstArgs).toContain("takeExample: %s");
    expect(firstArgs).toContain("headers: %j");
    expect(firstArgs).toContain("query: %j");
    expect(firstArgs).toContain("input: %j");
    expect(firstArgs).toContain("attach: %j");
    expect(firstArgs).toContain("Save Example: %o");
    expect(firstArgs).toContain("raw");
    expect(firstArgs).toContain("success");
  });

  test("success 失败时应以带颜色与完整深度的 inspect 输出错误详情", async () => {
    const erestC = lib();
    erestC.api
      .get("/deep")
      .group("Index")
      .register(() => {});
    erestC.api.formatOutputReverse = () =>
      [{ l1: { l2: { l3: "DEEPVAL" } } }, null] as unknown as [Error | null, unknown];
    const c = makeAgent(erestC, "get", "/deep", "GET_/deep");
    let msg = "";
    await c.success().catch((e: Error) => {
      msg = e.message;
    });
    expect(msg).toContain("期望API输出成功结果，但实际输出失败结果");
    // depth: 5 应展开第三层字段
    expect(stripAnsi(msg)).toContain("DEEPVAL");
    // colors: true 应包含 ANSI 颜色码（ESC + [）
    expect(msg).toContain(ESC + "[");
  });
});

// ---- extend/test.ts 补测（IAPITest 请求引擎与 session cookie） ----

/** 构造记录请求的 echo 处理器（函数形态 app → http.createServer 包装，随机端口） */
function echoHandler(log?: Array<{ method: string; url: string; cookie?: string }>) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const cookie = req.headers.cookie;
    if (log) log.push({ method: req.method!, url: req.url!, cookie });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ method: req.method, url: req.url, cookie: cookie ?? null }));
  };
}

/**
 * 等价于 initTest(app) 的最小装配：直接构造 IAPITest 并注入 app/testAgent，
 * 避免触发 initTest → genDocs → saveOnExit 的 process exit 监听器堆积。
 * （initTest 属于 index.ts，不是本文件的变异目标）
 */
function setupTestApp(svc: ReturnType<typeof lib>, app: unknown) {
  const impl = new IAPITest(svc as never, "/tmp");
  (svc as unknown as { app: unknown }).app = app;
  (svc as unknown as { testAgent: unknown }).testAgent = impl;
  return impl;
}

describe("extend/test.ts: 请求引擎", () => {
  test("GET/POST 真实请求命中随机端口服务器并解析 JSON 响应", async () => {
    const svc = lib();
    svc.api.get("/echo").title("e");
    svc.api.post("/submit").title("s");
    const test = setupTestApp(svc, echoHandler());

    const got = (await test.get("/api/echo").success()) as Record<string, unknown>;
    expect(got.method).toBe("GET");
    expect(got.url).toBe("/api/echo");

    const posted = (await test.post("/api/submit").input({ a: 1 }).success()) as Record<string, unknown>;
    expect(posted.method).toBe("POST");
    expect(posted.url).toBe("/api/submit");
  });

  test("findApi 精确 key 命中优先于路径正则回退（tested 标记落在正确的 API 上）", async () => {
    const svc = lib();
    svc.api.get("/users/:id").title("byId"); // 先注册：正则可匹配 /users/me
    svc.api.get("/users/me").title("me");
    const test = setupTestApp(svc, echoHandler());

    const out = (await test.get("/api/users/me").success()) as Record<string, unknown>;
    expect(out.url).toBe("/api/users/me");
    const byId = svc.api.$apis.get("GET_/users/:id")!;
    const me = svc.api.$apis.get("GET_/users/me")!;
    expect(me.options.tested).toBe(true);
    expect(byId.options.tested).toBe(false);
  });

  test("未 initTest 设置 app 时：get 与 session 断言失败并给出中文提示", () => {
    const svc = lib();
    svc.api.get("/x").title("x");
    const t = new IAPITest(svc as never, "/tmp");
    expect(() => t.get("/api/x")).toThrowError("请先调用 initTest(app) 设置 app 实例");
    expect(() => t.session()).toThrowError("请先调用 initTest(app) 设置 app 实例");
  });

  test("session 创建后 app 被清空：首次请求时 getTarget 断言失败", async () => {
    const svc = lib();
    svc.api.get("/y").title("y");
    const test = setupTestApp(svc, echoHandler());
    const session = test.session();
    (svc as unknown as { app?: unknown }).app = undefined;
    await expect(session.get("/api/y").success()).rejects.toThrow(/请先调用 initTest\(app\) 设置 app 实例/);
  });

  test("测试目标懒初始化并缓存：一次请求只归一化一次 app", async () => {
    const svc = lib();
    svc.api.get("/cache").title("c");
    const handler = echoHandler();
    const expressLike = {
      listen: vi.fn(() => createServer(handler)),
      handle: () => {},
    };
    const test = setupTestApp(svc, expressLike);
    const out = (await test.get("/api/cache").success()) as Record<string, unknown>;
    expect(out.url).toBe("/api/cache");
    expect(expressLike.listen).toHaveBeenCalledTimes(1);
  });

  test("未 listen 的 http.Server：getBaseUrl 等待 ready 后返回 baseUrl，真实请求可用", async () => {
    const svc = lib();
    svc.api.get("/ready").title("r");
    const server = createServer(echoHandler());
    const test = setupTestApp(svc, server);
    // 直接调用注入给 TestAgent 的 baseUrl 提供者：必须等待 server listening 后才取地址
    const baseUrl = await (test as unknown as { getBaseUrl: () => Promise<string> }).getBaseUrl();
    expect(baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    const res = (await test.get("/api/ready").success()) as Record<string, unknown>;
    expect(res.url).toBe("/api/ready");
    expect(res.method).toBe("GET");
  });
});

describe("extend/test.ts: session cookie", () => {
  /** 构造全新 session（cookie jar 位于 IAPITest 实例上，用例间需隔离） */
  function freshSession(handler: (req: IncomingMessage, res: ServerResponse) => void = echoHandler()) {
    const svc = lib();
    svc.api.get("/ping").title("p");
    return setupTestApp(svc, handler).session();
  }

  test("无 cookie 时 getCookieHeader 返回 undefined", () => {
    const session = freshSession();
    expect(session.$agent.getCookieHeader()).toBeUndefined();
  });

  test("updateCookies 解析矩阵：分隔/日期逗号/无空格逗号/空白修剪", () => {
    const session = freshSession();
    // 1) 常规：逗号+单空格分隔多个 Set-Cookie（多字符 cookie 名）
    session.$agent.updateCookies({ "set-cookie": "sid=abc; Path=/, token=xyz; Path=/" });
    expect(session.$agent.getCookieHeader()).toBe("sid=abc; token=xyz");
    // 2) 逗号后无空格同样切分
    session.$agent.updateCookies({ "set-cookie": "c=3,d=4" });
    expect(session.$agent.getCookieHeader()).toBe("sid=abc; token=xyz; c=3; d=4");
    // 3) Expires 日期中的逗号不切分，其后新 cookie 正确切分
    session.$agent.updateCookies({
      "set-cookie": "e=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT, f=2",
    });
    expect(session.$agent.getCookieHeader()).toBe("sid=abc; token=xyz; c=3; d=4; e=1; f=2");
  });

  test("updateCookies：无法解析的段（缺少 = 前的名字 / 空白名）不写入 jar", () => {
    const s1 = freshSession();
    s1.$agent.updateCookies({ "set-cookie": "a; b=2" });
    expect(s1.$agent.getCookieHeader()).toBeUndefined();

    const s2 = freshSession();
    s2.$agent.updateCookies({ "set-cookie": "  =1" });
    expect(s2.$agent.getCookieHeader()).toBeUndefined();
  });

  test("updateCookies：name 与 value 两侧空白被 trim", () => {
    const session = freshSession();
    session.$agent.updateCookies({ "set-cookie": " a = 1 ; Path=/" });
    expect(session.$agent.getCookieHeader()).toBe("a=1");
  });

  test("真实请求链路：Set-Cookie 写入 jar，后续请求自动携带 cookie 头", async () => {
    const seen: Array<{ cookie?: string }> = [];
    const handler = (req: IncomingMessage, res: ServerResponse) => {
      if (req.url === "/api/login") {
        res.writeHead(200, {
          "content-type": "application/json",
          // 单个头内逗号合并形式（代理/网关常见形态，正是 updateCookies 切分逻辑的适用场景）
          "set-cookie": "sid=abc; Path=/, token=xyz; Path=/",
        });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      seen.push({ cookie: req.headers.cookie });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ cookie: req.headers.cookie ?? null, url: req.url }));
    };
    const svc = lib();
    svc.api.get("/login").title("l");
    svc.api.get("/whoami").title("w");
    const session = setupTestApp(svc, handler).session();
    const login = (await session.get("/api/login").success()) as Record<string, unknown>;
    expect(login).toEqual({ ok: true });
    expect(session.$agent.getCookieHeader()).toBe("sid=abc; token=xyz");

    const who = (await session.get("/api/whoami").success()) as Record<string, unknown>;
    expect(who.cookie).toBe("sid=abc; token=xyz");
    expect(seen[seen.length - 1].cookie).toBe("sid=abc; token=xyz");
  });
});

// ---- test-server.ts：normalizeTestTarget 与地址归一化 ----

const serversToClose: Server[] = [];
const onceListening = (server: Server) => new Promise<void>((resolve) => server.once("listening", resolve));

afterAll(() => {
  for (const server of serversToClose) server.close();
});

describe("test-server: normalizeTestTarget 不支持的形态", () => {
  test("null / {} / 数字 / undefined 抛『不支持的 app 形态』", () => {
    expect(() => normalizeTestTarget(null)).toThrow(/不支持的 app 形态：object/);
    expect(() => normalizeTestTarget({})).toThrow(/不支持的 app 形态：object/);
    expect(() => normalizeTestTarget(123)).toThrow(/不支持的 app 形态：number/);
    expect(() => normalizeTestTarget(undefined)).toThrow(/不支持的 app 形态：undefined/);
  });

  test("只有 handle 没有 listen 的对象 → 不支持", () => {
    expect(() => normalizeTestTarget({ handle: () => {} })).toThrow(/不支持的 app 形态/);
  });

  test("只有 address 没有 listen 的对象 → 不支持（不被误判为 http.Server）", () => {
    expect(() => normalizeTestTarget({ address: () => ({}) })).toThrow(/不支持的 app 形态/);
  });

  test("listen 为函数但 handle 不是 → 不支持", () => {
    const realServer = createServer();
    serversToClose.push(realServer);
    expect(() => normalizeTestTarget({ listen: () => realServer, handle: "not-fn" })).toThrow(/不支持的 app 形态/);
  });

  test("带 listen/address 属性的 function 走函数分支（不被误判为 http.Server）", () => {
    const fn = ((req: unknown, res: unknown) => {
      (res as { end: (s: string) => void }).end("fn");
    }) as (() => void) & { listen?: unknown; address?: unknown };
    fn.listen = () => {};
    fn.address = () => ({});
    const target = normalizeTestTarget(fn);
    expect(target.server).toBeInstanceOf(Server);
    serversToClose.push(target.server!);
  });
});

describe("test-server: normalizeTestTarget 支持的形态", () => {
  test("Express 形态（listen + handle）：listen(0) 后经 startServer 暴露 baseUrl", async () => {
    const inner = createServer((req, res) => res.end("express-like"));
    serversToClose.push(inner);
    let listenPort: unknown;
    const expressLike = {
      listen: (p: unknown) => {
        listenPort = p;
        return inner;
      },
      handle: () => {},
    };
    const target = normalizeTestTarget(expressLike);
    expect(listenPort).toBe(0);
    expect(target.server).toBe(inner);
    await (target as { ready: () => Promise<void> }).ready();
    const { port } = inner.address() as AddressInfo;
    expect(target.baseUrl).toBe(`http://127.0.0.1:${port}`);
  });

  test("Express 形态：listen 返回无 unref 的裸对象也不抛错", () => {
    expect(() =>
      normalizeTestTarget({
        listen: () => ({ listen: () => {} }),
        handle: () => {},
      })
    ).not.toThrow();
  });

  test("普通函数：包装为 http.Server", async () => {
    const target = normalizeTestTarget((() => {}) as never);
    expect(target.server).toBeInstanceOf(Server);
    await (target as { ready: () => Promise<void> }).ready();
    serversToClose.push(target.server!);
  });

  test("未 listen 的 http.Server：经 startServer 启动到随机端口", async () => {
    const server = createServer();
    const target = normalizeTestTarget(server);
    expect(target.server).toBe(server);
    await (target as { ready: () => Promise<void> }).ready();
    const { port } = server.address() as AddressInfo;
    expect(target.baseUrl).toBe(`http://127.0.0.1:${port}`);
    serversToClose.push(server);
  });

  test("已 listen 的 http.Server：直接取地址且不接管关闭职责", async () => {
    const server = createServer();
    server.listen(0, "127.0.0.1");
    serversToClose.push(server);
    await onceListening(server);
    const { port } = server.address() as AddressInfo;
    const target = normalizeTestTarget(server);
    expect(target.server).toBeUndefined();
    expect(target.baseUrl).toBe(`http://127.0.0.1:${port}`);
  });

  test("server 关闭后读取 baseUrl：address() 为 null → 尚未 listening 抛错", async () => {
    const target = normalizeTestTarget((() => {}) as never);
    await (target as { ready: () => Promise<void> }).ready();
    await new Promise<void>((resolve) => target.server!.close(() => resolve()));
    expect(() => target.baseUrl).toThrow(/尚未 listening/);
  });
});

describe("test-server: 地址归一化（addressToUrl）", () => {
  test("通配 :: → 127.0.0.1", async () => {
    const server = createServer();
    server.listen(0);
    serversToClose.push(server);
    await onceListening(server);
    const { port } = server.address() as AddressInfo;
    expect(normalizeTestTarget(server).baseUrl).toBe(`http://127.0.0.1:${port}`);
  });

  test("通配 0.0.0.0 → 127.0.0.1", async () => {
    const server = createServer();
    server.listen(0, "0.0.0.0");
    serversToClose.push(server);
    await onceListening(server);
    const { port } = server.address() as AddressInfo;
    expect(normalizeTestTarget(server).baseUrl).toBe(`http://127.0.0.1:${port}`);
  });

  test("非通配 IPv6（::1）→ 保留并加方括号", async () => {
    const server = createServer();
    server.listen(0, "::1");
    serversToClose.push(server);
    await onceListening(server);
    const { port } = server.address() as AddressInfo;
    expect(normalizeTestTarget(server).baseUrl).toBe(`http://[::1]:${port}`);
  });

  test("unix socket 地址（string）→ 127.0.0.1:0", async () => {
    const server = createServer();
    const sockPath = `/tmp/erest-mutation-${process.pid}-${Date.now()}.sock`;
    server.listen(sockPath);
    serversToClose.push(server);
    await onceListening(server);
    const target = normalizeTestTarget(server);
    expect(target.server).toBeUndefined();
    expect(target.baseUrl).toBe("http://127.0.0.1:0");
  });
});

// ============ utils.ts ============
