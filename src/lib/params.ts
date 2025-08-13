/**
 * @file API 参数检测
 * 参考 hojs
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import ERest from ".";
import { create, params as debug } from "./debug";
import API from "./api";
import { SchemaType } from "@tuzhanai/schema-manager";

export interface ISchemaType {
  type: string;
  comment?: string;
  format?: boolean;
  default?: any;
  required?: boolean;
  params?: any;
}

const schemaDebug = create("params:schema");
const apiDebug = create("params:api");

export function paramsChecker(ctx: ERest<any>, name: string, input: any, typeInfo: ISchemaType): any {
  const { error } = ctx.privateInfo;

  if (typeInfo.type === "Array" && Array.isArray(input) && typeInfo.params) {
    const type = typeof typeInfo.params === "string" ? { type: typeInfo.params } : typeInfo.params;
    debug("paramsChecker: Array type - subType", type);
    return input.map((val, idx) => paramsChecker(ctx, `${name}[${idx}]`, val, type));
  }

  const { ok, message, value } = ctx.type.value(typeInfo.type, input, typeInfo.params, typeInfo.format);
  debug("paramsChecker: ", input, ok, message, value);

  // 如果类型有 checker 则检查
  if (!ok) {
    let msg = `'${name}' should be valid ${typeInfo.type}`;
    if (typeInfo.params) {
      msg = `${msg} with additional restrictions: ${typeInfo.params}`;
    }
    throw error.invalidParameter(msg);
  }

  return value;
}

export function schemaChecker<T extends Record<string, any>>(
  ctx: ERest<any>,
  data: T,
  schema: SchemaType | Record<string, ISchemaType>,
  requiredOneOf: string[] = []
) {
  // const result: Record<string, any> = {};
  const { error } = ctx.privateInfo;
  const schemaInfo = schema instanceof SchemaType ? schema : ctx.schema.create(schema);
  const { ok, value, message, invalidParamaters, missingParamaters, invalidParamaterTypes } = schemaInfo.value(data);
  if (!ok) {
    if (missingParamaters && missingParamaters.length > 0) throw error.missingParameter(`'${missingParamaters[0]}'`);
    if (invalidParamaters && invalidParamaters.length > 0) {
      if (invalidParamaterTypes && invalidParamaters.length === invalidParamaterTypes.length) {
        throw error.invalidParameter(`'${invalidParamaters[0]}' should be valid ${invalidParamaterTypes[0]}`);
      }
      throw error.invalidParameter(`'${invalidParamaters[0]}'`);
    }
    throw error.internalError(message);
  }
  // 可选参数检查
  let req = requiredOneOf.length < 1;
  for (const name of requiredOneOf) {
    req = typeof value[name] !== "undefined";
    schemaDebug("requiredOneOf : %s - %s", name, ok);
    if (req) break;
  }
  if (!req) throw error.missingParameter(`one of ${requiredOneOf.join(", ")} is required`);
  return value;
}

export function responseChecker<T extends Record<string, any>>(
  ctx: ERest<any>,
  data: T,
  schema: ISchemaType | SchemaType | Record<string, ISchemaType>
) {
  if (schema instanceof SchemaType) {
    return schema.value(data);
  }
  if (typeof schema.type === "string") {
    return ctx.type.value(schema.type, data, schema.params);
  }
  const schemaInfo = ctx.schema.create(schema as Record<string, ISchemaType>);
  return schemaInfo.value(data);
}

/**
 * API 参数检查
 */
export function apiParamsCheck(
  ctx: ERest<any>,
  schema: API<any>,
  params?: Record<string, any>,
  query?: Record<string, any>,
  body?: Record<string, any>,
  headers?: Record<string, any>
) {
  const { error } = ctx.privateInfo;
  const newParams: Record<string, any> = {};
  if (schema.options.params && params) {
    const res = schemaChecker(ctx, params, schema.options.params);
    Object.assign(newParams, res);
  }
  if (schema.options.query && query) {
    const res = schemaChecker(ctx, query, schema.options.query);
    Object.assign(newParams, res);
  }
  if (schema.options.body && body) {
    const res = schemaChecker(ctx, body, schema.options.body);
    Object.assign(newParams, res);
  }
  if (schema.options.headers && headers) {
    const res = schemaChecker(ctx, headers, schema.options.headers);
    Object.assign(newParams, res);
  }

  // 必填参数检查
  if (schema.options.required.size > 0) {
    for (const name of schema.options.required) {
      apiDebug("required : %s", name);
      if (!(name in newParams)) throw error.missingParameter(`'${name}'`);
    }
  }

  // 可选参数检查
  if (schema.options.requiredOneOf.length > 0) {
    for (const names of schema.options.requiredOneOf) {
      apiDebug("requiredOneOf : %o", names);
      let ok = false;
      for (const name of names) {
        ok = typeof newParams[name] !== "undefined";
        apiDebug("requiredOneOf : %s - %s", name, ok);
        if (ok) {
          break;
        }
      }
      if (!ok) {
        throw error.missingParameter(`one of ${names.join(", ")} is required`);
      }
    }
  }

  return newParams;
}
