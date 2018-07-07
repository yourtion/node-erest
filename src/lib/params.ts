/**
 * @file API 参数检测
 * 参考 hojs
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import ERest from "./index";
import { create, params as debug } from "./debug";
import API from "./api";

export interface ISchemaType {
  type: string;
  comment?: string;
  format?: boolean;
  default?: any;
  required?: boolean;
  params?: any;
  _paramsJSON?: string;
}

const schemaDebug = create("params:schema");
const apiDebug = create("params:api");

export function paramsChecker(ctx: ERest<any>, name: string, value: any, typeInfo: ISchemaType) {
  const type = ctx.type.get(typeInfo.type)!;
  const { error } = ctx.privateInfo;
  let result = value;
  // 如果类型有 parser 则先执行
  if (type.parser) {
    debug("param `%s` run parser", name);
    result = type.parser(result);
  }

  // 如果类型有 checker 则检查
  if (!type.checker(result, typeInfo.params)) {
    debug("param `%s` run checker", name);
    let msg = `'${name}' should be valid ${typeInfo.type}`;
    if (typeInfo.params) {
      msg = `${msg} with additional restrictions: ${typeInfo._paramsJSON || typeInfo.params}`;
    }
    throw error.invalidParameter(msg);
  }

  // 如果类型有 formatter 且开启了 format=true 则格式化参数
  const needFormat = typeInfo.format || (type.isDefaultFormat && typeInfo.format === undefined);
  if (type.formatter && needFormat) {
    debug("param `%s` run format", name);
    debug("befor format : %o", result);
    result = type.formatter(result);
    debug("after format : %o", result);
  }
  return result;
}

export function schemaChecker<T extends Record<string, any>>(
  ctx: ERest<any>,
  data: T,
  schema: Record<string, ISchemaType>,
  requiredOneOf: string[] = []
) {
  const result: Record<string, any> = {};
  const { error } = ctx.privateInfo;
  for (const name in schema) {
    let value = data[name];
    const options = schema[name];
    schemaDebug("check %s : %s with %o", name, value, options);

    if (typeof value === "undefined") {
      if (options.default !== undefined) {
        // 为未赋值参数添加默认值默认值
        schemaDebug("param `%s` set default value : %o", name, options.default);
        value = options.default;
      } else {
        if (options.required) throw error.missingParameter(`'${name}' is required!`);
        // 其他情况忽略
        continue;
      }
    }
    result[name] = paramsChecker(ctx, name, value, options);
  }

  // 可选参数检查
  let ok = requiredOneOf.length < 1;
  for (const name of requiredOneOf) {
    ok = typeof result[name] !== "undefined";
    schemaDebug("requiredOneOf : %s - %s", name, ok);
    if (ok) break;
  }
  if (!ok) throw error.missingParameter(`one of ${requiredOneOf.join(", ")} is required`);
  return result;
}

/**
 * API 参数检查
 */
export function apiParamsCheck(
  ctx: ERest<any>,
  schema: API<any>,
  params?: Record<string, any>,
  query?: Record<string, any>,
  body?: Record<string, any>
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

  // 必填参数检查
  if (schema.options.required.size > 0) {
    for (const name of schema.options.required) {
      apiDebug("required : %s", name);
      if (!(name in newParams)) throw error.missingParameter(`'${name}' is required!`);
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
