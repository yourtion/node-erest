/** 同一套 schema 经真实 HTTP、生成的 Axios SDK、OpenAPI 3 和 Swagger 2 的合约回归。 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import SwaggerParser from "@apidevtools/swagger-parser";
import type { AxiosInstance, AxiosResponse } from "axios";
import Ajv from "ajv-draft-04";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { z } from "zod";
import IAPIDoc from "../lib/extend/docs";
import apiDocs from "../lib/plugin/generate_markdown/apis";
import { buildSwagger } from "../lib/plugin/generate_swagger";
import type { OpenAPIOperation } from "../lib/plugin/generate_openapi";
import type { Context } from "../lib/adapters/types";
import lib from "./lib";
import { frameworks } from "./frameworks.js";

const methods = ["get", "post", "put", "patch", "delete"] as const;
const inputSchema = z.object({
  label: z.string().min(1).max(50).describe("标签"),
  values: z.array(z.coerce.number().min(0).max(100)).min(1),
  selection: z.union([z.string(), z.number()]),
  note: z.string().nullable().optional(),
});
const responseSchema = z.object({
  method: z.enum(methods),
  id: z.string(),
  data: inputSchema,
  trace: z.string().optional(),
});
const optionalSchema = z.object({ count: z.coerce.number().default(0), note: z.string().optional() });
type GeneratedSDK = { instance: AxiosInstance } & Record<
  `${(typeof methods)[number]}ContractId`,
  (id: string, data?: Partial<z.input<typeof inputSchema>>, query?: { trace: string }) => Promise<AxiosResponse>
> &
  Record<`${(typeof methods)[number]}ContractOptionalInput`, (input?: object) => Promise<AxiosResponse>> &
  Record<`${(typeof methods)[number]}ContractBadResponse`, () => Promise<AxiosResponse>>;

describe.each(frameworks)("合约一致性：$name", (framework) => {
  let lastRequest: Context;
  const service = lib({
    info: { host: "http://127.0.0.1", basePath: "", title: "Contract" },
    docs: { markdown: false, openapi: "contract-openapi.json", swagger: true, axios: true },
    hooks: {
      onRequest: (ctx: Context) => {
        lastRequest = ctx;
      },
    },
  });
  service.schema.register("ContractInput", inputSchema);
  service.setResponseEnvelopers({
    success: (data) => data,
    error: (error) => ({ body: { message: (error as Error).message }, status: 400 }),
  });
  for (const method of methods) {
    const queryInput = method === "get" || method === "delete";
    service.api[method]("/contract/:id")
      .group("Index")
      .title(method)
      .registerTyped(
        {
          params: z.object({ id: z.string() }),
          ...(queryInput
            ? { query: inputSchema }
            : { body: inputSchema, query: z.object({ trace: z.string().optional() }) }),
          response: responseSchema,
        },
        (req) => ({ method, id: req.params.id, data: queryInput ? req.query : req.body, trace: req.query.trace })
      );
    service.api[method]("/contract/optional/input")
      .group("Index")
      .title(`${method} optional`)
      .registerTyped(
        { ...(queryInput ? { query: optionalSchema } : { body: optionalSchema }), response: optionalSchema },
        (req) => (queryInput ? req.query : req.body)
      );
    service.api[method]("/contract/bad/response")
      .group("Index")
      .title(`${method} bad response`)
      .registerTyped({ response: z.object({ result: z.number() }) }, () => ({ result: "bad" }) as never);
  }
  const server = framework.server(service, false);
  const docs = new IAPIDoc(service).buildDocData();
  const swagger = buildSwagger(docs);
  let sdk: GeneratedSDK;
  let openapi: ReturnType<typeof service.buildOpenAPI>;
  const ajv = new Ajv({ allErrors: true, strict: false });
  const queryAjv = new Ajv({ allErrors: true, strict: false, coerceTypes: true });

  function requestMatches(operation: OpenAPIOperation): boolean {
    if (
      operation.requestBody &&
      !ajv.validate(operation.requestBody.content["application/json"].schema, lastRequest.body)
    )
      return false;
    return operation.parameters.every((parameter) => {
      const source =
        parameter.in === "path"
          ? lastRequest.params
          : parameter.in === "query"
            ? lastRequest.query
            : lastRequest.headers;
      const value = source[parameter.name];
      const data = value === undefined ? {} : JSON.parse(JSON.stringify({ value }));
      return queryAjv.validate(
        {
          type: "object",
          properties: { value: parameter.schema },
          ...(parameter.required ? { required: ["value"] } : {}),
        },
        data
      );
    });
  }

  function assertExchange(method: string, response: AxiosResponse, route = "/contract/{id}") {
    const operation = openapi.paths[route][method];
    expect(requestMatches(operation)).toBe(true);
    const valid = ajv.validate(operation.responses["200"].content!["application/json"].schema, response.data);
    expect(ajv.errors).toBeNull();
    expect(valid).toBe(true);
  }

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };
    const files = new Map<string, string>();
    // 使用公开入口经过协调器生成两个文档和 SDK，读取实际生成的文件内容。
    service.buildOpenAPI();
    service.setDocWritter((file, content) => files.set(file, content));
    service.genDocs("/out", false);
    expect([...files.keys()].toSorted()).toEqual(["/out/contract-openapi.json", "/out/jssdk.js", "/out/swagger.json"]);
    const document = JSON.parse(files.get("/out/contract-openapi.json")!);
    await SwaggerParser.validate(JSON.parse(JSON.stringify(document)));
    openapi = (await SwaggerParser.dereference(document)) as unknown as typeof openapi;
    const axiosURL = pathToFileURL(createRequire(import.meta.url).resolve("axios")).href;
    const source = files.get("/out/jssdk.js")!.replace("from 'axios'", `from ${JSON.stringify(axiosURL)}`);
    // 仅定位包导入，完整执行生成的 ESM 文件；请求方法和传输层均使用真实 Axios。
    const moduleURL = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
    sdk = (await import(/* @vite-ignore */ moduleURL)).default as GeneratedSDK;
    sdk.instance.defaults.baseURL = `http://127.0.0.1:${port}`;
    sdk.instance.defaults.proxy = false;
    sdk.instance.defaults.timeout = 3000;
  });
  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  test("生成的文档是有效的 Swagger 2.0 文档", async () => {
    const serialized = JSON.parse(JSON.stringify(swagger));
    await expect(SwaggerParser.validate(serialized)).resolves.toMatchObject({ swagger: "2.0" });
  });

  test("OpenAPI 3 用标准 anyOf、requestBody 和数组参数序列化", () => {
    expect(openapi.openapi).toBe("3.0.3");
    expect(openapi.components.schemas.ContractInput.properties?.selection.anyOf).toEqual([
      { type: "string" },
      { type: "number" },
    ]);
    expect(JSON.stringify(openapi)).not.toContain("x-anyOf");
    for (const method of methods) {
      const operation = openapi.paths["/contract/{id}"][method];
      if (method === "get" || method === "delete") {
        expect(operation.requestBody).toBeUndefined();
        expect(operation.parameters).toContainEqual(
          expect.objectContaining({ name: "values", in: "query", style: "form", explode: true })
        );
      } else
        expect(operation.requestBody?.content["application/json"].schema.required).toEqual([
          "label",
          "values",
          "selection",
        ]);
    }
  });

  test("Markdown 展示数组元素、union 全部分支和 registerTyped 响应", () => {
    const markdown = apiDocs(docs)
      .list.map((item) => item.content)
      .join("\n");
    expect(markdown).toContain("number[]");
    expect(markdown).toContain("string \\| number");
    expect(markdown.match(/### 返回结果/g)).toHaveLength(15);
  });

  for (const method of methods) {
    const queryInput = method === "get" || method === "delete";
    test(`${method.toUpperCase()}：可选输入可省略，默认值由运行时填充`, async () => {
      const response = await sdk[`${method}ContractOptionalInput`]();
      expect(response.data).toEqual({ count: 0 });
      assertExchange(method, response, "/contract/optional/input");
      const operation = (swagger.paths as any)["/contract/optional/input"][method];
      expect(operation.parameters.every((parameter: { required?: boolean }) => !parameter.required)).toBe(true);
    });
    test(`${method.toUpperCase()}：生成的 SDK 经 HTTP 传递路径、数组、union 与可选字段`, async () => {
      const data = { label: "中文 & =", values: [1, 2], selection: "chosen" };
      const response = await sdk[`${method}ContractId`]("42", data);
      expect(response.status).toBe(200);
      expect(response.data).toEqual({ method, id: "42", data });
      expect(responseSchema.safeParse(response.data).success).toBe(true);
      assertExchange(method, response);
    });

    test(`${method.toUpperCase()}：运行时拒绝 SDK 传来的缺失必填和错误数组`, async () => {
      await expect(sdk[`${method}ContractId`]("42", { values: [1], selection: "x" })).rejects.toMatchObject({
        response: { status: 400 },
      });
      expect(requestMatches(openapi.paths["/contract/{id}"][method])).toBe(false);
      await expect(
        sdk[`${method}ContractId`]("42", { label: "x", values: ["bad", 1], selection: "x" })
      ).rejects.toMatchObject({ response: { status: 400 } });
      expect(requestMatches(openapi.paths["/contract/{id}"][method])).toBe(false);
    });

    test(`${method.toUpperCase()}：文档和运行时都拒绝长度与范围越界`, async () => {
      const invalid = [
        { label: "", values: [1, 2], selection: "x" },
        { label: "x", values: [1, 101], selection: "x" },
      ];
      for (const data of invalid) {
        await expect(sdk[`${method}ContractId`]("42", data)).rejects.toMatchObject({ response: { status: 400 } });
        expect(requestMatches(openapi.paths["/contract/{id}"][method])).toBe(false);
      }
    });

    test(`${method.toUpperCase()}：错误的 handler 返回值被运行时和响应文档共同拒绝`, async () => {
      await expect(sdk[`${method}ContractBadResponse`]()).rejects.toMatchObject({ response: { status: 400 } });
      const operation = openapi.paths["/contract/bad/response"][method];
      expect(ajv.validate(operation.responses["200"].content!["application/json"].schema, { result: "bad" })).toBe(
        false
      );
    });

    test(`${method.toUpperCase()}：Swagger 参数位置、必填和响应结构与注册 schema 一致`, () => {
      const operation = (swagger.paths as any)["/contract/{id}"][method];
      expect(operation.parameters).toContainEqual(expect.objectContaining({ in: "path", name: "id", required: true }));
      const body = operation.parameters.find((p: any) => p.in === "body");
      if (queryInput) {
        expect(body).toBeUndefined();
        expect(operation.parameters).toContainEqual(
          expect.objectContaining({
            in: "query",
            name: "values",
            type: "array",
            items: { type: "number" },
            collectionFormat: "multi",
          })
        );
      } else {
        expect(body).toBeDefined();
        expect(body.schema.required).toEqual(["label", "values", "selection"]);
        expect(body.schema.properties.values).toMatchObject({ type: "array", items: { type: "number" } });
        expect(body.schema.properties.selection["x-anyOf"]).toEqual([{ type: "string" }, { type: "number" }]);
      }
      const result = operation.responses[200].schema;
      expect(result.properties.data.properties.values.items).toEqual({ type: "number" });
      expect(result.properties.data.properties.selection["x-anyOf"]).toEqual([{ type: "string" }, { type: "number" }]);
    });

    if (!queryInput) {
      test(`${method.toUpperCase()}：body 和附加 query 各自到达声明的位置`, async () => {
        const data = { label: "mixed", values: [1, 2], selection: "x" };
        const response = await sdk[`${method}ContractId`]("44", data, { trace: "trace & query" });
        expect(response.data).toEqual({ method, id: "44", data, trace: "trace & query" });
        assertExchange(method, response);
      });

      test(`${method.toUpperCase()}：union 的数字分支可经 SDK 到达服务端`, async () => {
        const data = { label: "numeric", values: [3], selection: 7, note: "optional" };
        const response = await sdk[`${method}ContractId`]("43", data);
        expect(response.data).toEqual({ method, id: "43", data });
        assertExchange(method, response);
      });

      test(`${method.toUpperCase()}：nullable 分支通过，union 以外的类型被两端拒绝`, async () => {
        const data = { label: "nullable", values: [1, 2], selection: 7, note: null };
        const response = await sdk[`${method}ContractId`]("43", data);
        assertExchange(method, response);
        await expect(sdk[`${method}ContractId`]("43", { ...data, selection: false as never })).rejects.toMatchObject({
          response: { status: 400 },
        });
        expect(requestMatches(openapi.paths["/contract/{id}"][method])).toBe(false);
      });
    }
  }
});
