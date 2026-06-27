/**
 * @file Zod schema → 文档字段元信息提取
 *
 * Stage 1：统一 Zod schema 到文档字段信息的转换，消除 markdown/swagger 两处
 * 手写 _def.typeName switch 的重复。阶段 2 会进一步充实（支持更多 Zod 类型）。
 */

import type { ZodTypeAny } from "zod";
import { isZodSchema } from "../params.js";

/** 文档字段元信息 */
export interface DocField {
  /** 字段名 */
  name: string;
  /** 位置：params/query/body/headers */
  place: string;
  /** 推断的类型名（string/number/boolean/array/object/enum/date） */
  type: string;
  /** 是否必填（非 optional） */
  required: boolean;
  /** 描述（取自 Zod .describe()） */
  comment?: string;
  /** enum 取值（当 type 为 enum） */
  enumValues?: string[];
  /** 格式提示（如 date-time） */
  format?: string;
}

/** 从单个 Zod 类型推断文档类型名 */
function inferTypeName(schema: ZodTypeAny): { type: string; enumValues?: string[]; format?: string } {
  const def = (schema as { _def?: { typeName?: string } })._def;
  const typeName = def?.typeName;
  switch (typeName) {
    case "ZodString":
      return { type: "string" };
    case "ZodNumber":
      return { type: "number" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodDate":
      return { type: "date", format: "date-time" };
    case "ZodArray":
      return { type: "array" };
    case "ZodEnum": {
      const values = (schema as { _def?: { values?: unknown[] } })._def?.values;
      return { type: "enum", enumValues: Array.isArray(values) ? values.map(String) : undefined };
    }
    case "ZodObject":
      return { type: "object" };
    case "ZodOptional":
    case "ZodDefault":
    case "ZodNullable": {
      const inner = (schema as { _def?: { innerType?: ZodTypeAny } })._def?.innerType;
      return inner ? inferTypeName(inner) : { type: "unknown" };
    }
    case "ZodEffects":
    case "ZodPipeline": {
      const inner = (schema as { _def?: { schema?: ZodTypeAny; in?: ZodTypeAny } })._def?.schema;
      const inSchema = (schema as { _def?: { in?: ZodTypeAny } })._def?.in;
      const target = inner ?? inSchema;
      return target ? inferTypeName(target) : { type: "unknown" };
    }
    case "ZodUnion": {
      // union 简化为首个分支类型
      const options = (schema as { _def?: { options?: ZodTypeAny[] } })._def?.options;
      return options && options.length > 0 ? inferTypeName(options[0]) : { type: "unknown" };
    }
    default:
      return { type: typeName ? String(typeName).replace(/^Zod/, "").toLowerCase() : "unknown" };
  }
}

/** 判断字段是否必填（未被 ZodOptional/ZodDefault 包裹） */
function isRequired(schema: ZodTypeAny): boolean {
  const typeName = (schema as { _def?: { typeName?: string } })._def?.typeName;
  return typeName !== "ZodOptional" && typeName !== "ZodDefault";
}

/** 取 Zod .describe() 描述 */
function getDescription(schema: ZodTypeAny): string | undefined {
  return (schema as { description?: string }).description;
}

/** 从 ZodObject 提取字段元信息列表 */
export function extractDocFields(schema: unknown, place: string): DocField[] {
  if (!isZodSchema(schema)) return [];
  const shape = (schema as { _def?: { shape?: Record<string, ZodTypeAny> } })._def?.shape;
  if (!shape) return [];
  return Object.entries(shape).map(([name, fieldSchema]) => {
    const { type, enumValues, format } = inferTypeName(fieldSchema);
    return {
      name,
      place,
      type,
      required: isRequired(fieldSchema),
      comment: getDescription(fieldSchema),
      enumValues,
      format,
    };
  });
}

/** 获取 ZodObject 的 shape（字段定义映射），非 ZodObject 返回 undefined */
export function getZodShape(schema: unknown): Record<string, ZodTypeAny> | undefined {
  const def = (schema as { _def?: { shape?: Record<string, ZodTypeAny> } })._def;
  return def?.shape;
}

/** 获取 Zod 类型的 typeName（如 "ZodString"），用于文档分支 */
export function getZodTypeName(schema: unknown): string | undefined {
  const def = (schema as { _def?: { typeName?: string } })._def;
  return def?.typeName;
}

/** 获取 ZodOptional/ZodDefault 的内层 schema */
export function getZodInner(schema: ZodTypeAny): ZodTypeAny | undefined {
  const def = (schema as { _def?: { innerType?: ZodTypeAny } })._def;
  return def?.innerType;
}
