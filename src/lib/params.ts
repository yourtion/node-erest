/**
 * @file API 参数检测
 * 参考 hojs
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import API from ".";
import { create, params as debug } from "./debug";
import { IKVObject } from "./interfaces";
import { Schema } from "./schema";

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

export function paramsChecker(ctx: API, name: string, value: any, typeInfo: ISchemaType) {
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

export function schemaChecker(
  ctx: API,
  data: IKVObject,
  schema: IKVObject<ISchemaType>,
  requiredOneOf: string[] = []
) {
  const result: IKVObject = {};
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
        if (options.required) {
          throw error.missingParameter(`'${name}' is required!`);
        }
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
    if (ok) {
      break;
    }
  }
  if (!ok) {
    throw error.missingParameter(`one of ${requiredOneOf.join(", ")} is required`);
  }
  return result;
}

/**
 * API 参数检查
 *
 * @param {Object} ctx 上下文
 * @param {Schema} schema 定义
 * @returns {Function} 中间件
 */
export function apiCheckParams<T, U>(ctx: API, schema: Schema<T, U>) {
  const { error } = ctx.privateInfo;
  return function apiParamsChecker(req: any, res: any, next: any) {
    const newParams: IKVObject = {};
    for (const place of ["query", "params", "body"]) {
      const pOptions = schema.options[place];
      for (const name in pOptions) {
        apiDebug("on %s check: `%s`", place, name);
        let value = req[place][name];
        const options = pOptions[name];

        if (typeof value === "undefined") {
          if (options.default) {
            // 为未赋值参数添加默认值默认值
            value = options.default;
          } else {
            // 其他情况忽略
            continue;
          }
        }

        newParams[name] = paramsChecker(ctx, name, value, options);
      }
    }

    // 必填参数检查
    if (schema.options.required.size > 0) {
      for (const name of schema.options.required) {
        apiDebug("required : %s", name);
        if (!(name in newParams)) {
          throw error.missingParameter(`'${name}' is required!`);
        }
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

    req.$params = newParams;
    next();
  };
}
