/**
 * @file API plugin generate-swagger
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import * as path from "node:path";
import { URL } from "node:url";
import type { IDocOptions } from "../..";
import { plugin as debug } from "../../debug";
import type { IDocData, IDocWritter } from "../../extend/docs";
import type { ISchemaType } from "../../params";
import * as utils from "../../utils";

type SCHEMA = "http" | "https" | "ws" | "wss";

interface ISwaggerResult {
  // 指定swagger spec版本，2.0
  swagger: string;
  // 提供API的元数据
  info: unknown;
  // 主机，如果没有提供，则使用文档所在的host
  host?: string;
  // 相对于host的路径
  basePath: string;
  schemes: SCHEMA[];
  // 补充的元数据，在swagger ui中，用于作为api的分组标签
  tags: Array<{ name: string; description: string }>;
  definitions: Record<string, ISwaggerModels>;
  paths: unknown;
}

interface ISwaggerResultParams {
  name?: string;
  in?: string;
  description: string;
  type?: string;
  required?: string[] | boolean;
  example?: unknown;
  enum?: string[];
  items?: unknown;
  format?: string;
  $ref?: string;
}

interface ISwaggerModels {
  type: string;
  properties: Record<string, { type: string; format?: string; description: string }>;
}

export function buildSwagger(data: IDocData) {
  const url = new URL(`${data.info.host || ""}${data.info.basePath || ""}`);

  const result: ISwaggerResult = {
    swagger: "2.0",
    info: {
      title: data.info.title,
      description: data.info.description,
      version: data.info.version || "1.0.0",
    },
    // host: url.host,
    basePath: url.pathname,
    schemes: [url.protocol.replace(":", "") as SCHEMA],
    tags: [],
    definitions: {},
    paths: {},
  };

  for (const [k, g] of Object.entries(data.group)) {
    result.tags.push({ name: k, description: g });
  }
  result.tags.sort((a, b) => (a.name > b.name ? 1 : -1));

  // TODO: 需要根据新的 Zod 实现重新设计 schema 文档生成
  // data.schema.forEach((value, key) => {
  //   const schema = {
  //     type: "object",
  //     properties: {},
  //   } as ISwaggerModels;
  //   const fields = (value as any).fields || ({} as ISchemaTypeFields);
  //   for (const item of Object.keys(fields)) {
  //     schema.properties[item] = {
  //       type: "string",
  //       description: fields[item].comment || "",
  //     };
  //   }
  //   result.definitions[key] = schema;
  // });

  const paths = result.paths as Record<string, unknown>;
  const apis = data.apis;
  for (const [key, api] of Object.entries(apis)) {
    const newPath = utils.getRealPath(key).replace(/:(\w+)/, "{$1}");
    if (!paths[newPath]) {
      paths[newPath] = {};
    }
    const sc = paths[newPath] as Record<string, unknown>;
    sc[api.method as string] = {
      tags: [api.group],
      summary: api.title,
      description: api.description || "",
      consumes: ["application/json"],
      produces: ["application/json"],
      responses: {
        200: {
          description: "请求成功",
        },
      },
    };

    (sc[api.method as string] as Record<string, unknown>).parameters = [];
    const bodySchema: Record<string, unknown> = {};
    let example = api.examples?.[0];
    if (api.examples && api.examples.length > 1) {
      for (const item of api.examples) {
        if (item.output?.success) {
          example = item;
          break;
        }
      }
    }
    example = example || { input: {}, output: {} };
    for (const place of ["params", "query", "body"]) {
      for (const sKey in (api as Record<string, Record<string, ISchemaType>>)[place]) {
        const fieldInfo = (api as Record<string, Record<string, ISchemaType>>)[place][sKey];
        const obj: ISwaggerResultParams = {
          name: sKey,
          in: place === "params" ? "path" : place,
          description: fieldInfo.comment || "",
          required: sKey === "body" ? [] : false,
          type: fieldInfo.type.toLowerCase(),
          example: place === "body" ? example.input?.[sKey] : undefined,
        };
        if (place === "params") obj.required = true;
        if (api.required.has(sKey)) {
          if (place === "query") obj.required = true;
        }
        if (fieldInfo.type === "ENUM") {
          obj.type = "string";
          obj.enum = fieldInfo.params as string[];
        }
        if (fieldInfo.type === "IntArray") {
          obj.type = "array";
          obj.items = { type: "integer" };
        }
        if (fieldInfo.type === "Date") {
          obj.type = "string";
          obj.format = "date";
        }
        if ((data.schema as { has: (type: string) => boolean }).has(fieldInfo.type)) {
          delete obj.type;
          obj.$ref = `#/definitions/${fieldInfo.type}`;
        }
        if (place === "body") {
          delete obj.in;
          delete obj.name;
          delete obj.required;
          bodySchema[sKey] = obj;
          if (api.required.has(sKey) && Array.isArray(bodySchema.required)) {
            bodySchema.required.push(sKey);
          }
        } else {
          ((sc[api.method as string] as Record<string, unknown>).parameters as unknown[]).push(obj);
        }
      }
    }

    // sc[schema.method].responses[200].example = example.output;
    if (api.method === "post" && api.body) {
      const required = api.required && [...api.required].filter((it) => Object.keys(bodySchema).indexOf(it) > -1);
      ((sc[api.method as string] as Record<string, unknown>).parameters as unknown[]).push({
        in: "body",
        name: "body",
        description: "请求体",
        required: true,
        schema: {
          type: "object",
          required: required && required.length > 0 ? required : undefined,
          properties: bodySchema,
        },
      });
    }
  }
  return result;
}

export default function generateSwagger(data: IDocData, dir: string, options: IDocOptions, writter: IDocWritter) {
  debug("generateSwagger: %s - %o", dir, options);

  const result = buildSwagger(data);

  const filename = utils.getPath("swagger.json", options.swagger);

  writter(path.resolve(dir, filename), JSON.stringify(result, null, "  "));
}
