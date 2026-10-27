/** OpenAPI 3.0.3：标准 requestBody/content、组合 schema 和组件引用。 */
import * as path from "node:path";
import { plugin as debug } from "../../debug.js";
import type { IDocData, IDocWritter } from "../../extend/docs.js";
import type { IDocOptions } from "../../index.js";
import { isZodSchema } from "../../params.js";
import { getPath, getRealPath, getPathParamNames, mapPathParams } from "../../utils.js";
import { extractDocFields, extractJSONSchema, resolveZodShape } from "../zod-meta.js";

export interface OpenAPISchema extends Record<string, unknown> {
  $ref?: string;
  type?: string;
  properties?: Record<string, OpenAPISchema>;
  required?: string[];
  items?: OpenAPISchema;
  anyOf?: OpenAPISchema[];
}

export interface OpenAPIParameter {
  name: string;
  in: "path" | "query" | "header";
  required: boolean;
  description?: string;
  schema: OpenAPISchema;
  style?: "form";
  explode?: boolean;
}

export interface OpenAPIOperation {
  tags: string[];
  summary: string;
  description?: string;
  parameters: OpenAPIParameter[];
  requestBody?: { required: boolean; content: Record<string, { schema: OpenAPISchema; example?: unknown }> };
  responses: Record<string, { description: string; content?: Record<string, { schema: OpenAPISchema }> }>;
}

/** OAS 3.0 没有 type:null；这个标准 schema 只接受 null。 */
const nullSchema = (): OpenAPISchema => ({ type: "string", nullable: true, enum: [null] });

/** 将每个源 schema 的本地引用迁入 components，避免 # 错指整个 OpenAPI 文档。 */
class Schemas {
  readonly components: Record<string, OpenAPISchema> = {};
  private names = new Set<string>();

  private name(hint: string): string {
    const base = hint.replace(/[^a-zA-Z0-9._-]/g, "_") || "Schema";
    let name = base;
    for (let n = 2; this.names.has(name); n++) name = `${base}_${n}`;
    this.names.add(name);
    return name;
  }

  add(hint: string, zodSchema: unknown): OpenAPISchema {
    const name = this.name(hint);
    const source = extractJSONSchema(zodSchema);
    const definitions = (source.definitions ?? source.$defs ?? {}) as Record<string, Record<string, unknown>>;
    const localNames = new Map(Object.keys(definitions).map((key) => [key, this.name(`${name}.${key}`)]));
    const ref = (value: string): string => {
      if (value === "#") return `#/components/schemas/${name}`;
      const match = value.match(/^#\/(?:definitions|\$defs)\/([^/]+)(.*)$/);
      if (match) {
        const key = match[1].replaceAll("~1", "/").replaceAll("~0", "~");
        const target = localNames.get(key);
        if (!target) throw new Error(`Unresolved schema reference: ${value}`);
        return `#/components/schemas/${target}${match[2]}`;
      }
      return value.startsWith("#/") ? `#/components/schemas/${name}${value.slice(1)}` : value;
    };
    this.components[name] = this.convert(source, ref);
    for (const [key, schema] of Object.entries(definitions)) {
      this.components[localNames.get(key)!] = this.convert(schema, ref);
    }
    return { $ref: `#/components/schemas/${name}` };
  }

  private convert(source: Record<string, unknown>, ref: (value: string) => string): OpenAPISchema {
    if (source.type === "null" || source["x-zod-type"] === "null") return nullSchema();
    const result: OpenAPISchema = {};
    for (const [key, value] of Object.entries(source)) {
      if (["$schema", "$id", "definitions", "$defs", "x-nullable"].includes(key)) continue;
      if (key === "$ref") result.$ref = ref(value as string);
      else if (key === "const") result.enum = [value];
      else if (key === "properties") {
        result.properties = Object.fromEntries(
          Object.entries(value as Record<string, Record<string, unknown>>).map(([name, schema]) => [
            name,
            this.convert(schema, ref),
          ])
        );
      } else if (["anyOf", "oneOf", "allOf", "x-anyOf"].includes(key)) {
        result[key === "x-anyOf" ? "anyOf" : key] = (value as Record<string, unknown>[]).map((schema) =>
          this.convert(schema, ref)
        );
      } else if (
        ["items", "additionalProperties", "not"].includes(key) &&
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        result[key] = this.convert(value as Record<string, unknown>, ref);
      } else if ((key === "exclusiveMinimum" || key === "exclusiveMaximum") && typeof value === "number") {
        result[key === "exclusiveMinimum" ? "minimum" : "maximum"] = value;
        result[key] = true;
      } else if (key === "type" && Array.isArray(value)) {
        result.anyOf = value.map((type) => (type === "null" ? nullSchema() : { type }));
      } else if (
        ["propertyNames", "patternProperties", "contains", "additionalItems"].includes(key) ||
        (key === "items" && Array.isArray(value))
      ) {
        // OAS 3.0 无这些关键字；保留扩展，避免把它们冒充为标准约束。
        result[`x-json-schema-${key}`] = value;
        if (key === "items") result.items = {};
      } else if (key === "examples") {
        if (Array.isArray(value) && value.length) result.example = value[0];
      } else result[key] = value;
    }
    if (source["x-nullable"]) return { anyOf: [result, nullSchema()] };
    return result;
  }
}

export function buildOpenAPI(data: IDocData) {
  const schemas = new Schemas();
  const manager = data.schema as { get?: (name: string) => unknown } | undefined;
  const types = data.typeManager as { get?: (name: string) => unknown } | undefined;
  for (const [name] of Object.entries(data.types ?? {})) {
    const schema = manager?.get?.(name) ?? types?.get?.(name);
    if (isZodSchema(schema)) schemas.add(name, schema);
  }
  const paths: Record<string, Record<string, OpenAPIOperation>> = {};
  for (const [key, api] of Object.entries(data.apis)) {
    const rawPath = api.realPath || getRealPath(key);
    const route = mapPathParams(rawPath, (name) => `{${name}}`);
    const hint = `${api.method}.${route}`;
    const responseSchema =
      api.responseSchema ?? (typeof api.response === "string" ? manager?.get?.(api.response) : api.response);
    const operation: OpenAPIOperation = {
      tags: [api.group],
      summary: api.title as string,
      description: api.description as string | undefined,
      parameters: [],
      responses: {
        "200": {
          description: "请求成功",
          ...(responseSchema
            ? { content: { "application/json": { schema: schemas.add(`${hint}.Response`, responseSchema) } } }
            : {}),
        },
      },
    };
    for (const [place, schema] of [
      ["params", api.paramsSchema],
      ["query", api.querySchema],
      ["headers", api.headersSchema],
    ] as const) {
      const shape = resolveZodShape(schema) ?? {};
      const required = (extractJSONSchema(schema).required ?? []) as string[];
      const fields = extractDocFields(schema, place);
      const names = place === "params" ? getPathParamNames(rawPath) : fields.map((field) => field.name);
      for (const name of names) {
        const field = fields.find((item) => item.name === name);
        operation.parameters.push({
          name,
          in: place === "params" ? "path" : place === "headers" ? "header" : "query",
          required: place === "params" || required.includes(name),
          ...(field?.comment ? { description: field.comment } : {}),
          schema: shape[name] ? schemas.add(`${hint}.${place}.${name}`, shape[name]) : { type: "string" },
          ...(place === "query" ? ({ style: "form", explode: true } as const) : {}),
        });
      }
    }
    if (["post", "put", "patch"].includes(api.method as string) && api.bodySchema) {
      const example = api.examples?.find((item) => item.output?.success) ?? api.examples?.[0];
      operation.requestBody = {
        required: !!(extractJSONSchema(api.bodySchema).required as string[] | undefined)?.length,
        content: {
          "application/json": {
            schema: schemas.add(`${hint}.Body`, api.bodySchema),
            ...(example?.input ? { example: example.input } : {}),
          },
        },
      };
    }
    paths[route] ??= {};
    paths[route][api.method as string] = operation;
  }
  return {
    openapi: "3.0.3" as const,
    info: {
      title: data.info.title || "API",
      description: data.info.description,
      version: String(data.info.version || "1.0.0"),
    },
    servers: [{ url: `${data.info.host || ""}${data.info.basePath || ""}` || "/" }],
    tags: Object.entries(data.group).map(([name, description]) => ({ name, description })),
    paths,
    components: { schemas: schemas.components },
  };
}

export default function generateOpenAPI(data: IDocData, dir: string, options: IDocOptions, writer: IDocWritter) {
  debug("generateOpenAPI: %s - %o", dir, options);
  writer(path.resolve(dir, getPath("openapi.json", options.openapi)), JSON.stringify(buildOpenAPI(data), null, 2));
}
