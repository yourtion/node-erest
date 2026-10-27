/**
 * @file 文档插件回归测试
 * @author Yourtion Guo <yourtion@gmail.com>
 *
 * 验证各文档生成插件解析到正确的输出文件名（避免互相覆盖）。
 * 回归：generate_postman 此前误用 options.swagger 作为文件名，导致 postman.json
 * 内容被写入 swagger.json（与 swagger 插件冲突、互相覆盖）。
 */
import * as path from "node:path";
import Debug from "debug";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { plugin } from "../lib/debug";
import generateAxios from "../lib/plugin/generate_axios";
import generatePostman from "../lib/plugin/generate_postman";
import generateSwagger, { buildSwagger } from "../lib/plugin/generate_swagger";

/** 从写入回调里解析 postman 输出 JSON */
function capturePostman(api: Record<string, unknown>) {
  let captured = "";
  const writer = (_p: string, data: string) => (captured = data);
  generatePostman(
    {
      info: { title: "t", description: "d", host: "http://x", basePath: "" },
      group: { G: "G" },
      types: {},
      apis: { "get_/test": { method: "get", path: "/test", realPath: "/test", group: "G", title: "t", ...api } },
    } as any,
    "/out",
    { postman: "postman.json" } as any,
    writer
  );
  return JSON.parse(captured);
}

describe("文档插件文件名解析", () => {
  // 构造最小可用 docData（插件实际只读少量字段）
  const docData = {
    info: { title: "t", description: "d", host: "http://x", basePath: "" },
    group: {},
    apis: {},
    types: {},
  } as any;

  test("postman 插件应使用 options.postman 作为文件名（而非 options.swagger）", () => {
    const written: string[] = [];
    const writer = (p: string) => written.push(p);

    generatePostman(docData, "/out", { postman: "postman.json", swagger: "swagger.json" } as any, writer);
    expect(written).toHaveLength(1);
    expect(written[0]).toContain("postman.json");
    // 关键：不应写入 swagger.json（回归 bug 的表现）
    expect(written[0]).not.toContain("swagger.json");
  });

  test("swagger 插件应使用 options.swagger 作为文件名", () => {
    const written: string[] = [];
    const writer = (p: string) => written.push(p);

    generateSwagger(docData, "/out", { swagger: "swagger.json", postman: "postman.json" } as any, writer);
    expect(written).toHaveLength(1);
    expect(written[0]).toContain("swagger.json");
  });

  test("axios 插件应使用 options.axios 作为文件名", () => {
    const written: string[] = [];
    const writer = (p: string) => written.push(p);

    generateAxios(docData, "/out", { axios: "sdk.js" } as any, writer);
    expect(written).toHaveLength(1);
    expect(written[0]).toContain("sdk.js");
  });

  test("postman 默认文件名为 postman.json（未指定时）", () => {
    const written: string[] = [];
    const writer = (p: string) => written.push(p);

    generatePostman(docData, "/out", { postman: true } as any, writer);
    expect(written[0]).toContain("postman.json");
  });
});

describe("swagger response schema（issue #6）", () => {
  const baseInfo = { title: "t", description: "d", host: "http://x", basePath: "" };
  const realPath = "/test";

  function buildWithApi(api: Record<string, unknown>) {
    const data = {
      info: baseInfo,
      group: { G: "G" },
      types: {},
      apis: { "get_/test": { method: "get", path: "/test", realPath, group: "G", title: "t", ...api } },
    } as any;
    return buildSwagger(data);
  }

  test("有 responseSchema 时，responses.200 应包含 schema（含字段与 required）", () => {
    const result = buildWithApi({
      responseSchema: z.object({ id: z.number(), name: z.string(), age: z.number().optional() }),
    });
    const op = (result.paths as any)[realPath].get;
    expect(op.responses[200].description).toBe("请求成功");
    const schema = op.responses[200].schema;
    expect(schema.type).toBe("object");
    // required 字段应包含非 optional 的字段
    expect(schema.required).toEqual(expect.arrayContaining(["id", "name"]));
    expect(schema.required).not.toContain("age");
    // 属性存在
    expect(Object.keys(schema.properties).toSorted()).toEqual(["age", "id", "name"]);
    expect(schema.properties.id.type).toBe("number");
    expect(schema.properties.name.type).toBe("string");
  });

  test("无 responseSchema 时，responses.200 保持原有占位（仅 description）", () => {
    const result = buildWithApi({});
    const op = (result.paths as any)[realPath].get;
    expect(op.responses[200].description).toBe("请求成功");
    // 未定义 response 时不应输出 schema 字段
    expect(op.responses[200].schema).toBeUndefined();
  });

  test("responseSchema 为 enum 时应输出 enum 取值", () => {
    const result = buildWithApi({
      responseSchema: z.object({ status: z.enum(["ok", "fail"]) }),
    });
    const op = (result.paths as any)[realPath].get;
    expect(op.responses[200].schema.properties.status.enum).toEqual(["ok", "fail"]);
  });
});

describe("postman response 示例（issue #6）", () => {
  test("有 responseSchema 时，item 应带 response 示例（含字段名 key）", () => {
    const postman = capturePostman({
      responseSchema: z.object({ id: z.number(), name: z.string() }),
    });
    const item = postman.item[0].item[0];
    expect(item.response).toBeDefined();
    expect(item.response).toHaveLength(1);
    // response body 应是 JSON，包含 schema 的字段名
    const body = JSON.parse(item.response[0].body);
    expect(Object.keys(body).toSorted()).toEqual(["id", "name"]);
  });

  test("无 responseSchema 时，item 不带 response 字段", () => {
    const postman = capturePostman({});
    const item = postman.item[0].item[0];
    expect(item.response).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 以下为内容级精确断言测试（原 test-mutation-swagger-postman.ts 迁入）：
// 通过 crafted docData 直接驱动 buildSwagger / generatePostman，断言生成的完整结构。
const BASE_INFO = { title: "测试标题", description: "测试描述", host: "http://x", basePath: "" };

/** 构造最小 docData（插件实际只读少量字段，直接构造可精确控制输入） */
function makeDocData(over: Record<string, unknown> = {}): any {
  return {
    info: { ...BASE_INFO },
    group: {},
    apis: {},
    types: {},
    ...over,
  };
}

/** 构造单个 API 条目 */
function makeApi(api: Record<string, unknown>): any {
  return { method: "get", path: "/t", realPath: "/t", group: "G", title: "t", ...api };
}

/** 捕获 writer 输出 */
function capture(): { writer: any; out: Array<{ path: string; data: string }> } {
  const out: Array<{ path: string; data: string }> = [];
  const writer = (p: string, data: string) => out.push({ path: p, data });
  return { writer, out };
}

/** 直接生成 postman collection JSON */
function genPostman(data: any, options: any = { postman: "postman.json" }): any {
  const { writer, out } = capture();
  generatePostman(data, "/out", options, writer);
  expect(out).toHaveLength(1);
  return JSON.parse(out[0].data);
}

describe("swagger definitions：仅提供 tsType 的兼容输入", () => {
  const data = makeDocData({
    info: { title: "t", description: "d", host: "http://x", basePath: "" },
    types: {
      StrArr: { tsType: "string[]" },
      Num: { tsType: "number" },
      Bool: { tsType: "boolean" },
      DateArr: { tsType: "Date[]" },
      Obj: { tsType: "object" },
      Unk: { tsType: "unknown" },
      UnkArr: { tsType: "unknown[]" },
      NoTsType: {},
      WithDesc: { tsType: "string", description: "自定义说明" },
    } as any,
  });
  const result = buildSwagger(data);

  test("数组保留元素类型，未知类型不伪装成字符串", () => {
    expect(result.definitions.StrArr).toEqual({ type: "array", items: { type: "string" } });
    expect(result.definitions.Num.type).toBe("number");
    expect(result.definitions.Bool.type).toBe("boolean");
    expect(result.definitions.DateArr).toEqual({ type: "array", items: { type: "string", format: "date-time" } });
    expect(result.definitions.Obj.type).toBe("object");
    expect(result.definitions.Unk).toEqual({});
    expect(result.definitions.UnkArr.type).toBe("array");
  });

  test("definitions 完整键集合", () => {
    expect(Object.keys(result.definitions)).toEqual([
      "StrArr",
      "Num",
      "Bool",
      "DateArr",
      "Obj",
      "Unk",
      "UnkArr",
      "NoTsType",
      "WithDesc",
    ]);
  });

  test("带 description 的类型应输出 description 字段", () => {
    expect(result.definitions.WithDesc).toStrictEqual({
      type: "string",
      description: "自定义说明",
    });
  });

  test("无 description 的类型不应有 description 键", () => {
    expect(result.definitions.NoTsType).toStrictEqual({});
    expect(result.definitions.Unk).toStrictEqual({});
  });

  test("types 为 undefined 时不生成 definitions 且不抛错", () => {
    const r = buildSwagger(makeDocData({ types: undefined as any }));
    expect(r.definitions).toEqual({});
  });
});

describe("swagger definitions：通过受控管理器读取原始 schema", () => {
  test("注册 schema 的数组、嵌套对象与 union 保留结构", () => {
    const schema = z.object({
      values: z.array(z.number()),
      nested: z.object({ active: z.boolean() }),
      selection: z.union([z.string(), z.number()]),
      optional: z.string().optional(),
      nullable: z.number().nullable(),
    });
    const r = buildSwagger(
      makeDocData({
        types: { Entity: { tsType: "object" } },
        schema: { get: (name: string) => (name === "Entity" ? schema : undefined) },
      })
    );
    expect(r.definitions.Entity).toEqual({
      type: "object",
      properties: {
        values: { type: "array", items: { type: "number" } },
        nested: { type: "object", properties: { active: { type: "boolean" } }, required: ["active"] },
        selection: { "x-anyOf": [{ type: "string" }, { type: "number" }] },
        optional: { type: "string" },
        nullable: { type: "number", "x-nullable": true },
      },
      required: ["values", "nested", "selection", "nullable"],
    });
  });

  test("注册类型使用原始 schema，不通过 tsType 字符串猜测 union", () => {
    const r = buildSwagger(
      makeDocData({
        types: { Choice: { tsType: "string | number" } },
        typeManager: { get: () => z.union([z.string(), z.number()]) },
      })
    );
    expect(r.definitions.Choice).toEqual({ "x-anyOf": [{ type: "string" }, { type: "number" }] });
  });

  test("不读取文档数据中任意 Map 或实例的私有注册表", () => {
    const r = buildSwagger(
      makeDocData({
        erest: { schemaRegistry: new Map([["Private", z.object({})]]) },
        schema: { reg: new Map([["Private", z.object({})]]) },
      })
    );
    expect(r.definitions).toEqual({});
  });
});

describe("swagger responses.200（response200）", () => {
  function buildWithApi(api: Record<string, unknown>) {
    return buildSwagger(
      makeDocData({
        group: { G: "G" },
        apis: { "get_/resp": makeApi({ realPath: "/resp", ...api }) },
      })
    );
  }
  const realPath = "/resp";

  test("含必填/可选/enum/array/date 字段的完整 response schema", () => {
    const r = buildWithApi({
      responseSchema: z.object({
        id: z.number(),
        name: z.string().describe("名字"),
        age: z.number().optional(),
        tag: z.enum(["a", "b"]),
        list: z.array(z.string()),
        when: z.date(),
      }),
    });
    expect((r.paths as any)[realPath].get.responses).toEqual({
      200: {
        description: "请求成功",
        schema: {
          type: "object",
          properties: {
            id: { type: "number" },
            name: { type: "string", description: "名字" },
            age: { type: "number" },
            tag: { type: "string", enum: ["a", "b"] },
            list: { type: "array", items: { type: "string" } },
            when: { type: "string", format: "date-time" },
          },
          required: ["id", "name", "tag", "list", "when"],
        },
      },
    });
  });

  test("全可选字段时 schema 不含 required 键", () => {
    const r = buildWithApi({ responseSchema: z.object({ a: z.string().optional() }) });
    expect((r.paths as any)[realPath].get.responses[200]).toStrictEqual({
      description: "请求成功",
      schema: { type: "object", properties: { a: { type: "string" } } },
    });
  });

  test("无 responseSchema 时仅 description", () => {
    const r = buildWithApi({});
    expect((r.paths as any)[realPath].get.responses).toEqual({ 200: { description: "请求成功" } });
  });

  test("顶层数组和 union 响应不再丢失 schema", () => {
    const array = buildWithApi({ responseSchema: z.array(z.number()) });
    expect((array.paths as any)[realPath].get.responses[200].schema).toEqual({
      type: "array",
      items: { type: "number" },
    });
    const union = buildWithApi({ responseSchema: z.union([z.string(), z.number()]) });
    expect((union.paths as any)[realPath].get.responses[200].schema).toEqual({
      "x-anyOf": [{ type: "string" }, { type: "number" }],
    });
  });
});

describe("swagger buildSwagger 顶层（info/schemes/tags/definitions/paths）", () => {
  const data = makeDocData({
    info: {
      title: "服务",
      description: "说明",
      version: "2.1.0",
      host: "https://api.ex.com",
      basePath: "/v2",
    },
    group: { Beta: "贝塔", Alpha: "阿尔法" },
    apis: {},
  });

  test("顶层字段精确断言", () => {
    const r = buildSwagger(data);
    expect(r.swagger).toBe("2.0");
    expect(r.info).toEqual({ title: "服务", description: "说明", version: "2.1.0" });
    expect(r.basePath).toBe("/v2");
    expect(r.schemes).toEqual(["https"]);
    expect(r.definitions).toEqual({});
    expect(r.paths).toEqual({});
  });

  test("tags 按名称排序（多分组、部分有序初始序）", () => {
    const r = buildSwagger(
      makeDocData({
        info: { title: "t", description: "d", host: "http://x", basePath: "" },
        group: { Bravo: "B", Alpha: "A", Delta: "D", Charlie: "C", Echo: "E" },
      })
    );
    expect(r.tags).toEqual([
      { name: "Alpha", description: "A" },
      { name: "Bravo", description: "B" },
      { name: "Charlie", description: "C" },
      { name: "Delta", description: "D" },
      { name: "Echo", description: "E" },
    ]);
  });

  test("host 为空时 basePath 承载完整 URL", () => {
    const r = buildSwagger(
      makeDocData({
        info: { title: "t", description: "d", host: "", basePath: "https://fallback.example.com/v3" },
      })
    );
    expect(r.basePath).toBe("/v3");
    expect(r.schemes).toEqual(["https"]);
  });

  test("version 缺省时回退 1.0.0", () => {
    const r = buildSwagger(
      makeDocData({
        info: { title: "t", description: "d", host: "http://x", basePath: "" },
      })
    );
    expect(r.info.version).toBe("1.0.0");
  });

  test("host + basePath 组合解析 URL", () => {
    const r = buildSwagger(
      makeDocData({
        info: { title: "t", description: "d", host: "http://h:8080", basePath: "/api/v9" },
      })
    );
    expect(r.basePath).toBe("/api/v9");
    expect(r.schemes).toEqual(["http"]);
  });
});

describe("swagger paths 与参数提取", () => {
  const apis: Record<string, any> = {
    "get_/users/:userId": makeApi({
      method: "get",
      path: "/users/:userId",
      realPath: "/users/:userId",
      title: "查用户",
      description: "按 ID 查询用户",
      paramsSchema: z.object({ userId: z.string().describe("用户ID") }),
      querySchema: z.object({
        q: z.string().optional().describe("关键词"),
        full: z.string(),
        when: z.date().optional(),
        st: z.enum(["a", "b", "c"]),
        tags: z.array(z.string()),
      }),
      examples: [{ input: { q: "搜索" } }],
      responseSchema: z.object({ ok: z.boolean() }),
    }),
  };
  const r = buildSwagger(makeDocData({ group: { G: "G" }, apis }));

  test("路径参数占位符 :param 转 {param}", () => {
    expect(Object.keys(r.paths as any)).toEqual(["/users/{userId}"]);
  });

  test("多参数路径的占位符全部转换（/:a/:b → /{a}/{b}）", () => {
    const multi = buildSwagger(
      makeDocData({
        group: { G: "G" },
        apis: {
          "delete_/org/:oid/user/:uid": makeApi({
            method: "delete",
            path: "/org/:oid/user/:uid",
            realPath: "/org/:oid/user/:uid",
            title: "删成员",
          }),
        },
      })
    );
    expect(Object.keys(multi.paths as any)).toEqual(["/org/{oid}/user/{uid}"]);
  });

  test("GET 操作对象完整断言", () => {
    const op = (r.paths as any)["/users/{userId}"].get;
    expect(op.tags).toEqual(["G"]);
    expect(op.summary).toBe("查用户");
    expect(op.description).toBe("按 ID 查询用户");
    expect(op.consumes).toEqual(["application/json"]);
    expect(op.produces).toEqual(["application/json"]);
    expect(op.responses).toEqual({
      200: {
        description: "请求成功",
        schema: {
          type: "object",
          properties: { ok: { type: "boolean" } },
          required: ["ok"],
        },
      },
    });
  });

  test("params 字段：in=path、required=true、带注释", () => {
    const op = (r.paths as any)["/users/{userId}"].get;
    expect(op.parameters).toHaveLength(6);
    expect(op.parameters[0]).toStrictEqual({
      name: "userId",
      in: "path",
      description: "用户ID",
      required: true,
      type: "string",
    });
  });

  test("query 字段：required/可选/enum/array/date-format", () => {
    const op = (r.paths as any)["/users/{userId}"].get;
    expect(op.parameters[1]).toStrictEqual({
      name: "q",
      in: "query",
      description: "关键词",
      required: false,
      type: "string",
    });
    expect(op.parameters[2]).toStrictEqual({
      name: "full",
      in: "query",
      description: "",
      required: true,
      type: "string",
    });
    expect(op.parameters[3]).toStrictEqual({
      name: "when",
      in: "query",
      description: "",
      required: false,
      type: "string",
      format: "date-time",
    });
    expect(op.parameters[4]).toStrictEqual({
      name: "st",
      in: "query",
      description: "",
      required: true,
      type: "string",
      enum: ["a", "b", "c"],
    });
    expect(op.parameters[5]).toStrictEqual({
      name: "tags",
      in: "query",
      description: "",
      required: true,
      type: "array",
      items: { type: "string" },
      collectionFormat: "multi",
    });
  });

  test("无 description 的 API 回退空字符串", () => {
    const rr = buildSwagger(
      makeDocData({
        group: { G: "G" },
        apis: { "get_/plain": makeApi({ realPath: "/plain" }) },
      })
    );
    const op = (rr.paths as any)["/plain"].get;
    expect(op.description).toBe("");
    expect(op.tags).toEqual(["G"]);
    expect(op.consumes).toEqual(["application/json"]);
    expect(op.produces).toEqual(["application/json"]);
  });

  test("同一路径多个方法共存（get + post）", () => {
    const rr = buildSwagger(
      makeDocData({
        group: { G: "G" },
        apis: {
          "get_/things": makeApi({ method: "get", realPath: "/things", title: "列表" }),
          "post_/things": makeApi({ method: "post", realPath: "/things", title: "新建" }),
        },
      })
    );
    const p = (rr.paths as any)["/things"];
    expect(Object.keys(p)).toEqual(["get", "post"]);
    expect(p.get.summary).toBe("列表");
    expect(p.post.summary).toBe("新建");
  });

  test("GET 带 bodySchema 时不生成 in:body 聚合参数", () => {
    const rr = buildSwagger(
      makeDocData({
        group: { G: "G" },
        apis: {
          "get_/search": makeApi({
            method: "get",
            realPath: "/search",
            bodySchema: z.object({ kw: z.string() }),
          }),
        },
      })
    );
    expect((rr.paths as any)["/search"].get.parameters).toEqual([]);
  });

  test("POST 无 bodySchema 时无 in:body 聚合参数", () => {
    const rr = buildSwagger(
      makeDocData({
        group: { G: "G" },
        apis: { "post_/ping": makeApi({ method: "post", realPath: "/ping" }) },
      })
    );
    expect((rr.paths as any)["/ping"].post.parameters).toEqual([]);
  });
});

describe("swagger examples 选择与 POST 请求体聚合", () => {
  function postOp(apis: Record<string, any>) {
    const rr = buildSwagger(makeDocData({ group: { G: "G" }, apis }));
    return (rr.paths as any)["/form"].post;
  }

  test("单个 example：body 字段带 example 值", () => {
    const op = postOp({
      "post_/form": makeApi({
        method: "post",
        realPath: "/form",
        bodySchema: z.object({ name: z.string().describe("名字"), age: z.number().optional() }),
        examples: [{ input: { name: "小明", age: 18 }, output: { success: true } }],
      }),
    });
    expect(op.parameters).toEqual([
      {
        in: "body",
        name: "body",
        description: "请求体",
        required: true,
        schema: {
          type: "object",
          properties: {
            name: { description: "名字", type: "string", example: "小明" },
            age: { type: "number", example: 18 },
          },
          required: ["name"],
        },
      },
    ]);
  });

  test("多个 example：优先选 output.success 的那个", () => {
    const op = postOp({
      "post_/form": makeApi({
        method: "post",
        realPath: "/form",
        bodySchema: z.object({ name: z.string() }),
        examples: [{ input: { name: "失败例" } }, { input: { name: "成功例" }, output: { success: true } }],
      }),
    });
    expect(op.parameters[0].schema.properties.name.example).toBe("成功例");
  });

  test("example 无 input 时不抛错、example 值缺省", () => {
    const op = postOp({
      "post_/form": makeApi({
        method: "post",
        realPath: "/form",
        bodySchema: z.object({ n: z.string() }),
        examples: [{ output: {} }],
      }),
    });
    expect(op.parameters[0].schema.properties.n).toEqual({ type: "string" });
  });
});

describe("swagger 落盘输出（generateSwagger 包装）", () => {
  test("使用 options.swagger 作为文件名并以两空格缩进序列化", () => {
    const { writer, out } = capture();
    generateSwagger(makeDocData(), "/out", { swagger: "custom-sw.json" } as any, writer);
    expect(out).toHaveLength(1);
    expect(out[0].path).toBe("/out/custom-sw.json");
    expect(out[0].data.startsWith('{\n  "swagger": "2.0"')).toBe(true);
    // 内容可解析回完整结构
    const parsed = JSON.parse(out[0].data);
    expect(parsed.swagger).toBe("2.0");
    expect(parsed.info.title).toBe("测试标题");
  });

  test("options.swagger 为 true 时使用默认文件名 swagger.json", () => {
    const { writer, out } = capture();
    generateSwagger(makeDocData(), "/out", { swagger: true } as any, writer);
    expect(out).toHaveLength(1);
    expect(out[0].path).toBe("/out/swagger.json");
  });
});

describe("postman 顶层 collection 结构", () => {
  test("空 apis 时顶层字段精确断言", () => {
    const pm = genPostman(
      makeDocData({
        info: { title: "标题", description: "描述", host: "http://h:1", basePath: "/api" },
      })
    );
    expect(pm).toEqual({
      variables: [{ enabled: true, key: "HOST", value: "http://h:1/api", type: "text" }],
      info: {
        name: "标题",
        _postman_id: "",
        description: "描述",
        schema: "https://schema.getpostman.com/json/collection/v2.0.0/collection.json",
      },
      item: [],
    });
  });

  test("host 缺省时 HOST 变量仅含 basePath", () => {
    const pm = genPostman(makeDocData({ info: { title: "t", description: "d", host: "", basePath: "/api" } }));
    expect(pm.variables[0]).toEqual({ enabled: true, key: "HOST", value: "/api", type: "text" });
  });
});

describe("postman 分组文件夹", () => {
  test("声明的分组用描述名，未声明的分组自动创建并合并", () => {
    const pm = genPostman(
      makeDocData({
        group: { G: "G组" },
        apis: {
          "get_/a": makeApi({ realPath: "/a", group: "G", title: "A" }),
          "get_/h1": makeApi({ realPath: "/h1", group: "H", title: "H1" }),
          "get_/h2": makeApi({ realPath: "/h2", group: "H", title: "H2" }),
        },
      })
    );
    expect(pm.item).toHaveLength(2);
    expect(pm.item[0].name).toBe("G组");
    expect(pm.item[0].item).toHaveLength(1);
    expect(pm.item[0].item[0].name).toBe("A");
    // 未声明的 H 分组：单个文件夹聚合两个条目
    expect(pm.item[1].name).toBe("H");
    expect(pm.item[1].item).toHaveLength(2);
    expect(pm.item[1].item.map((i: any) => i.name)).toEqual(["H1", "H2"]);
  });
});

describe("postman 请求项与 urlencoded body", () => {
  const pm = genPostman(
    makeDocData({
      group: { G: "G" },
      apis: {
        "get_/users/:id": makeApi({ realPath: "/users/:id", title: "查用户" }),
        "post_/form": makeApi({
          method: "post",
          realPath: "/form",
          title: "表单",
          bodySchema: z.object({ name: z.string(), age: z.number() }),
        }),
        "put_/form2": makeApi({
          method: "put",
          realPath: "/form2",
          title: "更新",
          bodySchema: z.object({ x: z.string() }),
        }),
        "post_/noform": makeApi({ method: "post", realPath: "/noform", title: "无体" }),
      },
    })
  );
  const folders: Record<string, any> = {};
  for (const f of pm.item) folders[f.name] = f;

  test("GET 请求项：url/method/header", () => {
    const getItem = (folder: string, name: string) => folders[folder].item.find((i: any) => i.name === name);
    const get = getItem("G", "查用户");
    expect(get).toEqual({
      name: "查用户",
      request: {
        url: "{{HOST}}/users/:id",
        method: "GET",
        header: [{ key: "Content-Type", value: "application/json" }],
      },
    });
  });

  test("POST：从 bodySchema 提取 urlencoded 字段", () => {
    const post = folders["G"].item.find((i: any) => i.name === "表单");
    expect(post.request.body).toEqual({
      mode: "urlencoded",
      urlencoded: [
        { key: "name", description: "" },
        { key: "age", description: "" },
      ],
    });
  });

  test("PUT 同样生成 urlencoded body", () => {
    const put = folders["G"].item.find((i: any) => i.name === "更新");
    expect(put.request.method).toBe("PUT");
    expect(put.request.body).toEqual({
      mode: "urlencoded",
      urlencoded: [{ key: "x", description: "" }],
    });
  });

  test("POST 无 bodySchema 时 body 为空 urlencoded 且不抛错", () => {
    const noform = folders["G"].item.find((i: any) => i.name === "无体");
    expect(noform.request.body).toEqual({ mode: "urlencoded", urlencoded: [] });
  });

  test("GET 不带 body 字段", () => {
    const get = folders["G"].item.find((i: any) => i.name === "查用户");
    expect(get.request.body).toBeUndefined();
  });
});

describe("postman response 示例（sampleValue 类型映射）", () => {
  test("各类型字段生成对应占位值", () => {
    const pm = genPostman(
      makeDocData({
        group: { G: "G" },
        apis: {
          "get_/resp": makeApi({
            realPath: "/resp",
            responseSchema: z.object({
              id: z.number(),
              on: z.boolean(),
              tags: z.array(z.string()),
              meta: z.object({}),
              when: z.date(),
              st: z.enum(["a", "b"]),
              none: z.enum([]) as any,
              name: z.string(),
            }),
          }),
        },
      })
    );
    const item = pm.item[0].item[0];
    expect(item.response).toEqual([
      {
        name: "成功",
        status: "OK",
        code: 200,
        body: JSON.stringify(
          {
            id: 0,
            on: false,
            tags: [],
            meta: {},
            when: "2024-01-01T00:00:00Z",
            st: "a",
            none: "",
            name: "",
          },
          null,
          2
        ),
      },
    ]);
  });

  test("无 responseSchema 时无 response 字段", () => {
    const pm = genPostman(makeDocData({ group: { G: "G" }, apis: { "get_/x": makeApi({ realPath: "/x" }) } }));
    expect(pm.item[0].item[0].response).toBeUndefined();
  });
});

describe("postman 落盘文件名与格式", () => {
  test("使用 options.postman 作为文件名并以两空格缩进序列化", () => {
    const { writer, out } = capture();
    generatePostman(makeDocData(), "/out", { postman: "custom-pm.json" } as any, writer);
    expect(out).toHaveLength(1);
    expect(out[0].path).toBe("/out/custom-pm.json");
    expect(out[0].data.startsWith('{\n  "variables"')).toBe(true);
  });

  test("options.postman 为 true 时使用默认文件名 postman.json", () => {
    const { writer, out } = capture();
    generatePostman(makeDocData(), "/out", { postman: true } as any, writer);
    expect(out).toHaveLength(1);
    expect(out[0].path).toBe("/out/postman.json");
  });
});

/** 捕获 generateAxios 写入的文件名与内容 */
function captureAxios(
  apis: Record<string, unknown>,
  info: { host: string; basePath: string } = { host: "http://h", basePath: "/b" },
  options: Record<string, unknown> = { axios: "sdk.js" }
) {
  let file = "";
  let content = "";
  const writer = (p: string, data: string) => {
    file = p;
    content = data;
  };
  generateAxios(
    { info: { title: "T", ...info }, genTime: "GT", group: { G: "G" }, types: {}, apis } as any,
    "/out",
    options as any,
    writer
  );
  return { file, content };
}

/** 临时开启 debug 命名空间并捕获输出（结束后恢复） */
function captureDebugLogs(namespace: string, logger: Debug.Debugger, run: () => void): string[] {
  const lines: string[] = [];
  const originalLog = (logger as unknown as { log: unknown }).log;
  Debug.enable(namespace);
  (logger as unknown as { log: (fmt: unknown, ...args: unknown[]) => void }).log = (...args: unknown[]) => {
    lines.push(args.map((a) => String(a)).join(" "));
  };
  try {
    run();
  } finally {
    (logger as unknown as { log: unknown }).log = originalLog;
    Debug.disable();
  }
  return lines;
}

describe("generateAxios 生成 SDK 内容", () => {
  /** 覆盖：多方法（get/post/put/patch/delete）、query/body/params、多级路径、URL 参数、无 schema API */
  const apis = {
    "get_/user/list": {
      method: "get",
      path: "/user/list",
      realPath: "/user/list",
      title: "用户列表",
      group: "G",
      querySchema: z.object({ page: z.number(), size: z.number() }),
    },
    "post_/user/:id": {
      method: "post",
      path: "/user/:id",
      realPath: "/user/:id",
      title: "创建用户",
      group: "G",
      paramsSchema: z.object({ id: z.string() }),
      bodySchema: z.object({ name: z.string(), age: z.number() }),
    },
    "put_/order/:oid": {
      method: "put",
      path: "/order/:oid",
      realPath: "/order/:oid",
      title: "更新订单",
      group: "G",
      paramsSchema: z.object({ oid: z.string() }),
      bodySchema: z.object({ sku: z.string(), num: z.number() }),
    },
    "patch_/user/:id/name": {
      method: "patch",
      path: "/user/:id/name",
      realPath: "/user/:id/name",
      title: "改名",
      group: "G",
      bodySchema: z.object({ name: z.string() }),
    },
    "delete_/health": {
      method: "delete",
      path: "/health",
      realPath: "/health",
      title: "健康检查",
      group: "G",
    },
  };

  test("生成的 SDK 全文与期望精确一致", () => {
    const { file, content } = captureAxios(apis);
    expect(file).toBe(path.resolve("/out", "sdk.js"));
    const expected = [
      "",
      "    // T GT",
      "    import axios from 'axios';",
      '    const BASE = "http://h/b";',
      "",
      "    const api = {",
      "      instance: axios.create({",
      "        baseURL: BASE,",
      "        paramsSerializer: { indexes: null },",
      "      }),",
      "      ",
      "    // 用户列表",
      "    getUserList(",
      "      ",
      "      { page, size } = {}) {",
      "      return this.instance.get(",
      "        '/user/list'",
      "        , {",
      "        params: { page, size }",
      "      })",
      "    },",
      "",
      "    // 创建用户",
      "    postUserId(",
      "      id,",
      "      { name, age } = {}) {",
      "      return this.instance.post(",
      "        `/user/${id}`",
      "        , { name, age })",
      "    },",
      "",
      "    // 更新订单",
      "    putOrderOid(",
      "      oid,",
      "      { sku, num } = {}) {",
      "      return this.instance.put(",
      "        `/order/${oid}`",
      "        , { sku, num })",
      "    },",
      "",
      "    // 改名",
      "    patchUserIdName(",
      "      id,",
      "      { name } = {}) {",
      "      return this.instance.patch(",
      "        `/user/${id}/name`",
      "        , { name })",
      "    },",
      "",
      "    // 健康检查",
      "    deleteHealth(",
      "      ",
      "      ) {",
      "      return this.instance.delete(",
      "        '/health'",
      "        )",
      "    }",
      "    };",
      "",
      "    export default api;",
      "  ",
    ].join("\n");
    expect(content).toBe(expected);
  });

  test("关键片段：方法名 / URL / this.instance 调用 / import / BASE / export", () => {
    const { content } = captureAxios(apis);
    // 方法名：斜杠转驼峰（getUserList）、路径参数去冒号（postUserId）
    expect(content).toContain("getUserList(");
    expect(content).toContain("postUserId(");
    expect(content).toContain("putOrderOid(");
    expect(content).toContain("patchUserIdName(");
    expect(content).toContain("deleteHealth(");
    // this.instance.<method> 调用
    expect(content).toContain("return this.instance.get(");
    expect(content).toContain("return this.instance.post(");
    expect(content).toContain("return this.instance.put(");
    expect(content).toContain("return this.instance.patch(");
    expect(content).toContain("return this.instance.delete(");
    // 无 URL 参数的路径用单引号，含 :param 的用模板字符串
    expect(content).toContain("        '/user/list'");
    expect(content).toContain("        '/health'");
    expect(content).toContain("        `/user/${id}`");
    // 头尾结构
    expect(content).toContain("    import axios from 'axios';");
    expect(content).toContain('    const BASE = "http://h/b";');
    expect(content).toContain("    export default api;");
  });

  test("host 为空时 BASE 仅保留 basePath", () => {
    const { content } = captureAxios(
      { "get_/ping": { method: "get", path: "/ping", realPath: "/ping", title: "Ping", group: "G" } },
      { host: "", basePath: "/api" }
    );
    expect(content).toContain('    const BASE = "/api";');
    expect(content).toContain("getPing(");
  });

  test("options.axios 非 string 时默认文件名 jssdk.js", () => {
    const { file } = captureAxios(apis, undefined, { axios: true });
    expect(file).toBe(path.resolve("/out", "jssdk.js"));
  });

  test("schema 为真值但无 _def 时安全退化为无参数（不抛错）", () => {
    const fake = {
      "get_/probe": { method: "get", path: "/probe", realPath: "/probe", title: "P", group: "G", querySchema: {} },
    };
    let content = "";
    expect(() => {
      content = captureAxios(fake).content;
    }).not.toThrow();
    expect(content).toContain("getProbe(\n      \n      ) {");
    expect(content).toContain("        '/probe'");
  });

  test("路径中冒号后跟数字（如时间 9:30）不算 URL 参数，按字面量输出", () => {
    const { content } = captureAxios({
      "get_/schedule/9:30": {
        method: "get",
        path: "/schedule/9:30",
        realPath: "/schedule/9:30",
        title: "时间",
        group: "G",
      },
    });
    expect(content).toContain("getSchedule/9:30(");
    expect(content).toContain("        '/schedule/9:30'");
    expect(content).not.toContain("`/schedule/9:30`");
  });

  test("debug 输出包含 generateAxios 前缀", () => {
    const logs = captureDebugLogs("erest:plugin", plugin, () => {
      captureAxios({ "get_/ping": { method: "get", path: "/ping", realPath: "/ping", title: "Ping", group: "G" } });
    });
    expect(logs.join("\n")).toContain("generateAxios:");
  });
});
