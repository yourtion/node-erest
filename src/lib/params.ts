/**
 * @file API 参数检测（Stage 1：Zod 唯一）
 *
 * v3.0 起 ISchemaType 双轨体系已移除，原生 Zod 为唯一参数定义方式。
 * 本文件保留：zodTypeMap（类型别名表，文档/注册复用）+ compileValidate（热路径零分配预编译）。
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import { type ZodType, z } from "zod";
import type ERest from "./index.js";

/** 检测是否为 Zod Schema（文档生成复用） */
export function isZodSchema(obj: unknown): obj is ZodType {
  if (!obj || typeof obj !== "object") return false;
  const objTyped = obj as Record<string, unknown>;
  return "_def" in objTyped && !!objTyped._def && typeof objTyped.parse === "function";
}

// Zod schema type alias
export type SchemaType<T = unknown> = ZodType<T>;

// ResponseChecker 返回结果类型（response schema 校验用）
export interface ResponseCheckResult<T = unknown> {
  ok: boolean;
  message: string;
  value: T;
}

/**
 * 基础类型映射表。
 *
 * v3.0 起仅作为「类型别名」导出，供 erest.type.register 与文档生成的 $ref 复用，
 * 不再作为参数定义路径——用户直接用 z.string() / z.coerce.number() 等原生 Zod。
 */
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
  JSON: z.any(),
  JSONString: z.string(),
  ENUM: z.enum(["placeholder"]),
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

// ============ Stage 1: 预编译校验（热路径零分配） ============

/** 分层校验后的参数（按来源区分，registerTyped 读取此结构以获得类型安全） */
export interface LayeredParams {
  params: Record<string, unknown>;
  query: Record<string, unknown>;
  body: Record<string, unknown>;
  headers: Record<string, unknown>;
}

/** 预编译的校验 schema 集合 */
export interface CompiledSchemas {
  paramsSchema?: ZodType;
  querySchema?: ZodType;
  bodySchema?: ZodType;
  headersSchema?: ZodType;
}

/** 预编译的校验执行器：输入原始分层输入，输出校验后分层参数或抛 ERestError */
export interface CompiledRoute extends CompiledSchemas {
  validate: (input: {
    params?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: unknown;
    headers?: Record<string, unknown>;
  }) => LayeredParams;
}

/** 错误工厂接口（compileValidate 只依赖这两个方法，解耦 ERest） */
export interface ValidationErrorFactory {
  missingParameter: (msg: string) => Error;
  invalidParameter: (msg: string) => Error;
}

/**
 * 把 Zod schema 集合预编译为热路径零分配的 validate 闭包。
 *
 * 闭包在编译期据 schema 有无裁剪分支：热路径只调用存在的层，
 * 直接构造字面量返回，无 Object.assign、无临时 z.object 构造。
 *
 * 错误消息兼容现有形态：
 * - 缺失必填 → "missing required parameter 'field'"
 * - 类型错误 → "'field' should be valid"
 */
export function compileValidate(errorFactory: ValidationErrorFactory, schemas: CompiledSchemas): CompiledRoute {
  const { paramsSchema, querySchema, bodySchema, headersSchema } = schemas;

  // Zod 4 的 issue：缺失字段 message 含 "received undefined"（含 union 嵌套 errors），
  // 类型错误含具体 received 值。
  const isMissing = (issue: { code: string; message?: string; errors?: unknown[] }): boolean => {
    if (issue.message?.includes("received undefined")) return true;
    if (issue.code === "invalid_union" && Array.isArray(issue.errors)) {
      return issue.errors.some((branch) =>
        Array.isArray(branch)
          ? branch.some((e: { message?: string }) => e.message?.includes("received undefined"))
          : false
      );
    }
    return false;
  };

  const makeParse =
    (schema: ZodType) =>
    (input: unknown): Record<string, unknown> => {
      const result = schema.safeParse(input);
      if (result.success) return result.data as Record<string, unknown>;
      const issue = result.error.issues[0];
      const field = (issue.path[0] as string) ?? "value";
      if (isMissing(issue as never)) {
        throw errorFactory.missingParameter(`'${field}'`);
      }
      throw errorFactory.invalidParameter(`'${field}' should be valid`);
    };

  // 闭包裁剪：只为存在的层组装校验调用（无该层 schema 时该分支为常量 {}）
  const paramsParse = paramsSchema ? makeParse(paramsSchema) : undefined;
  const queryParse = querySchema ? makeParse(querySchema) : undefined;
  const bodyParse = bodySchema ? makeParse(bodySchema) : undefined;
  const headersParse = headersSchema ? makeParse(headersSchema) : undefined;

  const validate: CompiledRoute["validate"] = (input) => ({
    params: paramsParse && input.params ? paramsParse(input.params) : {},
    query: queryParse && input.query ? queryParse(input.query) : {},
    body: bodyParse && input.body !== undefined ? bodyParse(input.body) : {},
    headers: headersParse && input.headers ? headersParse(input.headers) : {},
  });

  return { paramsSchema, querySchema, bodySchema, headersSchema, validate };
}

/**
 * response schema 校验（独立于请求参数，用于 registerTyped 的返回值校验）。
 * 输入必须是 ZodType。
 */
export function responseChecker<T extends Record<string, unknown>>(
  _ctx: ERest<unknown>,
  data: T,
  schema: ZodType
): ResponseCheckResult<T> {
  try {
    const result = schema.safeParse(data);
    if (result.success) {
      return { ok: true, message: "success", value: result.data as T };
    }
    const errorMessage = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return { ok: false, message: errorMessage, value: data };
  } catch (error) {
    return { ok: false, message: (error as Error).message || "Unknown error", value: data };
  }
}
