/**
 * @file Zod schema → 文档字段元信息提取
 *
 * Stage 1：统一 Zod schema 到文档字段信息的转换，消除 markdown/swagger 两处
 * 手写 _def.typeName switch 的重复。阶段 2 会进一步充实（支持更多 Zod 类型）。
 */

import type { ZodTypeAny } from "zod";
import { isZodSchema } from "../params.js";

/**
 * Zod 版本兼容说明：
 *
 * Zod 3 用 `_def.typeName`（值为 "ZodString"/"ZodNumber"/... 大驼峰带 Zod 前缀），
 * Zod 4 改为 `_def.type`（值为 "string"/"number"/... 小写无前缀），且 enum 的取值
 * 从 `_def.values` 改为 `_def.entries`，ZodEffects 改名为 pipe（`_def.in`/`_def.out`）。
 *
 * 本模块所有读取统一走 getTypeName()（双轨：typeName || type），枚举取值走 getEnumEntries()，
 * 确保在 Zod 3 与 Zod 4 下行为一致。禁止在其他文件直接读 `_def`（见 AGENTS.md 约定 6）。
 */

/** _def 的最小结构（Zod 3 与 Zod 4 的并集） */
interface ZodDefLike {
  /** Zod 4：小写类型名（"string"/"optional"/...） */
  type?: string;
  /** Zod 3：大驼峰类型名（"ZodString"/"ZodOptional"/...） */
  typeName?: string;
  /** object 的字段映射（两版同名） */
  shape?: Record<string, ZodTypeAny> | (() => Record<string, ZodTypeAny>);
  /** Zod 3 enum 取值；Zod 4 仍保留但建议用 entries */
  values?: unknown[] | Record<string, unknown>;
  /** Zod 4 enum 取值 */
  entries?: Record<string, unknown>;
  /** optional/default/nullable 的内层 schema（两版同名） */
  innerType?: ZodTypeAny;
  /** ZodEffects/pipeline 的输入 schema */
  schema?: ZodTypeAny;
  /** ZodEffects(Zod 3)/pipe(Zod 4) 的输入 schema */
  in?: ZodTypeAny;
  /** union 的分支（两版同名） */
  options?: ZodTypeAny[] | readonly ZodTypeAny[];
  /** array 的元素 schema（两版同名） */
  element?: ZodTypeAny;
}

/** 读取 Zod schema 的规范化类型名（兼容 Zod 3 的 typeName 与 Zod 4 的 type） */
export function getZodTypeName(schema: unknown): string | undefined {
  if (!schema || typeof schema !== "object") return undefined;
  const def = (schema as { _def?: ZodDefLike })._def;
  return def?.typeName ?? def?.type;
}

/** 获取 ZodObject 的 shape（字段定义映射），非 ZodObject 返回 undefined */
export function getZodShape(schema: unknown): Record<string, ZodTypeAny> | undefined {
  if (!schema || typeof schema !== "object") return undefined;
  const def = (schema as { _def?: ZodDefLike })._def;
  const shape = def?.shape;
  return typeof shape === "function" ? undefined : shape;
}

/** 获取 ZodOptional/ZodDefault/ZodNullable 的内层 schema */
export function getZodInner(schema: ZodTypeAny): ZodTypeAny | undefined {
  if (!schema || typeof schema !== "object") return undefined;
  const def = (schema as { _def?: ZodDefLike })._def;
  return def?.innerType;
}

/** 读取 enum 取值（兼容 Zod 3 的 values 与 Zod 4 的 entries） */
function getEnumEntries(def: ZodDefLike | undefined): string[] | undefined {
  const entries = def?.entries;
  if (entries && typeof entries === "object") {
    return Object.keys(entries);
  }
  const values = def?.values;
  if (Array.isArray(values)) return values.map(String);
  if (values && typeof values === "object") return Object.keys(values as Record<string, unknown>);
  return undefined;
}

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

/** 从单个 Zod 类型推断文档类型名（递归处理 optional/nullable/effects/union 包装层） */
function inferTypeName(schema: ZodTypeAny): { type: string; enumValues?: string[]; format?: string } {
  const def = (schema as { _def?: ZodDefLike })._def;
  const typeName = def?.typeName ?? def?.type;
  switch (typeName) {
    case "ZodString":
    case "string":
      return { type: "string" };
    case "ZodNumber":
    case "number":
      return { type: "number" };
    case "ZodBoolean":
    case "boolean":
      return { type: "boolean" };
    case "ZodDate":
    case "date":
      return { type: "date", format: "date-time" };
    case "ZodArray":
    case "array":
      return { type: "array" };
    case "ZodEnum":
    case "enum":
      return { type: "enum", enumValues: getEnumEntries(def) };
    case "ZodObject":
    case "object":
      return { type: "object" };
    case "ZodLiteral":
    case "literal":
      return { type: "string" };
    case "ZodOptional":
    case "optional":
    case "ZodDefault":
    case "default":
    case "ZodNullable":
    case "nullable": {
      const inner = def?.innerType;
      return inner ? inferTypeName(inner) : { type: "unknown" };
    }
    case "ZodEffects":
    case "effects":
    case "ZodPipeline":
    case "pipe": {
      // Zod 3 effects 用 _def.schema；Zod 4 pipe 用 _def.in
      const target = def?.schema ?? def?.in;
      return target ? inferTypeName(target) : { type: "unknown" };
    }
    case "ZodUnion":
    case "union": {
      // union 简化为首个分支类型
      const options = def?.options;
      return options && options.length > 0 ? inferTypeName(options[0] as ZodTypeAny) : { type: "unknown" };
    }
    default:
      return { type: typeName ? String(typeName).replace(/^Zod/, "").toLowerCase() : "unknown" };
  }
}

/** 判断字段是否必填（未被 ZodOptional/ZodDefault 包裹） */
function isRequired(schema: ZodTypeAny): boolean {
  const typeName = getZodTypeName(schema);
  return typeName !== "ZodOptional" && typeName !== "optional" && typeName !== "ZodDefault" && typeName !== "default";
}

/** 取 Zod .describe() 描述 */
function getDescription(schema: ZodTypeAny): string | undefined {
  return (schema as { description?: string }).description;
}

/** 从 ZodObject 提取字段元信息列表 */
export function extractDocFields(schema: unknown, place: string): DocField[] {
  if (!isZodSchema(schema)) return [];
  const shape = getZodShape(schema);
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
