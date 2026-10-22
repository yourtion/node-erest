import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv-draft-04";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { buildOpenAPI } from "../lib/plugin/generate_openapi";
import lib from "./lib";

const ajv = new Ajv({ allErrors: true, strict: false });

function withResponse(response: z.ZodType) {
  const service = lib({ info: { host: "https://example.test", basePath: "/api", title: "API", version: "1.0.0" } });
  service.api
    .get("/result")
    .group("Index")
    .title("result")
    .registerTyped({ response }, () => {});
  const document = service.buildOpenAPI();
  const schema = document.paths["/result"].get.responses["200"].content!["application/json"].schema;
  const validate = ajv.compile({ ...schema, components: document.components });
  return { service, document, schema, validate };
}

describe("OpenAPI 3.0.3 公开入口与文档生成", () => {
  test("无 host 时使用相对 server，门面复用文档协调器", async () => {
    const service = lib({ info: {}, docs: { markdown: false } });
    const document = service.buildOpenAPI();
    const coordinator = service.api.docs;
    expect(document).toMatchObject({
      openapi: "3.0.3",
      info: { title: "API", version: "1.0.0" },
      servers: [{ url: "/" }],
      paths: {},
    });
    expect(service.buildOpenAPI()).toEqual(document);
    expect(service.api.docs).toBe(coordinator);
    await expect(SwaggerParser.validate(JSON.parse(JSON.stringify(document)))).resolves.toBeDefined();
  });

  test("OpenAPI 与 Swagger 可以同时写入独立文件", () => {
    const service = lib({ docs: { markdown: false, openapi: true, swagger: "legacy.json" } });
    service.buildOpenAPI();
    const files = new Map<string, string>();
    service.setDocWritter((path, content) => files.set(path, content));
    service.genDocs("/docs", false);
    expect(JSON.parse(files.get("/docs/openapi.json")!).openapi).toBe("3.0.3");
    expect(JSON.parse(files.get("/docs/legacy.json")!).swagger).toBe("2.0");
    expect(service.getDocsView().docsOptions.openapi).toBe(true);
  });

  test("Markdown 索引链接到指定的 OpenAPI 文件名", () => {
    const service = lib({ docs: { openapi: "schema-v3.json", markdown: true, wiki: false, index: true } });
    service.buildOpenAPI();
    const files = new Map<string, string>();
    service.setDocWritter((path, content) => files.set(path, content));
    service.genDocs("/docs", false);
    expect(files.get("/docs/index.md")).toContain("[schema-v3.json](./schema-v3.json)");
  });

  test("绑定服务器前，builder 声明的内联和命名响应都能生成 schema", () => {
    const service = lib();
    service.schema.register("Result", z.object({ id: z.number() }));
    service.api
      .get("/named")
      .group("Index")
      .title("named")
      .response("Result")
      .register(() => {});
    service.api
      .get("/inline")
      .group("Index")
      .title("inline")
      .response(z.array(z.number()))
      .register(() => {});
    const document = service.buildOpenAPI();
    const named = document.paths["/named"].get.responses["200"].content!["application/json"].schema;
    const inline = document.paths["/inline"].get.responses["200"].content!["application/json"].schema;
    expect(ajv.validate({ ...named, components: document.components }, { id: 7 })).toBe(true);
    expect(ajv.validate({ ...named, components: document.components }, { id: "bad" })).toBe(false);
    expect(ajv.validate({ ...inline, components: document.components }, [7])).toBe(true);
  });

  test("服务器前缀与路由分组前缀各出现一次，路径参数留在 parameters", async () => {
    const service = lib({
      info: { host: "https://example.test", basePath: "/api" },
      forceGroup: true,
      groups: { Admin: { name: "Admin", prefix: "/v1" } },
    });
    service
      .group("Admin")
      .get("/items/:itemId")
      .title("item")
      .registerTyped(
        {
          params: z.object({ itemId: z.string() }),
          headers: z.object({ "x-request-id": z.string().optional() }),
        },
        () => {}
      );
    const document = service.buildOpenAPI();
    expect(document.servers).toEqual([{ url: "https://example.test/api" }]);
    expect(Object.keys(document.paths)).toEqual(["/v1/items/{itemId}"]);
    expect(document.paths["/v1/items/{itemId}"].get.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "itemId", in: "path", required: true }),
        expect.objectContaining({ name: "x-request-id", in: "header", required: false }),
      ])
    );
    await expect(SwaggerParser.validate(JSON.parse(JSON.stringify(document)))).resolves.toBeDefined();
  });
});

describe("OpenAPI schema 与 Zod 接受相同的 JSON 值", () => {
  test("重叠 union 使用 anyOf，避免 oneOf 错误拒绝同时匹配的有效值", () => {
    const { validate } = withResponse(z.union([z.number(), z.number().positive()]));
    expect(validate(7)).toBe(true);
    expect(validate(-1)).toBe(true);
    expect(validate("7")).toBe(false);
  });

  test.each([
    ["nullable enum", z.enum(["ready", "done"]).nullable(), [null, "ready"], ["other", 7]],
    ["nullable union", z.union([z.string(), z.number()]).nullable(), [null, "ready", 7], [false, []]],
    [
      "nullable object/array",
      z.union([z.object({ n: z.number() }), z.array(z.number())]).nullable(),
      [null, { n: 7 }, [1]],
      [{ n: "x" }, true],
    ],
    ["mixed literal", z.union([z.literal(7), z.literal("x"), z.literal(null)]), [null, 7, "x"], [8, "other"]],
  ])("%s 保留所有合法分支，拒绝类型外的值", async (_name, schema, valid, invalid) => {
    const { document, validate } = withResponse(schema as z.ZodType);
    for (const value of valid as unknown[]) expect(validate(value)).toBe(true);
    for (const value of invalid as unknown[]) expect(validate(value)).toBe(false);
    await expect(SwaggerParser.validate(JSON.parse(JSON.stringify(document)))).resolves.toBeDefined();
  });

  test("exclusiveMinimum、数组长度、嵌套字段和枚举约束能独立校验", () => {
    const schema = z.object({
      score: z.number().gt(0).lte(10),
      tags: z
        .array(z.enum(["a", "b"]))
        .min(1)
        .max(2),
      nested: z.object({ name: z.string().min(2).max(5) }),
    });
    const { validate } = withResponse(schema);
    for (const value of [
      { score: 1, tags: ["a"], nested: { name: "ok" } },
      { score: 0, tags: ["a"], nested: { name: "ok" } },
      { score: 11, tags: ["a"], nested: { name: "ok" } },
      { score: 1, tags: [], nested: { name: "ok" } },
      { score: 1, tags: ["c"], nested: { name: "ok" } },
      { score: 1, tags: ["a"], nested: { name: "x" } },
    ])
      expect(validate(value)).toBe(schema.safeParse(value).success);
  });

  test("默认值与 transform 包装不丢失输入的可选性", () => {
    const service = lib();
    service.api
      .post("/defaults")
      .group("Index")
      .title("defaults")
      .registerTyped(
        {
          query: z.object({
            q: z
              .string()
              .default("x")
              .transform((value) => value.trim()),
          }),
          body: z.object({ count: z.number().default(0) }),
        },
        () => {}
      );
    const operation = service.buildOpenAPI().paths["/defaults"].post;
    expect(operation.parameters[0].required).toBe(false);
    expect(operation.requestBody?.required).toBe(false);
  });

  test("递归和重用 schema 的引用指向 components，能够验证真实递归值", async () => {
    type Node = { value: number; children?: Node[] };
    const node: z.ZodType<Node> = z.lazy(() => z.object({ value: z.number(), children: z.array(node).optional() }));
    const { document, validate } = withResponse(z.object({ root: node, alternate: node }));
    const tree = { value: 1, children: [{ value: 2 }] };
    expect(validate({ root: tree, alternate: tree })).toBe(true);
    expect(validate({ root: { value: "bad" }, alternate: tree })).toBe(false);
    const serialized = JSON.stringify(document);
    expect(serialized).not.toContain('"$ref":"#"');
    expect(serialized).not.toContain('"definitions":');
    await expect(SwaggerParser.validate(JSON.parse(serialized))).resolves.toBeDefined();
  });

  test("类型注册表和 schema 注册表都能生成标准组件", () => {
    const { service } = withResponse(z.string());
    service.type.register("Choice", z.union([z.string(), z.number()]));
    service.schema.register("Records", z.array(z.object({ id: z.number() })));
    const document = service.buildOpenAPI();
    expect(document.components.schemas.Choice.anyOf).toEqual([{ type: "string" }, { type: "number" }]);
    expect(document.components.schemas.Records).toMatchObject({
      type: "array",
      items: { type: "object", required: ["id"] },
    });
    expect(buildOpenAPI(service.api.docs!.buildDocData())).toEqual(document);
  });
});
