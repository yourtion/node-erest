import { z } from "zod";
import API from "../lib/api";
import { isZodSchema } from "../lib/params";
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
