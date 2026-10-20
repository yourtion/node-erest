import { z, type ZodType } from "zod";
import API from "../lib/api";
import {
  compileValidate,
  isZodSchema,
  responseChecker,
  zodTypeMap,
  anyObject,
  type ValidationErrorFactory,
} from "../lib/params";
import lib from "./lib";

// 创建测试用的 ERest 实例
const apiService = lib();
const app = apiService;

// 创建测试用的 sourceFile 对象
const mockSourceFile = {
  absolute: "/test/mock.ts",
  relative: "mock.ts",
};

describe("Zod Native Support Tests", () => {
  describe("Type Detection Functions", () => {
    test("isZodSchema should correctly identify Zod schemas", () => {
      const zodSchema = z.object({ name: z.string() });
      expect(isZodSchema(zodSchema)).toBe(true);
    });

    test("isZodSchema should reject non-Zod objects", () => {
      expect(isZodSchema({ type: "String" })).toBe(false);
      expect(isZodSchema(null)).toBe(false);
      expect(isZodSchema(undefined)).toBe(false);
      expect(isZodSchema("string")).toBe(false);
      expect(isZodSchema(123)).toBe(false);
    });
  });

  describe("API Methods with Native Zod Schema", () => {
    test("should accept Zod schema for query/body/params/headers", () => {
      const api = new API("get", "/test-zod", mockSourceFile as never);
      api.query(z.object({ name: z.string() }));
      api.body(z.object({ age: z.number() }));
      api.params(z.object({ id: z.string() }));
      api.headers(z.object({ auth: z.string() }));

      expect(api.options.querySchema).toBeDefined();
      expect(api.options.bodySchema).toBeDefined();
      expect(api.options.paramsSchema).toBeDefined();
      expect(api.options.headersSchema).toBeDefined();
    });

    test("should support complex nested Zod schemas", () => {
      const api = new API("post", "/nested", mockSourceFile as never);
      const complexSchema = z.object({
        user: z.object({
          name: z.string(),
          addresses: z.array(z.object({ city: z.string(), zip: z.string().optional() })),
        }),
        tags: z.array(z.string()),
        meta: z.record(z.unknown()).optional(),
      });
      api.body(complexSchema);
      expect(api.options.bodySchema).toBeDefined();
    });
  });

  describe("Integration with ERest", () => {
    test("should register and bind API with Zod schema", () => {
      const api = app.api;
      const schema = api
        .post("/zod-integration")
        .group("Index")
        .body(z.object({ name: z.string(), age: z.number().int().min(0) }))
        .register(function handler() {});
      expect(schema.options.bodySchema).toBeDefined();
    });
  });
});

// ============ 以下为 Stryker mutant 补测（源自 test-mutation-params-misc.ts 迁移） ============

/** 精确错误工厂 stub：断言 compileValidate 传给工厂的消息内容 */
const validationErrorFactory: ValidationErrorFactory = {
  missingParameter: (msg) => new Error(`MISSING:${msg}`),
  invalidParameter: (msg) => new Error(`INVALID:${msg}`),
};

/** 构造 safeParse 恒失败、issue 形状可控的假 schema（覆盖 isMissing 各分支） */
const failWith = (issue: unknown): ZodType =>
  ({ safeParse: () => ({ success: false, error: { issues: [issue] } }) }) as unknown as ZodType;

describe("params: isZodSchema 组合条件", () => {
  test("缺 _def 但有 parse 的对象返回 false", () => {
    expect(isZodSchema({ parse: () => ({}) })).toBe(false);
  });

  test("_def 为 null/undefined 时返回 false（有 parse 也不行）", () => {
    expect(isZodSchema({ _def: null, parse: () => ({}) })).toBe(false);
    expect(isZodSchema({ _def: undefined, parse: () => ({}) })).toBe(false);
  });

  test("有 _def 但缺 parse 方法返回 false", () => {
    expect(isZodSchema({ _def: { type: "string" } })).toBe(false);
  });

  test("函数输入返回 false", () => {
    expect(isZodSchema(() => {})).toBe(false);
  });
});

describe("params: compileValidate 错误路径（isMissing 分支）", () => {
  test("缺失字段（message 含 received undefined）→ missingParameter", () => {
    const compiled = compileValidate(validationErrorFactory, { bodySchema: z.object({ name: z.string() }) });
    expect(() => compiled.validate({ body: {} })).toThrow("MISSING:'name'");
  });

  test("类型错误（message 不含 received undefined）→ invalidParameter", () => {
    const compiled = compileValidate(validationErrorFactory, { bodySchema: z.object({ age: z.number() }) });
    expect(() => compiled.validate({ body: { age: "abc" } })).toThrow("INVALID:'age' should be valid");
  });

  test("嵌套 union 的缺失字段：invalid_union + 分支 errors 均含 received undefined → missingParameter", () => {
    const schema = z.object({
      u: z.union([z.object({ a: z.string() }), z.object({ b: z.string() })]),
    });
    const compiled = compileValidate(validationErrorFactory, { bodySchema: schema });
    expect(() => compiled.validate({ body: {} })).toThrow("MISSING:'u'");
  });

  test("嵌套 union 的类型错误：分支 errors 不含 received undefined → invalidParameter", () => {
    const schema = z.object({ u: z.union([z.string(), z.number()]) });
    const compiled = compileValidate(validationErrorFactory, { bodySchema: schema });
    expect(() => compiled.validate({ body: { u: true } })).toThrow("INVALID:'u' should be valid");
  });

  test("invalid_union 分支部分含 received undefined（some 语义）→ missingParameter", () => {
    const issue = {
      code: "invalid_union",
      path: ["u"],
      errors: [
        [{ message: "Invalid input: expected object, received undefined" }],
        [{ message: "Invalid input: expected string, received number" }],
      ],
    };
    const compiled = compileValidate(validationErrorFactory, { bodySchema: failWith(issue) });
    expect(() => compiled.validate({ body: {} })).toThrow("MISSING:'u'");
  });

  test("invalid_union 单分支内部分 entry 含 received undefined（some 语义）→ missingParameter", () => {
    const issue = {
      code: "invalid_union",
      path: ["u"],
      errors: [[{ message: "first" }, { message: "second: received undefined" }]],
    };
    const compiled = compileValidate(validationErrorFactory, { bodySchema: failWith(issue) });
    expect(() => compiled.validate({ body: {} })).toThrow("MISSING:'u'");
  });

  test("invalid_union 分支 entry 无 message 字段时不抛 TypeError → missingParameter", () => {
    const issue = {
      code: "invalid_union",
      path: ["u"],
      errors: [[{}], [{ message: "expected string, received undefined" }]],
    };
    const compiled = compileValidate(validationErrorFactory, { bodySchema: failWith(issue) });
    expect(() => compiled.validate({ body: {} })).toThrow("MISSING:'u'");
  });

  test("invalid_union 分支非数组（无嵌套 issue）→ invalidParameter", () => {
    const issue = { code: "invalid_union", path: ["u"], errors: [42, "not-array"] };
    const compiled = compileValidate(validationErrorFactory, { bodySchema: failWith(issue) });
    expect(() => compiled.validate({ body: {} })).toThrow("INVALID:'u' should be valid");
  });

  test("非 invalid_union 的 code 即使带 received undefined errors 也走 invalidParameter", () => {
    const issue = {
      code: "custom",
      message: "boom",
      path: ["x"],
      errors: [[{ message: "received undefined" }]],
    };
    const compiled = compileValidate(validationErrorFactory, { bodySchema: failWith(issue) });
    expect(() => compiled.validate({ body: {} })).toThrow("INVALID:'x' should be valid");
  });

  test("code 为空字符串时不匹配 invalid_union → invalidParameter", () => {
    const issue = { code: "", path: ["x"], errors: [[{ message: "received undefined" }]] };
    const compiled = compileValidate(validationErrorFactory, { bodySchema: failWith(issue) });
    expect(() => compiled.validate({ body: {} })).toThrow("INVALID:'x' should be valid");
  });

  test("issue 无 message 字段时不抛 TypeError → invalidParameter", () => {
    const issue = { code: "custom", path: ["x"] };
    const compiled = compileValidate(validationErrorFactory, { bodySchema: failWith(issue) });
    expect(() => compiled.validate({ body: {} })).toThrow("INVALID:'x' should be valid");
  });

  test("issue path 为空时字段名回退为 'value'", () => {
    const compiled = compileValidate(validationErrorFactory, { bodySchema: z.string() });
    expect(() => compiled.validate({ body: 123 })).toThrow("INVALID:'value' should be valid");
  });

  test("headers 层 schema：缺失与通过", () => {
    const compiled = compileValidate(validationErrorFactory, { headersSchema: z.object({ token: z.string() }) });
    expect(() => compiled.validate({ headers: {} })).toThrow("MISSING:'token'");
    expect(compiled.validate({ headers: { token: "t" } }).headers).toEqual({ token: "t" });
  });

  test("四层 schema 同时校验", () => {
    const compiled = compileValidate(validationErrorFactory, {
      paramsSchema: z.object({ id: z.string() }),
      querySchema: z.object({ limit: z.coerce.number() }),
      bodySchema: z.object({ name: z.string() }),
      headersSchema: z.object({ token: z.string() }),
    });
    expect(
      compiled.validate({
        params: { id: "a" },
        query: { limit: "3" },
        body: { name: "n" },
        headers: { token: "t" },
      })
    ).toEqual({
      params: { id: "a" },
      query: { limit: 3 },
      body: { name: "n" },
      headers: { token: "t" },
    });
  });
});

describe("params: responseChecker", () => {
  test("校验通过返回 ok + success + 解析后的值", () => {
    const result = responseChecker(null as never, { a: 1 }, z.object({ a: z.number() }));
    expect(result).toEqual({ ok: true, message: "success", value: { a: 1 } });
  });

  test("value 为 safeParse 输出（含 coerce 转换）", () => {
    const result = responseChecker(null as never, { a: "5" }, z.object({ a: z.coerce.number() }));
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ a: 5 });
  });

  test("校验失败：message 为 'path: message' 且 value 保留原始数据", () => {
    const data = { a: 1 };
    const result = responseChecker(null as never, data, z.object({ a: z.string() }));
    expect(result.ok).toBe(false);
    expect(result.message).toBe("a: Invalid input: expected string, received number");
    expect(result.value).toBe(data);
  });

  test("多个 issue 用 '; ' 连接，嵌套 path 用 '.' 连接", () => {
    const schema = z.object({ a: z.string(), b: z.object({ c: z.number() }) });
    const result = responseChecker(null as never, { a: 1, b: { c: "x" } }, schema);
    expect(result.ok).toBe(false);
    expect(result.message).toBe(
      "a: Invalid input: expected string, received number; b.c: Invalid input: expected number, received string"
    );
  });

  test("safeParse 抛错时返回 ok:false + 错误消息", () => {
    const boom = {
      safeParse: () => {
        throw new Error("boom");
      },
    } as unknown as ZodType;
    const data = { a: 1 };
    const result = responseChecker(null as never, data, boom);
    expect(result).toEqual({ ok: false, message: "boom", value: { a: 1 } });
  });

  test("safeParse 抛无消息错误时回退 'Unknown error'", () => {
    const silent = {
      safeParse: () => {
        throw new Error("");
      },
    } as unknown as ZodType;
    const result = responseChecker(null as never, { a: 1 }, silent);
    expect(result.ok).toBe(false);
    expect(result.message).toBe("Unknown error");
  });
});

describe("params: zodTypeMap 类型别名", () => {
  test("string / String / TrimString", () => {
    expect(zodTypeMap.string.parse("s")).toBe("s");
    expect(zodTypeMap.String.parse("s")).toBe("s");
    expect(zodTypeMap.TrimString.parse("  x ")).toBe("x");
  });

  test("number / Number：字符串转数字，NaN 抛错", () => {
    expect(zodTypeMap.number.parse(42)).toBe(42);
    expect(zodTypeMap.number.parse("42")).toBe(42);
    expect(zodTypeMap.Number.parse("42")).toBe(42);
    expect(() => zodTypeMap.number.parse("abc")).toThrow(/Invalid number/);
    expect(() => zodTypeMap.Number.parse("abc")).toThrow(/Invalid number/);
  });

  test("Integer：整数与整数字符串，小数/非数字字符串抛错", () => {
    expect(zodTypeMap.Integer.parse(7)).toBe(7);
    expect(zodTypeMap.Integer.parse("12")).toBe(12);
    expect(() => zodTypeMap.Integer.parse("1.5")).toThrow(/Invalid integer/);
    expect(() => zodTypeMap.Integer.parse("x")).toThrow(/Invalid integer/);
    expect(() => zodTypeMap.Integer.parse(1.5)).toThrow();
  });

  test("Float：数字与浮点字符串", () => {
    expect(zodTypeMap.Float.parse(2)).toBe(2);
    expect(zodTypeMap.Float.parse("3.5")).toBe(3.5);
    expect(() => zodTypeMap.Float.parse("x")).toThrow(/Invalid float/);
  });

  test("boolean / Boolean：布尔与 'true'/'false' 字符串，其余抛错", () => {
    expect(zodTypeMap.boolean.parse(true)).toBe(true);
    expect(zodTypeMap.boolean.parse("true")).toBe(true);
    expect(zodTypeMap.boolean.parse("false")).toBe(false);
    expect(zodTypeMap.Boolean.parse("false")).toBe(false);
    expect(() => zodTypeMap.boolean.parse("yes")).toThrow(/Invalid boolean/);
    expect(() => zodTypeMap.Boolean.parse("yes")).toThrow(/Invalid boolean/);
  });

  test("date / Date：Date 实例与日期字符串", () => {
    const d = new Date("2024-01-02T03:04:05.000Z");
    expect(zodTypeMap.date.parse(d)).toBe(d);
    expect(zodTypeMap.Date.parse("2024-01-02T03:04:05.000Z")).toEqual(d);
  });

  test("email / url / uuid：格式校验", () => {
    expect(zodTypeMap.email.safeParse("a@b.com").success).toBe(true);
    expect(zodTypeMap.email.safeParse("not-email").success).toBe(false);
    expect(zodTypeMap.url.safeParse("https://a.com").success).toBe(true);
    expect(zodTypeMap.URL.safeParse("nope").success).toBe(false);
    expect(zodTypeMap.uuid.safeParse("123e4567-e89b-12d3-a456-426614174000").success).toBe(true);
    expect(zodTypeMap.uuid.safeParse("x").success).toBe(false);
  });

  test("ENUM：仅接受 placeholder", () => {
    expect(zodTypeMap.ENUM.parse("placeholder")).toBe("placeholder");
    expect(zodTypeMap.ENUM.safeParse("other").success).toBe(false);
  });

  test("array / Array / any / Object / JSONString", () => {
    expect(zodTypeMap.array.parse([1, "a"])).toEqual([1, "a"]);
    expect(zodTypeMap.Array.parse([])).toEqual([]);
    expect(zodTypeMap.any.parse(123)).toBe(123);
    expect(zodTypeMap.Any.parse("x")).toBe("x");
    expect(zodTypeMap.Object.parse({ k: 1 })).toEqual({ k: 1 });
    expect(zodTypeMap.object.parse({})).toEqual({});
    expect(() => zodTypeMap.object.parse("not-object")).toThrow();
    expect(zodTypeMap.JSON.parse({ a: 1 })).toEqual({ a: 1 });
    expect(zodTypeMap.JSONString.parse("raw")).toBe("raw");
  });

  test("IntArray：逗号字符串去空格+升序，或整数数组", () => {
    expect(zodTypeMap.IntArray.parse("3, 1, 2")).toEqual([1, 2, 3]);
    expect(zodTypeMap.IntArray.parse([5, 2])).toEqual([5, 2]);
  });

  test("StringArray：逗号字符串 / 字符串数组 / 任意数组转字符串", () => {
    expect(zodTypeMap.StringArray.parse(" a , b ")).toEqual(["a", "b"]);
    expect(zodTypeMap.StringArray.parse(["x"])).toEqual(["x"]);
    expect(zodTypeMap.StringArray.parse([1, true])).toEqual(["1", "true"]);
  });

  test("NullableString / NullableInteger", () => {
    expect(zodTypeMap.NullableString.parse(null)).toBe(null);
    expect(zodTypeMap.NullableString.parse("s")).toBe("s");
    expect(zodTypeMap.NullableInteger.parse(null)).toBe(null);
    expect(zodTypeMap.NullableInteger.parse("15")).toBe(15);
    expect(zodTypeMap.NullableInteger.parse(15)).toBe(15);
    expect(() => zodTypeMap.NullableInteger.parse("1.5")).toThrow(/Invalid integer/);
  });

  test("MongoIdString / Alpha / AlphaNumeric / Domain / Ascii / Base64", () => {
    expect(zodTypeMap.MongoIdString.safeParse("507f1f77bcf86cd799439011").success).toBe(true);
    expect(zodTypeMap.MongoIdString.safeParse("xyz").success).toBe(false);
    expect(zodTypeMap.Alpha.safeParse("abc").success).toBe(true);
    expect(zodTypeMap.Alpha.safeParse("ab1").success).toBe(false);
    expect(zodTypeMap.AlphaNumeric.safeParse("a1").success).toBe(true);
    expect(zodTypeMap.AlphaNumeric.safeParse("a-1").success).toBe(false);
    expect(zodTypeMap.Domain.parse("example.com")).toBe("example.com");
    expect(zodTypeMap.Ascii.parse("plain")).toBe("plain");
    expect(zodTypeMap.Base64.parse("YQ==")).toBe("YQ==");
  });

  test("anyObject：等价 z.object({}).catchall(z.unknown())，保留未知字段", () => {
    const schema = anyObject();
    expect(schema.parse({ a: 1, b: "x" })).toEqual({ a: 1, b: "x" });
    // 普通 z.object({}) 会剥离未知字段（zod 4 默认 strip）
    expect(z.object({}).parse({ a: 1 })).toEqual({});
  });
});
