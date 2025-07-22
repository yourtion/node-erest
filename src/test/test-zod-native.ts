import { z } from "zod";
import API from "../lib/api";
import { TYPES } from "../lib/helper";
import { isISchemaType, isISchemaTypeRecord, isZodSchema, schemaChecker } from "../lib/params";
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
      const iSchemaType = { type: "String", required: true };
      const plainObject = { name: "test" };

      expect(isZodSchema(zodSchema)).toBe(true);
      expect(isZodSchema(iSchemaType)).toBe(false);
      expect(isZodSchema(plainObject)).toBe(false);
      expect(isZodSchema(null)).toBe(false);
      expect(isZodSchema(undefined)).toBe(false);
    });

    test("isISchemaType should correctly identify ISchemaType objects", () => {
      const zodSchema = z.object({ name: z.string() });
      const iSchemaType = { type: "String", required: true };
      const plainObject = { name: "test" };

      expect(isISchemaType(zodSchema)).toBe(false);
      expect(isISchemaType(iSchemaType)).toBe(true);
      expect(isISchemaType(plainObject)).toBe(false);
      expect(isISchemaType(null)).toBe(false);
      expect(isISchemaType(undefined)).toBe(false);
    });

    test("isISchemaTypeRecord should correctly identify ISchemaType records", () => {
      const zodSchema = z.object({ name: z.string() });
      const iSchemaTypeRecord = {
        name: { type: "String", required: true },
        age: { type: "Number", required: false },
      };
      const mixedRecord = {
        name: { type: "String", required: true },
        invalid: "not a schema",
      };

      expect(isISchemaTypeRecord(zodSchema)).toBe(false);
      expect(isISchemaTypeRecord(iSchemaTypeRecord)).toBe(true);
      expect(isISchemaTypeRecord(mixedRecord)).toBe(false);
      expect(isISchemaTypeRecord(null)).toBe(false);
      expect(isISchemaTypeRecord(undefined)).toBe(false);
    });
  });

  describe("schemaChecker with Native Zod Schema", () => {
    test("should validate data with native Zod schema successfully", () => {
      const schema = z.object({
        name: z.string(),
        age: z.number().min(0),
        email: z.string().email(),
      });

      const validData = {
        name: "John Doe",
        age: 25,
        email: "john@example.com",
      };

      const result = schemaChecker(apiService, validData, schema);
      expect(result).toEqual(validData);
    });

    test("should handle validation errors with native Zod schema", () => {
      const schema = z.object({
        name: z.string(),
        age: z.number().min(0),
      });

      const invalidData = {
        name: "John Doe",
        age: -5, // Invalid: negative age
      };

      expect(() => {
        schemaChecker(apiService, invalidData, schema);
      }).toThrow();
    });

    test("should handle missing required fields with native Zod schema", () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const incompleteData = {
        name: "John Doe",
        // Missing age
      };

      expect(() => {
        schemaChecker(apiService, incompleteData, schema);
      }).toThrow();
    });

    test("should handle optional fields with native Zod schema", () => {
      const schema = z.object({
        name: z.string(),
        age: z.number().optional(),
        email: z.string().email().optional(),
      });

      const dataWithOptional = {
        name: "John Doe",
        email: "john@example.com",
        // age is optional and missing
      };

      const result = schemaChecker(apiService, dataWithOptional, schema);
      expect(result.name).toBe("John Doe");
      expect(result.email).toBe("john@example.com");
      expect(result.age).toBeUndefined();
    });

    test("should handle default values with native Zod schema", () => {
      const schema = z.object({
        name: z.string(),
        role: z.string().default("user"),
        isActive: z.boolean().default(true),
      });

      const dataWithDefaults = {
        name: "John Doe",
        // role and isActive will use defaults
      };

      const result = schemaChecker(apiService, dataWithDefaults, schema);
      expect(result.name).toBe("John Doe");
      expect(result.role).toBe("user");
      expect(result.isActive).toBe(true);
    });
  });

  describe("API Methods with Native Zod Schema", () => {
    test("should accept native Zod schema in query method", () => {
      const api = new API("GET", "/test", mockSourceFile);
      const querySchema = z.object({
        page: z.number().min(1),
        limit: z.number().max(100),
      });

      expect(() => {
        api.query(querySchema);
      }).not.toThrow();

      expect(api.options.querySchema).toBe(querySchema);
    });

    test("should accept native Zod schema in body method", () => {
      const api = new API("POST", "/test", mockSourceFile);
      const bodySchema = z.object({
        name: z.string(),
        email: z.string().email(),
      });

      expect(() => {
        api.body(bodySchema);
      }).not.toThrow();

      expect(api.options.bodySchema).toBe(bodySchema);
    });

    test("should accept native Zod schema in params method", () => {
      const api = new API("GET", "/test/:id", mockSourceFile);
      const paramsSchema = z.object({
        id: z.string().uuid(),
      });

      expect(() => {
        api.params(paramsSchema);
      }).not.toThrow();

      expect(api.options.paramsSchema).toBe(paramsSchema);
    });

    test("should accept native Zod schema in headers method", () => {
      const api = new API("GET", "/test", mockSourceFile);
      const headersSchema = z.object({
        authorization: z.string(),
        "content-type": z.string().optional(),
      });

      expect(() => {
        api.headers(headersSchema);
      }).not.toThrow();

      expect(api.options.headersSchema).toBe(headersSchema);
    });
  });

  describe("Mixed Usage Prevention", () => {
    test("should prevent mixing ISchemaType and Zod schema in query", () => {
      const api = new API("GET", "/test", mockSourceFile);

      // First set ISchemaType
      api.query({ page: { type: "Number", required: true } });

      // Then try to set Zod schema - should throw
      const zodSchema = z.object({ limit: z.number() });
      expect(() => {
        api.query(zodSchema);
      }).toThrow(/Cannot mix ISchemaType and Zod schema/);
    });

    test("should prevent mixing Zod schema and ISchemaType in body", () => {
      const api = new API("POST", "/test", mockSourceFile);

      // First set Zod schema
      const zodSchema = z.object({ name: z.string() });
      api.body(zodSchema);

      // Then try to set ISchemaType - should throw
      expect(() => {
        api.body({ email: { type: "String", required: true } });
      }).toThrow(/Cannot mix ISchemaType and Zod schema/);
    });

    test("should prevent mixing in params", () => {
      const api = new API("GET", "/test/:id", mockSourceFile);

      // First set ISchemaType
      api.params({ id: { type: "String", required: true } });

      // Then try to set Zod schema - should throw
      const zodSchema = z.object({ id: z.string().uuid() });
      expect(() => {
        api.params(zodSchema);
      }).toThrow(/Cannot mix ISchemaType and Zod schema/);
    });

    test("should prevent mixing in headers", () => {
      const api = new API("GET", "/test", mockSourceFile);

      // First set Zod schema
      const zodSchema = z.object({ authorization: z.string() });
      api.headers(zodSchema);

      // Then try to set ISchemaType - should throw
      expect(() => {
        api.headers({ "content-type": { type: "String", required: false } });
      }).toThrow(/Cannot mix ISchemaType and Zod schema/);
    });
  });

  describe("Compatibility with Existing ISchemaType", () => {
    test("should still work with existing ISchemaType definitions", () => {
      const api = new API("POST", "/test", mockSourceFile);

      const iSchemaTypeQuery = {
        page: { type: "Number", required: true },
        limit: { type: "Number", required: false, default: 10 },
      };

      const iSchemaTypeBody = {
        name: { type: "String", required: true },
        email: { type: "String", required: true },
      };

      expect(() => {
        api.query(iSchemaTypeQuery).body(iSchemaTypeBody);
      }).not.toThrow();

      expect(api.options.query).toEqual(iSchemaTypeQuery);
      expect(api.options.body).toEqual(iSchemaTypeBody);
    });

    test("should validate ISchemaType data correctly", () => {
      const schema = {
        name: { type: "String", required: true },
        age: { type: "Number", required: false, default: 18 },
      };

      const validData = {
        name: "John Doe",
        // age will use default
      };

      const result = schemaChecker(app, validData, schema);
      expect(result.name).toBe("John Doe");
      expect(result.age).toBe(18);
    });
  });

  describe("Performance and Edge Cases", () => {
    test("should handle complex nested Zod schemas", () => {
      const schema = z.object({
        user: z.object({
          name: z.string(),
          profile: z.object({
            age: z.number().min(0),
            preferences: z.array(z.string()),
          }),
        }),
        metadata: z.record(z.string(), z.any()).optional(),
      });

      const validData = {
        user: {
          name: "John Doe",
          profile: {
            age: 25,
            preferences: ["coding", "reading"],
          },
        },
      };

      const result = schemaChecker(apiService, validData, schema);
      expect(result).toEqual(validData);
    });

    test("should handle Zod transformations", () => {
      const schema = z.object({
        name: z.string().transform((s) => s.trim().toLowerCase()),
        age: z
          .string()
          .transform((s) => parseInt(s, 10))
          .pipe(z.number().min(0)),
      });

      const inputData = {
        name: "  JOHN DOE  ",
        age: "25",
      };

      const result = schemaChecker(app, inputData, schema);
      expect(result.name).toBe("john doe");
      expect(result.age).toBe(25);
    });

    test("should handle invalid schema types gracefully", () => {
      const api = new API("GET", "/test", mockSourceFile);

      expect(() => {
        api.query("invalid schema" as any);
      }).toThrow(/must be either ISchemaType record or Zod schema/);

      expect(() => {
        api.body(123 as any);
      }).toThrow(/must be either ISchemaType record or Zod schema/);
    });
  });
});
