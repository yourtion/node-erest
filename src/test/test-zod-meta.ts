/**
 * @file zod-meta 工具函数测试
 *
 * 直接测试 extractDocFields / getZodTypeName / getZodShape / getZodInner，
 * 验证 Zod schema → 文档元信息提取在 Zod 3 与 Zod 4 下行为一致。
 *
 * 回归：此前 inferTypeName/isRequired 只读旧式 `_def.typeName`，
 * 在 Zod 4（`_def.type`）下所有类型推断为 "unknown"、optional 被误判必填。
 */
import { describe, expect, test } from "vitest";
import { z } from "zod";
import {
  extractDocFields,
  getZodDefaultValue,
  getZodElement,
  getZodEnumValues,
  getZodInner,
  getZodLazyGetter,
  getZodOptions,
  getZodShape,
  getZodTypeName,
  resolveZodShape,
} from "../lib/plugin/zod-meta";

describe("zod-meta: getZodTypeName", () => {
  test("读取各基础类型的规范化类型名", () => {
    expect(getZodTypeName(z.string())).toBe("string");
    expect(getZodTypeName(z.number())).toBe("number");
    expect(getZodTypeName(z.boolean())).toBe("boolean");
    expect(getZodTypeName(z.date())).toBe("date");
    expect(getZodTypeName(z.array(z.string()))).toBe("array");
    expect(getZodTypeName(z.object({}))).toBe("object");
    expect(getZodTypeName(z.enum(["a", "b"]))).toBe("enum");
    expect(getZodTypeName(z.string().optional())).toBe("optional");
    expect(getZodTypeName(z.string().default("x"))).toBe("default");
    expect(getZodTypeName(z.string().nullable())).toBe("nullable");
  });

  test("非 Zod schema 返回 undefined", () => {
    expect(getZodTypeName(null)).toBeUndefined();
    expect(getZodTypeName({})).toBeUndefined();
    expect(getZodTypeName(123)).toBeUndefined();
  });
});

describe("zod-meta: getZodShape", () => {
  test("ZodObject 返回字段映射", () => {
    const shape = getZodShape(z.object({ a: z.string(), b: z.number() }));
    expect(shape).toBeDefined();
    expect(Object.keys(shape!)).toEqual(["a", "b"]);
  });

  test("非 ZodObject 返回 undefined", () => {
    expect(getZodShape(z.string())).toBeUndefined();
    expect(getZodShape(null)).toBeUndefined();
  });
});

describe("zod-meta: getZodInner", () => {
  test("optional/default/nullable 返回内层 schema", () => {
    expect(getZodInner(z.string().optional())).toBeDefined();
    expect(getZodInner(z.string().default("x"))).toBeDefined();
    expect(getZodInner(z.string().nullable())).toBeDefined();
  });

  test("非包装类型返回 undefined", () => {
    expect(getZodInner(z.string())).toBeUndefined();
  });
});

describe("zod-meta: extractDocFields", () => {
  test("提取各基础类型的字段元信息", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
      active: z.boolean(),
      tags: z.array(z.string()),
      meta: z.object({ key: z.string() }),
    });
    const fields = extractDocFields(schema, "body");

    expect(fields).toHaveLength(5);
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]));

    expect(byName.name.type).toBe("string");
    expect(byName.name.required).toBe(true);
    expect(byName.name.place).toBe("body");

    expect(byName.age.type).toBe("number");
    expect(byName.active.type).toBe("boolean");
    expect(byName.tags.type).toBe("array");
    expect(byName.meta.type).toBe("object");
  });

  test("enum 提取取值", () => {
    const schema = z.object({
      color: z.enum(["red", "green", "blue"]),
    });
    const [field] = extractDocFields(schema, "query");
    expect(field.type).toBe("enum");
    expect(field.enumValues).toEqual(["red", "green", "blue"]);
  });

  test("date 推断 format 为 date-time", () => {
    const schema = z.object({ createdAt: z.date() });
    const [field] = extractDocFields(schema, "body");
    expect(field.type).toBe("date");
    expect(field.format).toBe("date-time");
  });

  test("★ optional 字段被正确标记为非必填（Zod 4 回归点）", () => {
    const schema = z.object({
      required: z.string(),
      optional: z.string().optional(),
      withDefault: z.number().default(0),
    });
    const fields = extractDocFields(schema, "body");
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]));

    // 回归：旧实现因只读 _def.typeName，optional/default 在 Zod 4 下被误判必填
    expect(byName.required.required).toBe(true);
    expect(byName.optional.required).toBe(false);
    expect(byName.withDefault.required).toBe(false);
  });

  test("★ optional 内层类型被正确推断（不再全部 unknown）", () => {
    const schema = z.object({
      maybeAge: z.number().optional(),
      maybeName: z.string().optional(),
    });
    const fields = extractDocFields(schema, "body");
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]));

    // 回归：旧实现 optional 字段类型推断为 unknown
    expect(byName.maybeAge.type).toBe("number");
    expect(byName.maybeName.type).toBe("string");
  });

  test("nullable 字段类型被正确推断", () => {
    const schema = z.object({
      nick: z.string().nullable(),
    });
    const [field] = extractDocFields(schema, "body");
    expect(field.type).toBe("string");
  });

  test("transform（Zod 4 pipe）字段类型取输入类型", () => {
    const schema = z.object({
      trimmed: z.string().transform((v) => v.trim()),
    });
    const [field] = extractDocFields(schema, "body");
    expect(field.type).toBe("string");
  });

  test("union 字段简化为首个分支类型", () => {
    const schema = z.object({
      id: z.union([z.string(), z.number()]),
    });
    const [field] = extractDocFields(schema, "body");
    expect(field.type).toBe("string");
  });

  test("describe() 描述被提取", () => {
    const schema = z.object({
      name: z.string().describe("用户名"),
    });
    const [field] = extractDocFields(schema, "body");
    expect(field.comment).toBe("用户名");
  });

  test("非 Zod schema 返回空数组", () => {
    expect(extractDocFields(null, "body")).toEqual([]);
    expect(extractDocFields({}, "body")).toEqual([]);
    expect(extractDocFields(z.string(), "body")).toEqual([]);
  });
});

// ============ 以下为 Stryker mutant 补测（源自 test-mutation-params-misc.ts 迁移） ============

/** 构造带任意 _def 的假 schema（顶层需通过 isZodSchema：有 _def + parse 函数） */
const fakeSchema = (def: unknown) => ({ _def: def, parse: () => ({ success: true }) }) as never;

/** 构造带指定 shape 的假 ZodObject */
const fakeObject = (shape: Record<string, unknown>) => fakeSchema({ type: "object", shape });

/** 从假对象提取单字段（便捷断言） */
const oneField = (fieldDef: unknown, place = "body") => {
  const [field] = extractDocFields(fakeObject({ f: { _def: fieldDef } }), place);
  return field;
};

describe("zod-meta: getEnumEntries 双轨（values/entries）", () => {
  test("Zod 4 entries 对象 → Object.keys", () => {
    expect(oneField({ type: "enum", entries: { RED: 0, GREEN: 1 } }).enumValues).toEqual(["RED", "GREEN"]);
  });

  test("entries 为非对象（字符串）时忽略，回退 values → undefined", () => {
    const field = oneField({ type: "enum", entries: "abc" });
    expect(field.type).toBe("enum");
    expect(field.enumValues).toBeUndefined();
  });

  test("Zod 3 values 数组 → map(String)", () => {
    expect(oneField({ type: "enum", values: ["x", "y"] }).enumValues).toEqual(["x", "y"]);
  });

  test("Zod 3 values 对象（nativeEnum 形态）→ Object.keys", () => {
    expect(oneField({ type: "enum", values: { A: 1, B: 2 } }).enumValues).toEqual(["A", "B"]);
  });

  test("Zod 3 typeName=ZodEnum + entries → enum 类型 + 取值", () => {
    const field = oneField({ typeName: "ZodEnum", entries: { RED: 0 } });
    expect(field.type).toBe("enum");
    expect(field.enumValues).toEqual(["RED"]);
  });

  test("真实 z.enum 仍正常", () => {
    const [field] = extractDocFields(z.object({ c: z.enum(["a", "b"]) }), "query");
    expect(field.type).toBe("enum");
    expect(field.enumValues).toEqual(["a", "b"]);
  });
});

describe("zod-meta: inferTypeName 字面量/包装类型分支", () => {
  test("literal → string（Zod 3 与 Zod 4 双轨）", () => {
    expect(oneField({ typeName: "ZodLiteral" }).type).toBe("string");
    expect(oneField({ type: "literal" }).type).toBe("string");
    const [field] = extractDocFields(z.object({ l: z.literal("v") }), "body");
    expect(field.type).toBe("string");
  });

  test("ZodDate → date + format date-time（Zod 3 大驼峰）", () => {
    const field = oneField({ typeName: "ZodDate" });
    expect(field.type).toBe("date");
    expect(field.format).toBe("date-time");
  });

  test("optional/default/nullable 递归内层类型（Zod 3 大驼峰）", () => {
    expect(oneField({ typeName: "ZodOptional", innerType: z.string() }).type).toBe("string");
    expect(oneField({ typeName: "ZodDefault", innerType: z.number() }).type).toBe("number");
    expect(oneField({ typeName: "ZodNullable", innerType: z.boolean() }).type).toBe("boolean");
  });

  test("真实 zod4 default 字段类型取内层（不再 'default'）", () => {
    const [field] = extractDocFields(z.object({ d: z.string().default("x") }), "body");
    expect(field.type).toBe("string");
    expect(field.required).toBe(false);
  });

  test("effects/pipeline 递归输入 schema（Zod 3 大驼峰 + Zod 4 小写）", () => {
    expect(oneField({ typeName: "ZodEffects", schema: z.number() }).type).toBe("number");
    expect(oneField({ type: "effects", in: z.date() }).type).toBe("date");
    expect(oneField({ typeName: "ZodPipeline", in: z.array(z.string()) }).type).toBe("array");
    expect(oneField({ type: "pipe", in: z.string() }).type).toBe("string");
  });

  test("union 取首个分支类型（Zod 3 大驼峰）", () => {
    expect(oneField({ typeName: "ZodUnion", options: [z.number(), z.string()] }).type).toBe("number");
  });

  test("optional 无 innerType → unknown（不抛错）", () => {
    expect(oneField({ type: "optional" }).type).toBe("unknown");
    expect(oneField({ typeName: "ZodDefault" }).type).toBe("unknown");
  });

  test("effects/pipe 无目标 schema → unknown（不抛错）", () => {
    expect(oneField({ type: "pipe" }).type).toBe("unknown");
    expect(oneField({ typeName: "ZodEffects" }).type).toBe("unknown");
  });

  test("union 无 options 或空 options → unknown（不抛错）", () => {
    expect(oneField({ type: "union" }).type).toBe("unknown");
    expect(oneField({ type: "union", options: [] }).type).toBe("unknown");
  });

  test("字段 schema 缺 _def → unknown（不抛 TypeError）", () => {
    const [field] = extractDocFields(fakeObject({ f: {} }), "body");
    expect(field.type).toBe("unknown");
    expect(field.required).toBe(true);
  });
});

describe("zod-meta: inferTypeName default 兜底归一化", () => {
  test("未识别的 Zod 4 小写类型名原样返回", () => {
    const [field] = extractDocFields(z.object({ big: z.bigint() }), "body");
    expect(field.type).toBe("bigint");
  });

  test("Zod 3 大驼峰类型名去掉 Zod 前缀 + 小写", () => {
    expect(oneField({ typeName: "ZodBigInt" }).type).toBe("bigint");
  });

  test("仅去掉开头的 Zod 前缀（正则锚定 ^）", () => {
    expect(oneField({ typeName: "MyZodType" }).type).toBe("myzodtype");
  });

  test("typeName 缺失 → unknown", () => {
    expect(oneField({}).type).toBe("unknown");
  });
});

describe("zod-meta: 空对象与形状读取", () => {
  test("getZodShape：缺 _def / shape 为函数 → undefined（不抛错）", () => {
    expect(getZodShape({})).toBeUndefined();
    expect(getZodShape(fakeSchema({ shape: () => ({}) }))).toBeUndefined();
  });

  test("getZodInner：缺 _def → undefined（不抛错）", () => {
    expect(getZodInner({} as never)).toBeUndefined();
  });

  test("extractDocFields：非对象 schema 返回 []", () => {
    expect(extractDocFields(z.string(), "body")).toEqual([]);
    expect(extractDocFields({ parse: () => ({}) } as never, "body")).toEqual([]);
  });

  test("extractDocFields 字段全形状（含 Zod 3 typeName）", () => {
    const fields = extractDocFields(fakeObject({ s: { _def: { typeName: "ZodString" } } }), "query");
    expect(fields).toStrictEqual([
      {
        name: "s",
        place: "query",
        type: "string",
        required: true,
        comment: undefined,
        enumValues: undefined,
        format: undefined,
      },
    ]);
  });
});

describe("zod-meta: 新增访问器（_def 读取集中的配套导出）", () => {
  const obj = z.object({ a: z.string(), b: z.number().optional() });
  // Zod 3 风格的函数形态 shape（getter 惰性求值）
  const fnShapeObj = { _def: { typeName: "ZodObject", shape: () => ({ x: { _def: { typeName: "ZodString" } } }) } };

  test("resolveZodShape：对象形态直接返回，函数形态调用求值，非对象返回 undefined", () => {
    expect(Object.keys(resolveZodShape(obj) ?? {})).toEqual(["a", "b"]);
    expect(Object.keys(resolveZodShape(fnShapeObj) ?? {})).toEqual(["x"]);
    expect(resolveZodShape(z.string())).toBeUndefined();
    expect(resolveZodShape(undefined)).toBeUndefined();
    // getZodShape（保守版）对函数形态返回 undefined，与 resolve 行为形成对照
    expect(getZodShape(fnShapeObj)).toBeUndefined();
  });

  test("getZodElement：读取数组元素 schema，非数组返回 undefined", () => {
    expect(getZodTypeName(getZodElement(z.array(z.string())))).toBe("string");
    expect(getZodElement(z.object({}))).toBeUndefined();
    expect(getZodElement(undefined)).toBeUndefined();
  });

  test("getZodEnumValues：Zod 4 entries / Zod 3 values 数组 / values 对象 / 非枚举 undefined", () => {
    expect(getZodEnumValues(z.enum(["red", "green"]))).toEqual(["red", "green"]);
    expect(getZodEnumValues({ _def: { typeName: "ZodEnum", values: ["a", "b"] } })).toEqual(["a", "b"]);
    expect(getZodEnumValues({ _def: { typeName: "ZodEnum", values: { A: 1, B: 2 } } })).toEqual(["A", "B"]);
    expect(getZodEnumValues(z.string())).toBeUndefined();
    expect(getZodEnumValues(undefined)).toBeUndefined();
  });

  test("getZodOptions：读取 union 分支，非 union 返回 undefined", () => {
    const opts = getZodOptions(z.union([z.string(), z.number()]));
    expect(opts?.map((o) => getZodTypeName(o))).toEqual(["string", "number"]);
    expect(getZodOptions(z.object({}))).toBeUndefined();
    expect(getZodOptions(undefined)).toBeUndefined();
  });

  test("getZodDefaultValue：读取默认值（含 falsy 0/false），函数默认值原样返回", () => {
    expect(getZodDefaultValue(z.number().default(0))).toBe(0);
    expect(getZodDefaultValue(z.boolean().default(false))).toBe(false);
    expect(getZodDefaultValue(z.string().default("x"))).toBe("x");
    // zod 4 的 .default(fn) 立即求值存结果；函数形态仅 Zod 3 伪造结构可达
    expect(getZodDefaultValue(z.string().default(() => "lazy"))).toBe("lazy");
    const fn = () => "lazy";
    expect(getZodDefaultValue({ _def: { typeName: "ZodDefault", defaultValue: fn } })).toBe(fn);
    expect(getZodDefaultValue(z.string())).toBeUndefined();
    expect(getZodDefaultValue(undefined)).toBeUndefined();
  });

  test("getZodLazyGetter：读取 lazy 的 getter，非 lazy 返回 undefined", () => {
    const inner = z.object({ a: z.string() });
    expect(getZodTypeName(getZodLazyGetter(z.lazy(() => inner))?.())).toBe("object");
    expect(getZodLazyGetter(z.string())).toBeUndefined();
    expect(getZodLazyGetter(undefined)).toBeUndefined();
  });
});
