/**
 * @file API 参数检测
 * 基于 zod 实现
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import { type ZodType, z } from "zod";
import type ERest from ".";
import type API from "./api";
import { create, params as debug } from "./debug";

/**
 * 检测是否为 Zod Schema
 */
export function isZodSchema(obj: any): obj is ZodType {
  if (!obj || typeof obj !== "object") return false;
  return "_def" in obj && obj._def && typeof obj.parse === "function";
}

/**
 * 检测是否为 ISchemaType 对象
 */
export function isISchemaType(obj: any): obj is ISchemaType {
  if (!obj || typeof obj !== "object") return false;
  return typeof obj.type === "string" && !isZodSchema(obj);
}

/**
 * 检测是否为 ISchemaType 对象的集合
 */
export function isISchemaTypeRecord(obj: any): obj is Record<string, ISchemaType> {
  if (!obj || typeof obj !== "object" || isZodSchema(obj)) {
    return false;
  }
  return Object.values(obj).every((value) => isISchemaType(value));
}

export interface ISchemaType {
  type: string;
  comment?: string;
  format?: boolean;
  default?: any;
  required?: boolean;
  params?: any;
}

// Zod schema type alias
export type SchemaType<T = any> = ZodType<T>;

// 基础类型映射
export const zodTypeMap = {
  string: z.string(),
  String: z.string(),
  TrimString: z.string().transform((val) => val.trim()),
  number: z.union([
    z.number(),
    z.string().transform((val) => {
      const num = Number(val);
      if (isNaN(num)) throw new Error("Invalid number");
      return num;
    }),
  ]),
  Number: z.union([
    z.number(),
    z.string().transform((val) => {
      const num = Number(val);
      if (isNaN(num)) throw new Error("Invalid number");
      return num;
    }),
  ]),
  Integer: z.union([
    z.number().int(),
    z.string().transform((val) => {
      // 检查是否包含小数点
      if (val.includes(".")) throw new Error("Invalid integer");
      const num = parseInt(val, 10);
      if (isNaN(num)) throw new Error("Invalid integer");
      return num;
    }),
  ]),
  Float: z.union([
    z.number(),
    z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num)) throw new Error("Invalid float");
      return num;
    }),
  ]),
  boolean: z.union([
    z.boolean(),
    z.string().transform((val) => {
      if (val === "true") return true;
      if (val === "false") return false;
      throw new Error("Invalid boolean");
    }),
  ]),
  Boolean: z.union([
    z.boolean(),
    z.string().transform((val) => {
      if (val === "true") return true;
      if (val === "false") return false;
      throw new Error("Invalid boolean");
    }),
  ]),
  date: z.union([z.date(), z.string().transform((val) => new Date(val))]),
  Date: z.union([z.date(), z.string().transform((val) => new Date(val))]),
  email: z.string().email(),
  Email: z.string().email(),
  url: z.string().url(),
  URL: z.string().url(),
  uuid: z.string().uuid(),
  array: z.array(z.any()),
  Array: z.array(z.any()),
  Object: z.any(),
  object: z.object({}),
  any: z.any(),
  Any: z.any(),
  JSON: z.any(), // JSON 类型需要特殊处理
  JSONString: z.string(),
  ENUM: z.enum(["placeholder"]), // 占位符，实际使用时需要传入具体的枚举值
  IntArray: z.union([
    z.array(z.number().int()),
    z.string().transform((val) => {
      return val
        .split(",")
        .map((v) => parseInt(v.trim(), 10))
        .sort((a, b) => a - b);
    }),
  ]),
  StringArray: z.union([
    z.array(z.string()),
    z.string().transform((val) => {
      return val.split(",").map((v) => v.trim());
    }),
    z.array(z.any()).transform((arr) => arr.map((v) => String(v))),
  ]),
  NullableString: z.string().nullable(),
  NullableInteger: z
    .union([
      z.number().int(),
      z.string().transform((val) => {
        // 检查是否包含小数点
        if (val.includes(".")) throw new Error("Invalid integer");
        const num = parseInt(val, 10);
        if (isNaN(num)) throw new Error("Invalid integer");
        return num;
      }),
    ])
    .nullable(),
  MongoIdString: z.string().regex(/^[0-9a-fA-F]{24}$/),
  Domain: z.string(),
  Alpha: z.string().regex(/^[a-zA-Z]+$/),
  AlphaNumeric: z.string().regex(/^[a-zA-Z0-9]+$/),
  Ascii: z.string(),
  Base64: z.string(),
} as const;

// 类型转换函数
export function createZodSchema(typeInfo: ISchemaType | string): ZodType {
  if (typeof typeInfo === "string") {
    return zodTypeMap[typeInfo as keyof typeof zodTypeMap] || z.any();
  }

  let schema: ZodType;

  // 处理特殊类型
  if (typeInfo.type === "ENUM") {
    if (typeInfo.params && Array.isArray(typeInfo.params) && typeInfo.params.length > 0) {
      // 使用 z.union 来支持混合类型的枚举值（字符串和数字）
      const literals = typeInfo.params.map((value) => z.literal(value));
      schema = literals.length === 1 ? literals[0] : z.union([literals[0], ...literals.slice(1)]);
    } else {
      throw new Error("ENUM type requires params");
    }
  } else if (typeInfo.type === "Array" && typeInfo.params) {
    const itemSchema =
      typeof typeInfo.params === "string" ? createZodSchema(typeInfo.params) : createZodSchema(typeInfo.params);
    schema = z.array(itemSchema);
  } else if (typeInfo.type === "JSON") {
    // JSON 类型特殊处理
    schema = z.any();
  } else if (
    ["Number", "Integer", "Float"].includes(typeInfo.type) &&
    typeInfo.params &&
    typeof typeInfo.params === "object"
  ) {
    // 数值类型特殊处理：当有 min/max 参数时，需要创建支持 min/max 的基础 schema
    let baseSchema: any;
    if (typeInfo.type === "Number") {
      baseSchema = z.number();
    } else if (typeInfo.type === "Integer") {
      baseSchema = z.number().int();
    } else if (typeInfo.type === "Float") {
      baseSchema = z.number();
    } else {
      baseSchema = zodTypeMap[typeInfo.type as keyof typeof zodTypeMap] || z.any();
    }

    // 应用 min/max 约束
    if (typeInfo.params.min !== undefined) {
      baseSchema = baseSchema.min(typeInfo.params.min);
    }
    if (typeInfo.params.max !== undefined) {
      baseSchema = baseSchema.max(typeInfo.params.max);
    }

    // 为了保持与原有 union 类型的兼容性，仍然支持字符串输入
    schema = z.union([
      baseSchema,
      z.string().transform((val) => {
        const num = typeInfo.type === "Integer" ? parseInt(val, 10) : Number(val);
        if (isNaN(num)) throw new Error(`Invalid ${typeInfo.type.toLowerCase()}`);

        // 验证转换后的数值是否满足约束
        if (typeInfo.params.min !== undefined && num < typeInfo.params.min) {
          throw new Error(`Value ${num} is below minimum ${typeInfo.params.min}`);
        }
        if (typeInfo.params.max !== undefined && num > typeInfo.params.max) {
          throw new Error(`Value ${num} is above maximum ${typeInfo.params.max}`);
        }

        return num;
      }),
    ]);
  } else {
    schema = zodTypeMap[typeInfo.type as keyof typeof zodTypeMap] || z.any();
  }

  // 处理 format 属性
  if (typeInfo.format && typeInfo.type === "string") {
    // 可以根据 format 添加额外的验证
    // 这里保持原有行为，format 主要用于文档生成
  }

  // 处理默认值
  if (typeInfo.default !== undefined) {
    schema = (schema as any).default(typeInfo.default);
  }

  return schema;
}

const schemaDebug = create("params:schema");
const apiDebug = create("params:api");

export function paramsChecker(ctx: ERest<any>, name: string, input: any, typeInfo: ISchemaType): any {
  const { error } = ctx.privateInfo;

  try {
    // Array 类型特殊处理 - 需要处理元素的format属性
    if (typeInfo.type === "Array" && Array.isArray(input) && typeInfo.params) {
      const elementTypeInfo =
        typeof typeInfo.params === "string" ? ({ type: typeInfo.params } as ISchemaType) : typeInfo.params;

      // 对所有数组元素类型进行特殊处理
      const processedArray = input.map((item, index) => {
        try {
          return paramsChecker(ctx, `${name}[${index}]`, item, elementTypeInfo);
        } catch (e: any) {
          // 重新抛出错误，保持原有的错误格式
          throw e;
        }
      });
      return processedArray;
    }

    // JSON 类型特殊处理
    if (typeInfo.type === "JSON") {
      if (typeof input === "string") {
        try {
          const parsed = JSON.parse(input);
          return typeInfo.format !== false ? parsed : input;
        } catch (e) {
          throw error.invalidParameter(`'${name}' should be valid JSON`);
        }
      }
      return input;
    }

    // JSONString 类型特殊处理
    if (typeInfo.type === "JSONString") {
      if (typeof input === "string") {
        return typeInfo.format !== false ? input.trim() : input;
      }
      return String(input);
    }

    // Boolean 类型的format处理
    if (typeInfo.type === "Boolean" && typeInfo.format === false) {
      return String(input);
    }

    // TrimString 类型特殊处理
    if (typeInfo.type === "TrimString") {
      if (typeInfo.format === false) {
        return input;
      }
    }

    // 数字类型的format处理
    if (["Integer", "Float", "Number"].includes(typeInfo.type) && typeInfo.format === false) {
      return String(input);
    }

    // NullableInteger 类型的format处理
    if (typeInfo.type === "NullableInteger" && typeInfo.format === false) {
      return String(input);
    }

    const schema = createZodSchema(typeInfo);
    const result = schema.parse(input);
    debug("paramsChecker: ", input, "success", result);
    return result;
  } catch (zodError: any) {
    debug("paramsChecker: ", input, "failed", zodError.message);

    // 如果错误已经是我们自定义的参数错误（比如来自数组元素验证），直接重新抛出
    if (zodError.message && zodError.message.includes("incorrect parameter")) {
      throw zodError;
    }

    // 处理 Zod transform 函数抛出的错误
    if (zodError.message && typeof zodError.message === "string") {
      if (
        zodError.message.includes("Invalid integer") ||
        zodError.message.includes("Invalid number") ||
        zodError.message.includes("Invalid float")
      ) {
        throw error.invalidParameter(`'${name}' should be valid ${typeInfo.type}`);
      }
      if (zodError.message.includes("Invalid boolean")) {
        throw error.invalidParameter(`'${name}' should be valid ${typeInfo.type}`);
      }
    }

    // 处理 Zod 验证错误
    if (zodError.issues && zodError.issues.length > 0) {
      const err = zodError.issues[0];

      // ENUM 类型特殊错误消息
      if (
        typeInfo.type === "ENUM" &&
        typeInfo.params &&
        (err.code === "invalid_enum_value" || err.code === "invalid_union")
      ) {
        throw error.invalidParameter(
          `'${name}' should be valid ENUM with additional restrictions: ${typeInfo.params.join(",")}`
        );
      }

      // Array 类型错误处理
      if (typeInfo.type === "Array" && err.path && err.path.length > 0) {
        const pathStr = err.path.map((p: any) => `[${p}]`).join("");
        const elementType =
          typeof typeInfo.params === "string" ? typeInfo.params : (typeInfo.params && typeInfo.params.type) || "JSON";
        throw error.invalidParameter(`'${name}${pathStr}' should be valid ${elementType}`);
      }
    }

    // 生成统一的错误消息格式
    throw error.invalidParameter(`'${name}' should be valid ${typeInfo.type}`);
  }
}

export function schemaChecker<T extends Record<string, any>>(
  ctx: ERest<any>,
  data: T,
  schema: SchemaType | Record<string, ISchemaType>,
  requiredOneOf: string[] = []
) {
  const { error } = ctx.privateInfo;

  try {
    let zodSchema: ZodType;

    // 检测是否为原生 Zod Schema
    if (isZodSchema(schema)) {
      zodSchema = schema as ZodType;
    } else if (isISchemaTypeRecord(schema)) {
      // 将 Record<string, ISchemaType> 转换为 zod object schema
      const schemaFields: Record<string, ZodType> = {};
      for (const [key, typeInfo] of Object.entries(schema)) {
        // 创建基础schema，但不包含默认值（对于必填字段）
        let fieldSchema: ZodType;
        if (typeInfo.type === "ENUM") {
          if (typeInfo.params && Array.isArray(typeInfo.params)) {
            fieldSchema = z.enum(typeInfo.params as [string, ...string[]]);
          } else {
            throw new Error("ENUM type requires params");
          }
        } else if (typeInfo.type === "Array" && typeInfo.params) {
          const itemSchema =
            typeof typeInfo.params === "string"
              ? createZodSchema({ type: typeInfo.params } as ISchemaType)
              : createZodSchema(typeInfo.params);
          fieldSchema = z.array(itemSchema);
        } else {
          fieldSchema = zodTypeMap[typeInfo.type as keyof typeof zodTypeMap] || z.any();
        }

        // 处理数值类型的 min/max 参数
        if (
          ["Number", "Integer", "Float"].includes(typeInfo.type) &&
          typeInfo.params &&
          typeof typeInfo.params === "object"
        ) {
          // 为数值类型创建支持约束的基础 schema
          let baseSchema = typeInfo.type === "Integer" ? z.number().int() : z.number();

          // 应用 min/max 约束
          if (typeInfo.params.min !== undefined) {
            baseSchema = baseSchema.min(typeInfo.params.min);
          }
          if (typeInfo.params.max !== undefined) {
            baseSchema = baseSchema.max(typeInfo.params.max);
          }

          // 创建与原有 union 类型兼容的 schema
          fieldSchema = z.union([
            baseSchema,
            z
              .string()
              .transform((val) => {
                const num = Number(val);
                if (isNaN(num)) throw new Error("Invalid number");
                if (typeInfo.type === "Integer" && !Number.isInteger(num)) {
                  throw new Error("Invalid integer");
                }
                return num;
              })
              .pipe(baseSchema),
          ]);
        }

        // 处理默认值和可选字段
        if (typeInfo.default !== undefined) {
          fieldSchema = (fieldSchema as any).default(typeInfo.default);
        }
        if (!typeInfo.required) {
          fieldSchema = (fieldSchema as any).optional();
        }

        schemaFields[key] = fieldSchema;
      }
      zodSchema = z.object(schemaFields);
    } else {
      throw new Error("Invalid schema type");
    }

    const value = zodSchema.parse(data) as any;

    // 可选参数检查
    let req = requiredOneOf.length < 1;
    for (const name of requiredOneOf) {
      req = typeof value[name] !== "undefined";
      schemaDebug("requiredOneOf : %s - %s", name, req);
      if (req) break;
    }
    if (!req) throw error.missingParameter(`one of ${requiredOneOf.join(", ")} is required`);

    return value;
  } catch (zodError: any) {
    if (zodError.issues) {
      // 处理原生 Zod Schema 的错误
      if (isZodSchema(schema)) {
        // 对于原生 Zod Schema，直接处理 Zod 错误
        if (requiredOneOf.length > 0) {
          // 检查requiredOneOf中是否至少有一个字段存在
          const hasRequiredOneOf = requiredOneOf.some((fieldName) => {
            return !zodError.issues.some(
              (err: any) =>
                err.code === "invalid_type" && err.received === undefined && err.path.join(".") === fieldName
            );
          });

          if (!hasRequiredOneOf) {
            throw error.missingParameter(`one of ${requiredOneOf.join(", ")} is required`);
          }
        }

        // 处理原生 Zod Schema 的验证错误
        for (const err of zodError.issues) {
          const fieldName = err.path.join(".") || "value";

          if (err.code === "invalid_type" && err.received === undefined) {
            throw error.missingParameter(`'${fieldName}'`);
          } else {
            // 根据 Zod 错误类型生成合适的错误消息
            let errorMessage = `'${fieldName}' should be valid`;
            if (err.expected) {
              errorMessage += ` ${err.expected}`;
            }
            throw error.invalidParameter(errorMessage);
          }
        }
      } else {
        // 处理 ISchemaType 的错误（保持原有逻辑）
        const fieldSchema = schema as Record<string, ISchemaType>;

        // 如果有requiredOneOf参数，检查是否满足条件
        if (requiredOneOf.length > 0) {
          // 检查requiredOneOf中是否至少有一个字段存在
          const hasRequiredOneOf = requiredOneOf.some((fieldName) => {
            return !zodError.issues.some(
              (err: any) =>
                err.code === "invalid_type" && err.received === undefined && err.path.join(".") === fieldName
            );
          });

          if (!hasRequiredOneOf) {
            throw error.missingParameter(`one of ${requiredOneOf.join(", ")} is required`);
          }
        } else {
          // 如果没有requiredOneOf，优先检查必填字段缺失
          for (const err of zodError.issues) {
            let fieldName: string | undefined;
            let isUndefinedError = false;

            if (err.code === "invalid_type" && err.received === undefined) {
              fieldName = err.path.join(".");
              isUndefinedError = true;
            } else if (err.code === "invalid_union" && err.path.length > 0) {
              // 检查union错误中是否包含undefined类型错误
              const hasUndefinedError = err.errors?.some((errorGroup: any[]) =>
                errorGroup.some((e: any) => e.code === "invalid_type" && e.received === undefined)
              );
              if (hasUndefinedError) {
                fieldName = err.path.join(".");
                isUndefinedError = true;
              }
            }

            if (isUndefinedError && fieldName) {
              const fieldInfo = fieldSchema[fieldName];
              if (fieldInfo && fieldInfo.required && fieldInfo.default === undefined) {
                throw error.missingParameter(`'${fieldName}'`);
              }
            }
          }
        }

        // 然后处理其他类型的错误
        for (const err of zodError.issues) {
          const fieldName = err.path.join(".");
          const fieldInfo = fieldSchema[fieldName];

          // 跳过已经处理过的undefined错误
          if (
            (err.code === "invalid_type" && err.received === undefined) ||
            (err.code === "invalid_union" &&
              err.errors?.some((errorGroup: any[]) =>
                errorGroup.some((e: any) => e.code === "invalid_type" && e.received === undefined)
              ))
          ) {
            // 如果是缺失字段但不是必填字段（或有默认值），报告类型错误
            if (!fieldInfo || !fieldInfo.required || fieldInfo.default !== undefined) {
              const fieldType = fieldInfo?.type || "unknown";
              throw error.invalidParameter(`'${fieldName}' should be valid ${fieldType}`);
            }
            // 必填字段缺失的情况已经在上面处理了，这里不应该到达
          } else {
            // 处理其他类型的错误（类型不匹配等）
            const fieldType = fieldInfo?.type || "unknown";
            throw error.invalidParameter(`'${fieldName}' should be valid ${fieldType}`);
          }
        }
      }
    }
    // 处理 transform 函数抛出的错误
    if (zodError.message && typeof zodError.message === "string") {
      if (isZodSchema(schema)) {
        // 对于原生 Zod Schema，直接使用错误消息
        throw error.invalidParameter(zodError.message);
      } else {
        // 尝试从错误消息中提取字段信息
        const fieldNames = Object.keys(schema as Record<string, ISchemaType>);
        for (const fieldName of fieldNames) {
          const fieldSchema = schema as Record<string, ISchemaType>;
          const fieldType = fieldSchema[fieldName]?.type;
          if (fieldType && zodError.message.includes("Invalid")) {
            throw error.invalidParameter(`'${fieldName}' should be valid ${fieldType}`);
          }
        }
      }
    }
    throw error.invalidParameter(JSON.stringify(zodError.issues || zodError.message));
  }
}

export function responseChecker<T extends Record<string, any>>(
  ctx: ERest<any>,
  data: T,
  schema: ISchemaType | SchemaType | Record<string, ISchemaType>
) {
  try {
    let zodSchema: ZodType;

    // 检测是否为原生 Zod Schema
    if (isZodSchema(schema)) {
      zodSchema = schema as ZodType;
    } else if (isISchemaType(schema)) {
      zodSchema = createZodSchema(schema as ISchemaType);
    } else if (isISchemaTypeRecord(schema)) {
      // 将 Record<string, ISchemaType> 转换为 zod object schema
      const schemaFields: Record<string, ZodType> = {};
      for (const [key, typeInfo] of Object.entries(schema as Record<string, ISchemaType>)) {
        schemaFields[key] = createZodSchema(typeInfo);
      }
      zodSchema = z.object(schemaFields);
    } else {
      throw new Error("Invalid schema type");
    }

    const value = zodSchema.parse(data);
    return { ok: true, message: "success", value };
  } catch (zodError: any) {
    // 响应验证失败时返回原始数据，避免破坏正常流程
    debug("responseChecker failed:", zodError.message);
    return data;
  }
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

  // 检查 params - 支持原生 Zod Schema 和 ISchemaType
  if (schema.options.paramsSchema && params) {
    const res = schemaChecker(ctx, params, schema.options.paramsSchema);
    Object.assign(newParams, res);
  } else if (schema.options.params && params && Object.keys(schema.options.params).length > 0) {
    const res = schemaChecker(ctx, params, schema.options.params);
    Object.assign(newParams, res);
  }

  // 检查 query - 支持原生 Zod Schema 和 ISchemaType
  if (schema.options.querySchema && query) {
    const res = schemaChecker(ctx, query, schema.options.querySchema);
    Object.assign(newParams, res);
  } else if (schema.options.query && query && Object.keys(schema.options.query).length > 0) {
    const res = schemaChecker(ctx, query, schema.options.query);
    Object.assign(newParams, res);
  }

  // 检查 body - 支持原生 Zod Schema 和 ISchemaType
  if (schema.options.bodySchema && body) {
    const res = schemaChecker(ctx, body, schema.options.bodySchema);
    Object.assign(newParams, res);
  } else if (schema.options.body && body && Object.keys(schema.options.body).length > 0) {
    const res = schemaChecker(ctx, body, schema.options.body);
    Object.assign(newParams, res);
  }

  // 检查 headers - 支持原生 Zod Schema 和 ISchemaType
  if (schema.options.headersSchema && headers) {
    const res = schemaChecker(ctx, headers, schema.options.headersSchema);
    Object.assign(newParams, res);
  } else if (schema.options.headers && headers && Object.keys(schema.options.headers).length > 0) {
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
