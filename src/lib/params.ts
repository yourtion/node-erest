/**
 * @file API 参数检测
 * 基于 zod 实现
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import { type ZodType, z } from "zod";
import type API from "./api.js";
import { create, params as debug } from "./debug.js";
import type ERest from "./index.js";

/**
 * 检测是否为 Zod Schema
 */
export function isZodSchema(obj: unknown): obj is ZodType {
  if (!obj || typeof obj !== "object") return false;
  const objTyped = obj as Record<string, unknown>;
  return "_def" in objTyped && !!objTyped._def && typeof objTyped.parse === "function";
}

/**
 * 检测是否为 ISchemaType 对象
 */
export function isISchemaType(obj: unknown): obj is ISchemaType {
  if (!obj || typeof obj !== "object") return false;
  return typeof (obj as Record<string, unknown>).type === "string" && !isZodSchema(obj);
}

/**
 * 检测是否为 ISchemaType 对象的集合
 */
export function isISchemaTypeRecord(obj: unknown): obj is Record<string, ISchemaType> {
  if (!obj || typeof obj !== "object" || isZodSchema(obj)) {
    return false;
  }
  return Object.values(obj).every((value) => isISchemaType(value));
}

export interface ISchemaType {
  type: string;
  comment?: string;
  format?: boolean;
  default?: unknown;
  required?: boolean;
  params?: unknown;
}

// 数值类型参数接口
export interface INumericParams {
  min?: number;
  max?: number;
}

// 枚举类型参数接口
export interface IEnumParams extends Array<string | number> {}

// 数组类型参数接口
export type IArrayParams = string | ISchemaType;

// Zod schema type alias
export type SchemaType<T = unknown> = ZodType<T>;

// ResponseChecker 返回结果类型
export interface ResponseCheckResult<T = unknown> {
  ok: boolean;
  message: string;
  value: T;
}

// 基础类型映射
export const zodTypeMap = {
  string: z.string(),
  String: z.string(),
  TrimString: z.string().transform((val) => val.trim()),
  number: z.union([
    z.number(),
    z.string().transform((val) => {
      const num = Number(val);
      if (Number.isNaN(num)) throw new Error("Invalid number");
      return num;
    }),
  ]),
  Number: z.union([
    z.number(),
    z.string().transform((val) => {
      const num = Number(val);
      if (Number.isNaN(num)) throw new Error("Invalid number");
      return num;
    }),
  ]),
  Integer: z.union([
    z.number().int(),
    z.string().transform((val) => {
      // 检查是否包含小数点
      if (val.includes(".")) throw new Error("Invalid integer");
      const num = parseInt(val, 10);
      if (Number.isNaN(num)) throw new Error("Invalid integer");
      return num;
    }),
  ]),
  Float: z.union([
    z.number(),
    z.string().transform((val) => {
      const num = parseFloat(val);
      if (Number.isNaN(num)) throw new Error("Invalid float");
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
        if (Number.isNaN(num)) throw new Error("Invalid integer");
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
      typeof typeInfo.params === "string"
        ? createZodSchema({ type: typeInfo.params } as ISchemaType)
        : createZodSchema(typeInfo.params as ISchemaType);
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
    const numericParams = typeInfo.params as INumericParams;
    let baseSchema: z.ZodNumber;
    if (typeInfo.type === "Number") {
      baseSchema = z.number();
    } else if (typeInfo.type === "Integer") {
      baseSchema = z.number().int();
    } else if (typeInfo.type === "Float") {
      baseSchema = z.number();
    } else {
      baseSchema = z.number();
    }

    // 应用 min/max 约束
    if (numericParams.min !== undefined) {
      baseSchema = baseSchema.min(numericParams.min);
    }
    if (numericParams.max !== undefined) {
      baseSchema = baseSchema.max(numericParams.max);
    }

    // 为了保持与原有 union 类型的兼容性，仍然支持字符串输入
    schema = z.union([
      baseSchema,
      z.string().transform((val) => {
        const num = typeInfo.type === "Integer" ? parseInt(val, 10) : Number(val);
        if (Number.isNaN(num)) throw new Error(`Invalid ${typeInfo.type.toLowerCase()}`);

        // 验证转换后的数值是否满足约束
        const numericParams = typeInfo.params as INumericParams;
        if (numericParams.min !== undefined && num < numericParams.min) {
          throw new Error(`Value ${num} is below minimum ${numericParams.min}`);
        }
        if (numericParams.max !== undefined && num > numericParams.max) {
          throw new Error(`Value ${num} is above maximum ${numericParams.max}`);
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
    schema = schema.default(typeInfo.default);
  }

  return schema;
}

const schemaDebug = create("params:schema");
const apiDebug = create("params:api");

/**
 * 从 ISchemaType Record 构建预编译的 ZodObject
 * 用于 API.init() 阶段预编译，提升运行时性能
 */
export function buildZodObjectFromSchemaType(schema: Record<string, ISchemaType>): z.ZodObject<z.ZodRawShape> {
  const schemaFields: Record<string, ZodType> = {};

  for (const [key, typeInfo] of Object.entries(schema)) {
    let fieldSchema: ZodType;

    if (typeInfo.type === "ENUM") {
      if (typeInfo.params && Array.isArray(typeInfo.params)) {
        const literals = typeInfo.params.map((value) => z.literal(value));
        fieldSchema = literals.length === 1 ? literals[0] : z.union([literals[0], ...literals.slice(1)]);
      } else {
        throw new Error("ENUM type requires params");
      }
    } else if (typeInfo.type === "Array" && typeInfo.params) {
      const itemSchema =
        typeof typeInfo.params === "string"
          ? createZodSchema({ type: typeInfo.params } as ISchemaType)
          : createZodSchema(typeInfo.params as ISchemaType);
      fieldSchema = z.array(itemSchema);
    } else if (
      ["Number", "Integer", "Float"].includes(typeInfo.type) &&
      typeInfo.params &&
      typeof typeInfo.params === "object"
    ) {
      let baseSchema = typeInfo.type === "Integer" ? z.number().int() : z.number();
      const numericParams = typeInfo.params as INumericParams;
      if (numericParams.min !== undefined) {
        baseSchema = baseSchema.min(numericParams.min);
      }
      if (numericParams.max !== undefined) {
        baseSchema = baseSchema.max(numericParams.max);
      }
      fieldSchema = z.union([
        baseSchema,
        z
          .string()
          .transform((val) => {
            const num = Number(val);
            if (Number.isNaN(num)) throw new Error("Invalid number");
            if (typeInfo.type === "Integer" && !Number.isInteger(num)) {
              throw new Error("Invalid integer");
            }
            return num;
          })
          .pipe(baseSchema),
      ]);
    } else {
      fieldSchema = zodTypeMap[typeInfo.type as keyof typeof zodTypeMap] || z.any();
    }

    if (typeInfo.default !== undefined) {
      fieldSchema = (fieldSchema as z.ZodType).default(typeInfo.default);
    }
    if (!typeInfo.required) {
      fieldSchema = (fieldSchema as z.ZodType).optional();
    }

    schemaFields[key] = fieldSchema;
  }

  return z.object(schemaFields);
}

export function paramsChecker(ctx: ERest<unknown>, name: string, input: unknown, typeInfo: ISchemaType): unknown {
  const { error } = ctx.privateInfo;

  try {
    // Array 类型特殊处理 - 需要处理元素的format属性
    if (typeInfo.type === "Array" && Array.isArray(input) && typeInfo.params) {
      const _elementTypeInfo =
        typeof typeInfo.params === "string" ? ({ type: typeInfo.params } as ISchemaType) : typeInfo.params;

      // 对所有数组元素类型进行特殊处理
      const processedArray = input.map((item, index) => {
        const elementTypeInfo: ISchemaType =
          typeof typeInfo.params === "string" ? { type: typeInfo.params } : (typeInfo.params as ISchemaType);
        return paramsChecker(ctx, `${name}[${index}]`, item, elementTypeInfo);
      });
      return processedArray;
    }

    // JSON 类型特殊处理
    if (typeInfo.type === "JSON") {
      if (typeof input === "string") {
        try {
          const parsed = JSON.parse(input);
          return typeInfo.format !== false ? parsed : input;
        } catch (_e) {
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
  } catch (zodError: unknown) {
    debug("paramsChecker: ", input, "failed", (zodError as Error).message);

    // 如果错误已经是我们自定义的参数错误（比如来自数组元素验证），直接重新抛出
    if ((zodError as Error).message?.includes("incorrect parameter")) {
      throw zodError;
    }

    // 处理 Zod transform 函数抛出的错误
    if ((zodError as Error).message && typeof (zodError as Error).message === "string") {
      if (
        (zodError as Error).message.includes("Invalid integer") ||
        (zodError as Error).message.includes("Invalid number") ||
        (zodError as Error).message.includes("Invalid float")
      ) {
        throw error.invalidParameter(`'${name}' should be valid ${typeInfo.type}`);
      }
      if ((zodError as Error).message.includes("Invalid boolean")) {
        throw error.invalidParameter(`'${name}' should be valid ${typeInfo.type}`);
      }
    }

    // 处理 Zod 验证错误
    interface ZodErrorWithIssues {
      issues?: Array<{
        code: string;
        path?: unknown[];
        message?: string;
      }>;
    }

    const zodErr = zodError as ZodErrorWithIssues;
    if (zodErr.issues && zodErr.issues.length > 0) {
      const err = zodErr.issues[0];

      // ENUM 类型特殊错误消息
      if (
        typeInfo.type === "ENUM" &&
        typeInfo.params &&
        (err.code === "invalid_enum_value" || err.code === "invalid_union")
      ) {
        const enumParams = typeInfo.params as IEnumParams;
        throw error.invalidParameter(
          `'${name}' should be valid ENUM with additional restrictions: ${enumParams.join(",")}`
        );
      }

      // Array 类型错误处理
      if (typeInfo.type === "Array" && err.path && err.path.length > 0) {
        const pathStr = err.path.map((p: unknown) => `[${p}]`).join("");
        const elementType =
          typeof typeInfo.params === "string" ? typeInfo.params : (typeInfo.params as ISchemaType)?.type || "JSON";
        throw error.invalidParameter(`'${name}${pathStr}' should be valid ${elementType}`);
      }
    }

    // 生成统一的错误消息格式
    throw error.invalidParameter(`'${name}' should be valid ${typeInfo.type}`);
  }
}

export function schemaChecker<T extends Record<string, unknown>>(
  ctx: ERest<unknown>,
  data: T,
  schema: SchemaType | Record<string, ISchemaType>,
  requiredOneOf: string[] = [],
  originalSchemaType?: Record<string, ISchemaType>
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
              : createZodSchema(typeInfo.params as ISchemaType);
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
          const numericParams = typeInfo.params as INumericParams;
          if (numericParams.min !== undefined) {
            baseSchema = baseSchema.min(numericParams.min);
          }
          if (numericParams.max !== undefined) {
            baseSchema = baseSchema.max(numericParams.max);
          }

          // 创建与原有 union 类型兼容的 schema
          fieldSchema = z.union([
            baseSchema,
            z
              .string()
              .transform((val) => {
                const num = Number(val);
                if (Number.isNaN(num)) throw new Error("Invalid number");
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
          fieldSchema = (fieldSchema as z.ZodType).default(typeInfo.default);
        }
        if (!typeInfo.required) {
          fieldSchema = (fieldSchema as z.ZodType).optional();
        }

        schemaFields[key] = fieldSchema;
      }
      zodSchema = z.object(schemaFields);
    } else {
      throw new Error("Invalid schema type");
    }

    const value = zodSchema.parse(data) as Record<string, unknown>;

    // 可选参数检查
    let req = requiredOneOf.length < 1;
    for (const name of requiredOneOf) {
      req = typeof value[name] !== "undefined";
      schemaDebug("requiredOneOf : %s - %s", name, req);
      if (req) break;
    }
    if (!req) throw error.missingParameter(`one of ${requiredOneOf.join(", ")} is required`);

    return value;
  } catch (zodError: unknown) {
    const zodErr = zodError as {
      issues?: Array<{ code: string; received?: unknown; path: string[]; expected?: string; errors?: unknown[] }>;
    };
    if (zodErr.issues) {
      // 处理原生 Zod Schema 的错误
      if (isZodSchema(schema)) {
        // 如果有原始 ISchemaType 信息，使用它来生成更好的错误消息
        const fieldSchema = originalSchemaType || {};

        // 对于原生 Zod Schema，直接处理 Zod 错误
        if (requiredOneOf.length > 0) {
          // 检查requiredOneOf中是否至少有一个字段存在
          const hasRequiredOneOf = requiredOneOf.some((fieldName) => {
            return !zodErr.issues?.some(
              (err) => err.code === "invalid_type" && err.received === undefined && err.path.join(".") === fieldName
            );
          });

          if (!hasRequiredOneOf) {
            throw error.missingParameter(`one of ${requiredOneOf.join(", ")} is required`);
          }
        }

        // 处理原生 Zod Schema 的验证错误
        for (const err of zodErr.issues || []) {
          const fieldName = err.path.join(".") || "value";
          const fieldInfo = fieldSchema[fieldName];

          if (err.code === "invalid_type" && err.received === undefined) {
            throw error.missingParameter(`'${fieldName}'`);
          } else {
            // 如果有原始类型信息，使用它
            if (fieldInfo?.type) {
              throw error.invalidParameter(`'${fieldName}' should be valid ${fieldInfo.type}`);
            }
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
            return !(zodErr.issues || []).some(
              (err) => err.code === "invalid_type" && err.received === undefined && err.path.join(".") === fieldName
            );
          });

          if (!hasRequiredOneOf) {
            throw error.missingParameter(`one of ${requiredOneOf.join(", ")} is required`);
          }
        } else {
          // 如果没有requiredOneOf，优先检查必填字段缺失
          for (const err of zodErr.issues || []) {
            let fieldName: string | undefined;
            let isUndefinedError = false;

            if (err.code === "invalid_type" && err.received === undefined) {
              fieldName = err.path.join(".");
              isUndefinedError = true;
            } else if (err.code === "invalid_union" && err.path.length > 0) {
              // 检查union错误中是否包含undefined类型错误
              const hasUndefinedError = err.errors?.some(
                (errorGroup: unknown) =>
                  Array.isArray(errorGroup) &&
                  errorGroup.some(
                    (e: { code?: string; received?: unknown }) => e.code === "invalid_type" && e.received === undefined
                  )
              );
              if (hasUndefinedError) {
                fieldName = err.path.join(".");
                isUndefinedError = true;
              }
            }

            if (isUndefinedError && fieldName) {
              const fieldInfo = fieldSchema[fieldName];
              if (fieldInfo?.required && fieldInfo.default === undefined) {
                throw error.missingParameter(`'${fieldName}'`);
              }
            }
          }
        }

        // 然后处理其他类型的错误
        for (const err of zodErr.issues || []) {
          const fieldName = err.path.join(".");
          const fieldInfo = fieldSchema[fieldName];

          // 跳过已经处理过的undefined错误
          if (
            (err.code === "invalid_type" && err.received === undefined) ||
            (err.code === "invalid_union" &&
              err.errors?.some(
                (errorGroup: unknown) =>
                  Array.isArray(errorGroup) &&
                  errorGroup.some(
                    (e: { code?: string; received?: unknown }) => e.code === "invalid_type" && e.received === undefined
                  )
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
    const zodErrWithMessage = zodError as { message?: string };
    if (zodErrWithMessage.message && typeof zodErrWithMessage.message === "string") {
      // 获取字段信息源：优先使用 originalSchemaType，否则尝试从 schema 获取
      const fieldSchemaSource = originalSchemaType || (isISchemaTypeRecord(schema) ? schema : null);

      if (fieldSchemaSource) {
        // 尝试从错误消息中提取字段信息
        const fieldNames = Object.keys(fieldSchemaSource);
        for (const fieldName of fieldNames) {
          const fieldType = fieldSchemaSource[fieldName]?.type;
          if (fieldType && zodErrWithMessage.message.includes("Invalid")) {
            throw error.invalidParameter(`'${fieldName}' should be valid ${fieldType}`);
          }
        }
      }

      // 如果无法匹配字段，直接使用原始错误消息
      throw error.invalidParameter(zodErrWithMessage.message);
    }
    throw error.invalidParameter(JSON.stringify(zodErr.issues || zodErrWithMessage.message));
  }
}

export function responseChecker<T extends Record<string, unknown>>(
  _ctx: ERest<unknown>,
  data: T,
  schema: ISchemaType | SchemaType | Record<string, ISchemaType>
): ResponseCheckResult<T> {
  try {
    let zodSchema: ZodType;

    // 检测是否为原生 Zod Schema
    if (isZodSchema(schema)) {
      zodSchema = schema as ZodType;
    } else if (isISchemaType(schema)) {
      zodSchema = createZodSchema(schema as ISchemaType);
    } else if (isISchemaTypeRecord(schema)) {
      // 将 Record<string, ISchemaType> 转换为 zod object schema
      zodSchema = buildZodObjectFromSchemaType(schema as Record<string, ISchemaType>);
    } else {
      return { ok: false, message: "Invalid schema type", value: data };
    }

    const result = zodSchema.safeParse(data);
    if (result.success) {
      return { ok: true, message: "success", value: result.data as T };
    }

    // 统一返回失败结构
    const errorMessage = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    debug("responseChecker failed:", errorMessage);
    return { ok: false, message: errorMessage, value: data };
  } catch (error: unknown) {
    debug("responseChecker error:", (error as { message?: string }).message);
    return { ok: false, message: (error as Error).message || "Unknown error", value: data };
  }
}

/** 分层校验后的参数（按来源区分，registerTyped 读取此结构以获得类型安全） */
export interface LayeredParams {
  params: Record<string, unknown>;
  query: Record<string, unknown>;
  body: Record<string, unknown>;
  headers: Record<string, unknown>;
}

/** 校验结果：扁平参数（向后兼容 $params）+ 分层参数（registerTyped 使用） */
export interface ParamsCheckResult {
  /** 扁平合并的校验后参数（params+query+body+headers） */
  flat: Record<string, unknown>;
  /** 分层校验后参数（按来源区分） */
  layered: LayeredParams;
}

/**
 * API 参数检查
 *
 * 返回扁平 + 分层两种结果：
 * - flat：params+query+body+headers 扁平合并，向后兼容旧版 `$params`（注入到 req.$params / ctx.$params / ctx.request.$params）
 * - layered：按来源分层，registerTyped 的 handler 通过它获得类型安全的 req.body / req.query / req.params / req.headers
 */
export function apiParamsCheck(
  ctx: ERest<unknown>,
  schema: API<unknown>,
  params?: Record<string, unknown>,
  query?: Record<string, unknown>,
  body?: Record<string, unknown>,
  headers?: Record<string, unknown>
): ParamsCheckResult {
  const { error } = ctx.privateInfo;
  const newParams: Record<string, unknown> = {};
  const layered: LayeredParams = { params: {}, query: {}, body: {}, headers: {} };

  // 检查 params - 支持原生 Zod Schema 和 ISchemaType
  if (schema.options.paramsSchema && params) {
    const originalParams = schema.options.params as Record<string, ISchemaType> | undefined;
    const res = schemaChecker(ctx, params, schema.options.paramsSchema, [], originalParams);
    Object.assign(newParams, res);
    Object.assign(layered.params, res);
  } else if (schema.options.params && params && Object.keys(schema.options.params).length > 0) {
    const res = schemaChecker(ctx, params, schema.options.params as Record<string, ISchemaType>);
    Object.assign(newParams, res);
    Object.assign(layered.params, res);
  }

  // 检查 query - 支持原生 Zod Schema 和 ISchemaType
  if (schema.options.querySchema && query) {
    const originalQuery = schema.options.query as Record<string, ISchemaType> | undefined;
    const res = schemaChecker(ctx, query, schema.options.querySchema, [], originalQuery);
    Object.assign(newParams, res);
    Object.assign(layered.query, res);
  } else if (schema.options.query && query && Object.keys(schema.options.query).length > 0) {
    const res = schemaChecker(ctx, query, schema.options.query as Record<string, ISchemaType>);
    Object.assign(newParams, res);
    Object.assign(layered.query, res);
  }

  // 检查 body - 支持原生 Zod Schema 和 ISchemaType
  if (schema.options.bodySchema && body) {
    const originalBody = schema.options.body as Record<string, ISchemaType> | undefined;
    const res = schemaChecker(ctx, body, schema.options.bodySchema, [], originalBody);
    Object.assign(newParams, res);
    Object.assign(layered.body, res);
  } else if (schema.options.body && body && Object.keys(schema.options.body).length > 0) {
    const res = schemaChecker(ctx, body, schema.options.body as Record<string, ISchemaType>);
    Object.assign(newParams, res);
    Object.assign(layered.body, res);
  }

  // 检查 headers - 支持原生 Zod Schema 和 ISchemaType
  if (schema.options.headersSchema && headers) {
    const originalHeaders = schema.options.headers as Record<string, ISchemaType> | undefined;
    const res = schemaChecker(ctx, headers, schema.options.headersSchema, [], originalHeaders);
    Object.assign(newParams, res);
    Object.assign(layered.headers, res);
  } else if (schema.options.headers && headers && Object.keys(schema.options.headers).length > 0) {
    const res = schemaChecker(ctx, headers, schema.options.headers as Record<string, ISchemaType>);
    Object.assign(newParams, res);
    Object.assign(layered.headers, res);
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

  return { flat: newParams, layered };
}
