/**
 * @file 文档插件回归测试
 * @author Yourtion Guo <yourtion@gmail.com>
 *
 * 验证各文档生成插件解析到正确的输出文件名（避免互相覆盖）。
 * 回归：generate_postman 此前误用 options.swagger 作为文件名，导致 postman.json
 * 内容被写入 swagger.json（与 swagger 插件冲突、互相覆盖）。
 */
import { describe, expect, test } from "vitest";
import { z } from "zod";
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
