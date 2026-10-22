/** Swagger 2 文档生成：请求、响应和注册类型共用递归 schema 提取。 */
import * as path from "node:path";
import { URL } from "node:url";
import { plugin as debug } from "../../debug.js";
import type { IDocData, IDocWritter } from "../../extend/docs.js";
import type { IDocOptions } from "../../index.js";
import { isZodSchema } from "../../params.js";
import * as utils from "../../utils.js";
import { extractDocFields, extractDocSchema, resolveZodShape, type DocSchema } from "../zod-meta.js";

/** 兼容只提供 tsType 的第三方文档数据；正常生成使用注册表的 Zod schema。 */
function typeSchema(tsType: string): DocSchema {
  if (tsType.endsWith("[]")) return { type: "array", items: typeSchema(tsType.slice(0, -2)) };
  if (tsType.includes(" | ")) return { "x-anyOf": tsType.split(" | ").map(typeSchema) };
  if (tsType === "Date") return { type: "string", format: "date-time" };
  if (["string", "number", "boolean", "object"].includes(tsType)) return { type: tsType };
  return {};
}

function generateDefinitions(data: IDocData): Record<string, DocSchema> {
  const definitions: Record<string, DocSchema> = {};
  const schemas = data.schema as { get?: (name: string) => unknown } | undefined;
  const types = data.typeManager as { get?: (name: string) => unknown } | undefined;
  for (const [name, doc] of Object.entries(data.types ?? {})) {
    // 使用受控管理器访问器，不反射私有注册表。
    const schema = schemas?.get?.(name) ?? types?.get?.(name);
    const generated = isZodSchema(schema) ? extractDocSchema(schema) : typeSchema(doc.tsType ?? "unknown");
    const description = generated.description ?? doc.description;
    definitions[name] = {
      ...generated,
      ...(description ? { description } : {}),
    };
  }
  return definitions;
}

/** Swagger 2 的非 body 参数必须有 type；异构 union 在 URL 上按字符串传输。 */
function parameterSchema(schema: DocSchema): DocSchema {
  return {
    ...schema,
    type: schema.type ?? "string",
    ...(schema.items ? { items: parameterSchema(schema.items) } : {}),
  };
}

export function buildSwagger(data: IDocData) {
  const url = new URL(`${data.info.host || ""}${data.info.basePath || ""}`);
  const paths: Record<string, Record<string, unknown>> = {};
  const result = {
    swagger: "2.0",
    info: {
      title: data.info.title,
      description: data.info.description,
      version: data.info.version || "1.0.0",
    },
    basePath: url.pathname,
    schemes: [url.protocol.replace(":", "")],
    tags: Object.entries(data.group)
      .map(([name, description]) => ({ name, description }))
      .sort((a, b) => (a.name > b.name ? 1 : -1)),
    definitions: generateDefinitions(data),
    paths,
  };

  for (const [key, api] of Object.entries(data.apis)) {
    const newPath = utils.getRealPath(key).replace(/:(\w+)/g, "{$1}");
    const parameters: unknown[] = [];
    const response = isZodSchema(api.responseSchema)
      ? { description: "请求成功", schema: extractDocSchema(api.responseSchema) }
      : { description: "请求成功" };
    paths[newPath] ??= {};
    paths[newPath][api.method as string] = {
      tags: [api.group],
      summary: api.title,
      description: api.description || "",
      consumes: ["application/json"],
      produces: ["application/json"],
      responses: { 200: response },
      parameters,
    };

    for (const [place, schema] of [
      ["params", api.paramsSchema],
      ["query", api.querySchema],
      ["headers", api.headersSchema],
    ] as const) {
      const shape = resolveZodShape(schema) ?? {};
      for (const field of extractDocFields(schema, place)) {
        const doc = parameterSchema(extractDocSchema(shape[field.name]));
        parameters.push({
          ...doc,
          name: field.name,
          in: place === "params" ? "path" : place === "headers" ? "header" : "query",
          description: field.comment || "",
          required: place === "params" || field.required,
          ...(doc.type === "array" && place === "query" ? { collectionFormat: "multi" } : {}),
        });
      }
    }

    if (["post", "put", "patch"].includes(api.method as string) && api.bodySchema) {
      const schema = extractDocSchema(api.bodySchema);
      const examples = api.examples ?? [];
      const example = examples.find((item) => item.output?.success) ?? examples[0];
      // 示例是补充信息，不参与类型推断。
      for (const [name, property] of Object.entries(schema.properties ?? {})) {
        if (example?.input && name in example.input) {
          (property as DocSchema & { example?: unknown }).example = example.input[name];
        }
      }
      parameters.push({ in: "body", name: "body", description: "请求体", required: !!schema.required?.length, schema });
    }
  }
  return result;
}

export default function generateSwagger(data: IDocData, dir: string, options: IDocOptions, writer: IDocWritter) {
  debug("generateSwagger: %s - %o", dir, options);
  writer(
    path.resolve(dir, utils.getPath("swagger.json", options.swagger)),
    JSON.stringify(buildSwagger(data), null, "  ")
  );
}
