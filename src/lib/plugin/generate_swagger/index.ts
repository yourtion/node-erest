/**
 * @file API plugin generate-swagger
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import * as path from "node:path";
import { URL } from "node:url";
import type { ZodType } from "zod";
import type { IDocOptions } from "../..";
import { plugin as debug } from "../../debug";
import type { IDocData, IDocWritter } from "../../extend/docs";
import type { ISchemaType } from "../../params";
import { isZodSchema } from "../../params";
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
  required?: string[];
}

/**
 * 生成 Swagger Schema 定义
 */
function generateSwaggerSchemaDefinitions(data: IDocData, result: ISwaggerResult) {
  // 从类型注册表生成定义
  if (data.types && Object.keys(data.types).length > 0) {
    for (const [typeName, typeDoc] of Object.entries(data.types)) {
      const swaggerSchema: ISwaggerModels = {
        type: convertTypeToSwaggerType(typeDoc.tsType || "unknown"),
        properties: {},
      };

      // 简单类型直接使用类型信息
      if (typeDoc.description) {
        (swaggerSchema as { description?: string }).description = typeDoc.description;
      }

      result.definitions[typeName] = swaggerSchema;
    }
  }

  // 从schema注册表生成定义
  const schemaManager = data.schema as {
    get?: (name: string) => ZodType | undefined;
    has?: (name: string) => boolean;
    [key: string]: unknown;
  };

  // 尝试通过ERest实例直接访问schemaRegistry
  const erestInstance =
    (data as { erest?: unknown; instance?: unknown }).erest ||
    (data as { erest?: unknown; instance?: unknown }).instance;
  let schemaRegistry: Map<string, ZodType> | null = null;

  if (erestInstance && (erestInstance as { schemaRegistry?: Map<string, ZodType> }).schemaRegistry instanceof Map) {
    schemaRegistry = (erestInstance as { schemaRegistry: Map<string, ZodType> }).schemaRegistry;
  } else if (schemaManager && typeof schemaManager === "object") {
    // 如果无法直接访问，尝试通过反射获取
    const keys = Object.getOwnPropertyNames(schemaManager);
    for (const key of keys) {
      const value = schemaManager[key];
      if (value instanceof Map) {
        schemaRegistry = value;
        break;
      }
    }
  }

  if (schemaRegistry && schemaRegistry.size > 0) {
    for (const [schemaName, zodSchema] of schemaRegistry.entries()) {
      if (isZodSchema(zodSchema)) {
        const swaggerSchema = convertZodSchemaToSwagger(zodSchema);
        // 确保对象类型能正确转换
        if (swaggerSchema.type === "object" && Object.keys(swaggerSchema.properties).length === 0) {
          // 如果是空对象，尝试重新解析
          const reprocessedSchema = convertZodSchemaToSwagger(zodSchema);
          result.definitions[schemaName] = reprocessedSchema;
        } else {
          result.definitions[schemaName] = swaggerSchema;
        }
      }
    }
  }
}

/**
 * 将 TypeScript 类型转换为 Swagger 类型
 */
function convertTypeToSwaggerType(tsType: string): string {
  if (tsType.includes("string")) return "string";
  if (tsType.includes("number")) return "number";
  if (tsType.includes("boolean")) return "boolean";
  if (tsType.includes("Date")) return "string";
  if (tsType.includes("[]")) return "array";
  if (tsType.includes("object")) return "object";
  return "string"; // 默认为字符串
}

/**
 * 将 Zod Schema 转换为 Swagger Schema
 */
function convertZodSchemaToSwagger(zodSchema: ZodType): ISwaggerModels {
  const swaggerSchema: ISwaggerModels = {
    type: "object",
    properties: {},
    required: [],
  };

  if (!zodSchema || !zodSchema._def) {
    return swaggerSchema;
  }

  const typeName =
    (zodSchema._def as { typeName?: string; type?: string }).typeName ||
    (zodSchema._def as { typeName?: string; type?: string }).type;

  if (typeName === "ZodObject" || typeName === "object") {
    const shape = (zodSchema as ZodType & { _def: { shape: Record<string, ZodType> } })._def.shape;
    const requiredFields: string[] = [];

    for (const [fieldName, fieldSchema] of Object.entries(shape)) {
      const fieldInfo = convertZodFieldToSwagger(fieldSchema);
      swaggerSchema.properties[fieldName] = fieldInfo.property;

      if (fieldInfo.required) {
        requiredFields.push(fieldName);
      }
    }

    if (requiredFields.length > 0) {
      swaggerSchema.required = requiredFields;
    }
  } else {
    // 非对象类型
    const fieldInfo = convertZodFieldToSwagger(zodSchema);
    return {
      type: fieldInfo.property.type,
      properties: {},
      ...(fieldInfo.property.format && { format: fieldInfo.property.format }),
      ...(fieldInfo.property.description && { description: fieldInfo.property.description }),
    } as ISwaggerModels;
  }

  return swaggerSchema;
}

/**
 * 将 Zod 字段转换为 Swagger 属性
 */
function convertZodFieldToSwagger(zodSchema: ZodType): {
  property: { type: string; format?: string; description: string };
  required: boolean;
} {
  const result = {
    property: { type: "string", description: "" },
    required: true,
  };

  if (!zodSchema || !zodSchema._def) {
    return result;
  }

  const typeName =
    (zodSchema._def as { typeName?: string; type?: string }).typeName ||
    (zodSchema._def as { typeName?: string; type?: string }).type;

  switch (typeName) {
    case "ZodString":
    case "string":
      result.property.type = "string";
      result.property.description = "字符串类型";
      break;
    case "ZodNumber":
    case "number":
      result.property.type = "number";
      result.property.description = "数字类型";
      break;
    case "ZodBoolean":
    case "boolean":
      result.property.type = "boolean";
      result.property.description = "布尔类型";
      break;
    case "ZodDate":
    case "date":
      result.property.type = "string";
      (result.property as { format?: string }).format = "date-time";
      result.property.description = "日期类型";
      break;
    case "ZodArray":
    case "array":
      result.property.type = "array";
      result.property.description = "数组类型";
      // 可以进一步处理数组项类型
      break;
    case "ZodObject":
    case "object":
      result.property.type = "object";
      result.property.description = "对象类型";
      break;
    case "ZodEnum":
    case "enum":
      result.property.type = "string";
      result.property.description = "枚举类型";
      break;
    case "ZodOptional":
    case "optional": {
      const innerInfo = convertZodFieldToSwagger((zodSchema._def as unknown as { innerType: ZodType }).innerType);
      result.property = innerInfo.property;
      result.required = false;
      break;
    }
    case "ZodDefault":
    case "default": {
      const defaultInnerInfo = convertZodFieldToSwagger(
        (zodSchema._def as unknown as { innerType: ZodType }).innerType
      );
      result.property = defaultInnerInfo.property;
      result.required = false;
      break;
    }
    case "ZodUnion":
    case "union":
      result.property.type = "string"; // 联合类型简化为字符串
      result.property.description = "联合类型";
      break;
    default:
      result.property.type = "string";
      result.property.description = `${typeName} 类型`;
  }

  return result;
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

  // 生成 Schema 定义 - 支持新的 Zod 实现
  generateSwaggerSchemaDefinitions(data, result);

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
