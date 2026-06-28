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
import { extractDocFields, getZodInner, getZodShape, getZodTypeName } from "../lib/plugin/zod-meta";

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
