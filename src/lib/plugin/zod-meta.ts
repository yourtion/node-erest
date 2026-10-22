/**
 * @file Zod schema → 文档字段元信息提取
 *
 * Stage 1：统一 Zod schema 到文档字段信息的转换，消除 markdown/swagger 两处
 * 手写 _def.typeName switch 的重复。阶段 2 会进一步充实（支持更多 Zod 类型）。
 */

import { toJSONSchema, type ZodTypeAny } from "zod";
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
  type?: string | ZodTypeAny;
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
  /** ZodDefault 的默认值（两版同名） */
  defaultValue?: unknown;
  /** Zod 3 literal 的值 */
  value?: unknown;
  /** ZodLazy 的 getter（两版同名） */
  getter?: () => ZodTypeAny;
}

/** 读取 Zod schema 的规范化类型名（兼容 Zod 3 的 typeName 与 Zod 4 的 type） */
export function getZodTypeName(schema: unknown): string | undefined {
  if (!schema || typeof schema !== "object") return undefined;
  const def = (schema as { _def?: ZodDefLike })._def;
  return def?.typeName ?? (typeof def?.type === "string" ? def.type : undefined);
}

/** 获取 ZodObject 的 shape（字段定义映射），非 ZodObject 返回 undefined */
export function getZodShape(schema: unknown): Record<string, ZodTypeAny> | undefined {
  if (!schema || typeof schema !== "object") return undefined;
  const def = (schema as { _def?: ZodDefLike })._def;
  const shape = def?.shape;
  return typeof shape === "function" ? undefined : shape;
}

/** 解析 ZodObject 的 shape（函数形态会调用之），非 ZodObject 返回 undefined */
export function resolveZodShape(schema: unknown): Record<string, ZodTypeAny> | undefined {
  if (!schema || typeof schema !== "object") return undefined;
  const def = (schema as { _def?: ZodDefLike })._def;
  const shape = def?.shape;
  if (!shape) return undefined;
  return typeof shape === "function" ? shape() : shape;
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

/** 读取 enum 取值（公开访问器：兼容 Zod 3 的 values 与 Zod 4 的 entries） */
export function getZodEnumValues(schema: unknown): string[] | undefined {
  if (!schema || typeof schema !== "object") return undefined;
  return getEnumEntries((schema as { _def?: ZodDefLike })._def);
}

/** 获取 ZodArray 的元素 schema */
export function getZodElement(schema: unknown): ZodTypeAny | undefined {
  if (!schema || typeof schema !== "object") return undefined;
  const def = (schema as { _def?: ZodDefLike })._def;
  return def?.element ?? (typeof def?.type === "object" ? def.type : undefined);
}

/** 获取 ZodUnion 的分支列表 */
export function getZodOptions(schema: unknown): ZodTypeAny[] | undefined {
  if (!schema || typeof schema !== "object") return undefined;
  const options = (schema as { _def?: ZodDefLike })._def?.options;
  return Array.isArray(options) ? options : undefined;
}

/** 获取 ZodDefault 的默认值（函数形态返回函数本身，由调用方决定如何展示） */
export function getZodDefaultValue(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return undefined;
  return (schema as { _def?: ZodDefLike })._def?.defaultValue;
}

/** 获取 ZodLazy 的 getter */
export function getZodLazyGetter(schema: unknown): (() => ZodTypeAny) | undefined {
  if (!schema || typeof schema !== "object") return undefined;
  return (schema as { _def?: ZodDefLike })._def?.getter;
}

/** 文档字段元信息 */
export interface DocField {
  /** 字段名 */
  name: string;
  /** 位置：params/query/body/headers */
  place: string;
  /** 推断的类型名（string/number/boolean/array/object/enum/date） */
  type: string;
  /** 完整展示类型（数组元素和 union 全部分支）；type 保留给旧示例生成器使用。 */
  typeText?: string;
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
  const typeName = getZodTypeName(schema);
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
  const typeName = getZodTypeName(schema)?.replace(/^Zod/, "").toLowerCase();
  if (typeName === "optional" || typeName === "default" || typeName === "undefined" || typeName === "void")
    return false;
  if (typeName === "nullable") {
    const inner = getZodInner(schema);
    return inner ? isRequired(inner) : true;
  }
  if (typeName === "union") return getZodOptions(schema)?.every(isRequired) ?? true;
  return true;
}

/** 取 Zod .describe() 描述 */
function getDescription(schema: ZodTypeAny): string | undefined {
  return (schema as { description?: string }).description;
}

/** 从 ZodObject 提取字段元信息列表 */
export function extractDocFields(schema: unknown, place: string): DocField[] {
  if (!isZodSchema(schema)) return [];
  const shape = resolveZodShape(schema);
  if (!shape) return [];
  return Object.entries(shape).map(([name, fieldSchema]) => {
    const { type, enumValues, format } = inferTypeName(fieldSchema);
    const schemaDoc = extractDocSchema(fieldSchema);
    return {
      name,
      place,
      type,
      ...(schemaDoc.items || schemaDoc["x-anyOf"] || (schemaDoc.enum && !enumValues)
        ? { typeText: docTypeText(schemaDoc) }
        : {}),
      required: isRequired(fieldSchema),
      comment: getDescription(fieldSchema),
      enumValues,
      format,
    };
  });
}

/** Swagger 2 Schema；union/nullable 使用显式扩展，避免伪装成单一分支。 */
export interface DocSchema {
  type?: string;
  format?: string;
  description?: string;
  enum?: unknown[];
  items?: DocSchema;
  properties?: Record<string, DocSchema>;
  required?: string[];
  default?: unknown;
  "x-anyOf"?: DocSchema[];
  "x-nullable"?: boolean;
  "x-zod-type"?: string;
}

/** 人类可读的类型展示；不把 union 缩减成首个分支。 */
function docTypeText(schema: DocSchema): string {
  if (schema["x-anyOf"]) return schema["x-anyOf"].map(docTypeText).join(" | ");
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  if (schema.items) {
    const item = docTypeText(schema.items);
    return `${item.includes(" | ") ? `(${item})` : item}[]`;
  }
  return schema.type ?? "unknown";
}

/**
 * 递归提取结构，供请求、响应、注册类型共用。Swagger 2 没有 anyOf，
 * 用 x-anyOf 保留全部分支；异构 union 不声明一个错误的标准 type。
 * seen 只跟踪当前递归路径，重复使用同一 schema 不会被误判循环。
 */
export function extractDocSchema(schema: unknown, seen = new Set<unknown>()): DocSchema {
  if (!schema || typeof schema !== "object") return {};
  if (seen.has(schema)) return { "x-zod-type": "recursive" };
  const next = new Set(seen).add(schema);
  const def = (schema as { _def?: ZodDefLike })._def;
  const type = getZodTypeName(schema)?.replace(/^Zod/, "").toLowerCase();
  let result: DocSchema;
  switch (type) {
    case "string":
    case "number":
    case "boolean":
      result = { type };
      break;
    case "date":
      result = { type: "string", format: "date-time" };
      break;
    case "array":
      result = { type: "array", items: extractDocSchema(getZodElement(schema), next) };
      break;
    case "object": {
      const properties: Record<string, DocSchema> = {};
      const required: string[] = [];
      for (const [name, field] of Object.entries(resolveZodShape(schema) ?? {})) {
        properties[name] = extractDocSchema(field, next);
        if (isRequired(field)) required.push(name);
      }
      result = { type: "object", properties, ...(required.length ? { required } : {}) };
      break;
    }
    case "enum":
    case "nativeenum":
    case "literal": {
      const entries = def?.entries ?? (Array.isArray(def?.values) ? undefined : def?.values);
      const values = entries
        ? Object.entries(entries)
            .filter(([key]) => !/^\d+$/.test(key))
            .map(([, value]) => value)
        : Array.isArray(def?.values)
          ? def.values
          : def && "value" in def
            ? [def.value]
            : [];
      const valueType =
        values.length && values.every((v) => typeof v === typeof values[0]) ? typeof values[0] : undefined;
      result = {
        ...(valueType === "string" || valueType === "number" || valueType === "boolean" ? { type: valueType } : {}),
        ...(values.length ? { enum: values } : {}),
      };
      break;
    }
    case "optional":
    case "default":
    case "nullable": {
      result = extractDocSchema(def?.innerType, next);
      if (type === "nullable") result = { ...result, "x-nullable": true };
      if (type === "default") {
        const value = def?.defaultValue;
        if (typeof value !== "function" && value !== undefined) result = { ...result, default: value };
      }
      break;
    }
    case "effects":
    case "pipeline":
    case "pipe":
      result = extractDocSchema(def?.schema ?? def?.in, next);
      break;
    case "union":
    case "discriminatedunion": {
      const branches = getZodOptions(schema)?.map((branch) => extractDocSchema(branch, next)) ?? [];
      const commonType = branches[0]?.type;
      const literals = branches.length && branches.every((b) => b.type === commonType && b.enum);
      result = literals
        ? { type: commonType, enum: branches.flatMap((b) => b.enum ?? []) }
        : {
            ...(commonType && branches.every((b) => b.type === commonType) ? { type: commonType } : {}),
            "x-anyOf": branches,
          };
      break;
    }
    case "lazy":
      result = extractDocSchema(getZodLazyGetter(schema)?.(), next);
      break;
    case "any":
    case "unknown":
      result = {};
      break;
    default:
      result = { "x-zod-type": type ?? "unknown" };
  }
  const description = (schema as { description?: string }).description;
  return description ? { ...result, description } : result;
}

/**
 * OpenAPI 3 的源结构：Zod 4 原生转换保留范围、长度等声明式约束。
 * 先选兼容 Zod 4.0 的 Draft 7，再由生成器转换为 OpenAPI 3.0 Schema。
 * 运行时只验证 response.parse 的输入，未用其返回值替换响应，因此两端都取 input。
 */
export function extractJSONSchema(schema: unknown): Record<string, unknown> {
  if (!isZodSchema(schema)) return {};
  if (!("_zod" in schema)) return extractDocSchema(schema) as Record<string, unknown>;
  return toJSONSchema(schema, {
    target: "draft-7",
    io: "input",
    unrepresentable: "any",
    override: ({ zodSchema, jsonSchema }) => {
      const type = getZodTypeName(zodSchema);
      if (type === "date") {
        Object.assign(jsonSchema, { type: "string", format: "date-time" });
      } else if (type === "undefined" || type === "void") {
        // undefined 不能作为 JSON 值，不能让 union 的这个分支变成匹配任意值的 {}。
        Object.assign(jsonSchema, { not: {} });
      } else if (["bigint", "symbol", "map", "set", "transform", "custom", "promise"].includes(type ?? "")) {
        Object.assign(jsonSchema, { "x-zod-type": type });
      }
    },
  }) as Record<string, unknown>;
}
