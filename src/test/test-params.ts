/**
 * Parameter validation tests
 * Tests for paramsChecker and schemaChecker functionality
 * Refactored to use shared utilities and improve readability
 */

import { describe, test, expect } from "vitest";
import { z } from "zod";
import { build, TYPES } from "./helper";
import lib from "./lib";
import {
  assertParamValidation,
  assertParamValidationError,
  assertSchemaValidation,
  assertSchemaValidationError,
  assertZodValidation,
} from "./utils/assertion-helpers";
import { createTestERestInstance } from "./utils/test-setup";
import { commonTypes, typeTestData, zodSchemas } from "./utils/type-helpers";
import { iSchemaFixtures, schemaTestData, schemaErrorPatterns } from "./fixtures/schema-fixtures";

// Create test instance
const apiService = lib();
const paramsChecker = apiService.paramsChecker();
const schemaChecker = apiService.schemaChecker();

// Test parameter definitions with proper typing
const testParams = {
  stringRequired: build(TYPES.String, "Required string", true),
  stringWithDefault: build(TYPES.String, "String with default", true, "Hello"),
  stringOptional: build(TYPES.String, "Optional string", false),
  numberRequired: build(TYPES.Number, "Required number", true),
  integerOptional: build(TYPES.Integer, "Optional integer", false),
  enumRequired: build(TYPES.ENUM, "Required enum", true, undefined, ["A", "B", 1]),
  jsonOptional: build(TYPES.JSON, "Optional JSON", false),
};

// Test schemas with proper typing
const testSchemas = {
  basic: {
    stringWithDefault: testParams.stringWithDefault,
    stringOptional: testParams.stringOptional,
    numberRequired: testParams.numberRequired,
    integerOptional: testParams.integerOptional,
  } as Record<string, any>,
  arrayWithStringParam: build(TYPES.Array, "Array with String param", true, undefined, TYPES.Integer),
  arrayWithTypeParam: build(TYPES.Array, "Array with Type param", true, undefined, testParams.jsonOptional),
};

describe("ParamsChecker - Basic Functionality", () => {
  describe("String Parameter Validation", () => {
    test("should validate required string parameters", () => {
      assertParamValidation(paramsChecker, "stringParam", "test", testParams.stringRequired, "test");
    });

    test("should handle string parameters with format flag", () => {
      const stringParam = { ...testParams.stringOptional, format: true };
      assertParamValidation(paramsChecker, "stringParam", "test", stringParam, "test");
    });

    test("should use default values for string parameters", () => {
      assertParamValidation(paramsChecker, "stringParam", undefined, testParams.stringWithDefault, "Hello");
    });
  });

  describe("Number Parameter Validation", () => {
    test("should convert string numbers to numbers", () => {
      assertParamValidation(paramsChecker, "numberParam", "42", testParams.numberRequired, 42);
    });

    test("should handle integer parameters", () => {
      assertParamValidation(paramsChecker, "intParam", "10", testParams.integerOptional, 10);
    });

    test("should reject invalid number strings", () => {
      assertParamValidationError(
        paramsChecker,
        "numberParam",
        "not-a-number",
        testParams.numberRequired,
        /should be valid Number/
      );
    });
  });

  describe("ENUM Parameter Validation", () => {
    test("should validate enum values", () => {
      assertParamValidation(paramsChecker, "enumParam", "A", testParams.enumRequired, "A");
      assertParamValidation(paramsChecker, "enumParam", 1, testParams.enumRequired, 1);
    });

    test("should reject invalid enum values", () => {
      assertParamValidationError(
        paramsChecker,
        "enumParam",
        "C",
        testParams.enumRequired,
        /should be valid ENUM with additional restrictions: A,B,1/
      );
    });
  });

  describe("JSON Parameter Validation", () => {
    test("should parse valid JSON strings", () => {
      const jsonParam = { ...testParams.jsonOptional, format: true };
      assertParamValidation(paramsChecker, "jsonParam", '{"a": 1}', jsonParam, { a: 1 });
    });

    test("should return raw string when format is false", () => {
      const jsonParam = { ...testParams.jsonOptional, format: false };
      assertParamValidation(paramsChecker, "jsonParam", '{"a": 1}', jsonParam, '{"a": 1}');
    });

    test("should reject invalid JSON", () => {
      const jsonParam = { ...testParams.jsonOptional, format: true };
      assertParamValidationError(paramsChecker, "jsonParam", "invalid json", jsonParam, /should be valid JSON/);
    });
  });

  describe("Array Parameter Validation", () => {
    test("should validate arrays with string element type", () => {
      assertParamValidation(paramsChecker, "arrayParam", ["1", 2, "99"], testSchemas.arrayWithStringParam, [1, 2, 99]);
    });

    test("should reject invalid array elements", () => {
      assertParamValidationError(
        paramsChecker,
        "arrayParam",
        ["1", 2, "invalid"],
        testSchemas.arrayWithStringParam,
        /should be valid Integer/
      );
    });

    test("should validate arrays with object element type", () => {
      const jsonParam = { ...testParams.jsonOptional, format: true };
      const arrayParam = build(TYPES.Array, "Array with JSON", true, undefined, jsonParam);

      assertParamValidation(paramsChecker, "arrayParam", ['{"a": 1}', '{"b": 2}', "{}"], arrayParam, [
        { a: 1 },
        { b: 2 },
        {},
      ]);
    });
  });
});

describe("SchemaChecker - Basic Functionality", () => {
  describe("Schema Validation Success Cases", () => {
    test("should validate complete valid data", () => {
      const testData = {
        stringWithDefault: "test",
        numberRequired: 42.5,
        integerOptional: 10,
      };

      assertSchemaValidation(schemaChecker, testData, testSchemas.basic, testData);
    });

    test("should apply default values", () => {
      const inputData = { numberRequired: 42.5 };
      const expectedData = { ...inputData, stringWithDefault: "Hello" };

      assertSchemaValidation(schemaChecker, inputData, testSchemas.basic, expectedData);
    });

    test("should remove properties not in schema", () => {
      const inputData = { numberRequired: 42.5, extraProperty: "should be removed" };
      const expectedData = { numberRequired: 42.5, stringWithDefault: "Hello" };

      const result = schemaChecker(inputData, testSchemas.basic);
      expect(result).toEqual(expectedData);
      expect(result.extraProperty).toBeUndefined();
    });
  });

  describe("Schema Validation Error Cases", () => {
    test("should throw error for missing required parameters", () => {
      const invalidData = { stringWithDefault: "test" };

      assertSchemaValidationError(
        schemaChecker,
        invalidData,
        testSchemas.basic,
        /missing required parameter 'numberRequired'/
      );
    });

    test("should validate requiredOneOf constraints", () => {
      const validData = { numberRequired: 42 };
      const expectedData = { ...validData, stringWithDefault: "Hello" };

      assertSchemaValidation(schemaChecker, validData, testSchemas.basic, expectedData, [
        "numberRequired",
        "stringOptional",
      ]);
    });

    test("should throw error when requiredOneOf is not satisfied", () => {
      const invalidData = { numberRequired: 42 }; // Valid data but missing requiredOneOf fields

      assertSchemaValidationError(
        schemaChecker,
        invalidData,
        testSchemas.basic,
        /missing required parameter one of integerOptional, stringOptional is required/,
        ["integerOptional", "stringOptional"]
      );
    });
  });

  describe("Zod Schema Support", () => {
    test("should validate native Zod schemas", () => {
      const zodSchema = z.object({
        name: z.string(),
        age: z.number().min(0),
        email: z.string().email().optional(),
      });

      const validData = { name: "John", age: 25, email: "john@example.com" };
      assertSchemaValidation(schemaChecker, validData, zodSchema, validData);
    });

    test("should handle Zod validation errors", () => {
      const zodSchema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const invalidData = { name: "John" };
      assertSchemaValidationError(schemaChecker, invalidData, zodSchema, /missing required parameter 'age'/);
    });

    test("should support Zod schema with requiredOneOf", () => {
      const zodSchema = z.object({
        email: z.string().email().optional(),
        phone: z.string().optional(),
        name: z.string(),
      });

      const validData = { name: "John", email: "john@example.com" };
      assertSchemaValidation(schemaChecker, validData, zodSchema, validData, ["email", "phone"]);
    });

    test("should handle Zod requiredOneOf validation errors", () => {
      const zodSchema = z.object({
        email: z.string().email().optional(),
        phone: z.string().optional(),
        name: z.string(),
      });

      const invalidData = { name: "John" };
      assertSchemaValidationError(
        schemaChecker,
        invalidData,
        zodSchema,
        /missing required parameter one of email, phone is required/,
        ["email", "phone"]
      );
    });
  });

  describe("Advanced Schema Features", () => {
    test("should handle numeric constraints", () => {
      const constrainedSchema = {
        score: { type: "Number", params: { min: 0, max: 100 }, required: true },
        rating: { type: "Integer", params: { min: 1, max: 5 }, required: true },
      };

      const validData = { score: 85.5, rating: 4 };
      assertSchemaValidation(schemaChecker, validData, constrainedSchema, validData);
    });

    test("should reject values violating numeric constraints", () => {
      const constrainedSchema = {
        score: { type: "Number", params: { min: 0, max: 100 }, required: true },
      };

      const invalidData = { score: 150 };
      // The schema checker validates required fields first, then validates constraints
      // So we need to provide a valid structure but with constraint violation
      expect(() => schemaChecker(invalidData, constrainedSchema)).toThrow();
    });

    test("should handle default values in ISchemaType", () => {
      const schemaWithDefaults = {
        name: { type: "String", required: true },
        status: { type: "String", default: "active", required: false },
      };

      const inputData = { name: "John" };
      const expectedData = { name: "John", status: "active" };

      assertSchemaValidation(schemaChecker, inputData, schemaWithDefaults, expectedData);
    });

    test("should validate ENUM in ISchemaType", () => {
      const enumSchema = {
        status: { type: "ENUM", params: ["active", "inactive"], required: true },
      };

      const validData = { status: "active" };
      assertSchemaValidation(schemaChecker, validData, enumSchema, validData);
    });

    test("should reject invalid ENUM values", () => {
      const enumSchema = {
        status: { type: "ENUM", params: ["active", "inactive"], required: true },
      };

      const invalidData = { status: "unknown" };
      assertSchemaValidationError(schemaChecker, invalidData, enumSchema, /should be valid ENUM/);
    });

    test("should handle Array validation in ISchemaType", () => {
      const arraySchema = {
        tags: { type: "Array", params: "String", required: true },
      };

      const validData = { tags: ["tag1", "tag2", "tag3"] };
      assertSchemaValidation(schemaChecker, validData, arraySchema, validData);
    });

    test("should handle Array with object params", () => {
      const arraySchema = {
        scores: { type: "Array", params: { type: "Integer" }, required: true },
      };

      const validData = { scores: [1, 2, 3] };
      assertSchemaValidation(schemaChecker, validData, arraySchema, validData);
    });

    test("should throw error for invalid schema type", () => {
      const invalidSchema = "not a valid schema";
      const data = { test: "value" };

      expect(() => schemaChecker(data, invalidSchema as any)).toThrow("Invalid schema type");
    });
  });
});

describe("Utility Functions - Type Detection and Conversion", () => {
  // Import utility functions for testing
  const { isZodSchema, isISchemaType, isISchemaTypeRecord, createZodSchema } = require("../../dist/lib/params");

  describe("Type Detection Functions", () => {
    test("should correctly detect Zod schemas", () => {
      const zodSchema = z.string();
      const nonZodSchema = { type: "String" };

      expect(isZodSchema(zodSchema)).toBe(true);
      expect(isZodSchema(nonZodSchema)).toBe(false);
      expect(isZodSchema(null)).toBe(false);
      expect(isZodSchema(undefined)).toBe(false);
      expect(isZodSchema("string")).toBe(false);
      expect(isZodSchema({})).toBe(false);
    });

    test("should correctly detect ISchemaType objects", () => {
      const schemaType = { type: "String", comment: "test" };
      const zodSchema = z.string();
      const invalidType = { notType: "String" };

      expect(isISchemaType(schemaType)).toBe(true);
      expect(isISchemaType(zodSchema)).toBe(false);
      expect(isISchemaType(invalidType)).toBe(false);
      expect(isISchemaType(null)).toBe(false);
      expect(isISchemaType("string")).toBe(false);
    });

    test("should correctly detect ISchemaTypeRecord objects", () => {
      const validRecord = {
        field1: { type: "String" },
        field2: { type: "Number" },
      };
      const invalidRecord = {
        field1: { type: "String" },
        field2: z.string(),
      };
      const zodSchema = z.object({});

      expect(isISchemaTypeRecord(validRecord)).toBe(true);
      expect(isISchemaTypeRecord(invalidRecord)).toBe(false);
      expect(isISchemaTypeRecord(zodSchema)).toBe(false);
      expect(isISchemaTypeRecord(null)).toBe(false);
      expect(isISchemaTypeRecord("string")).toBe(false);
    });
  });

  describe("Schema Creation Functions", () => {
    test("should create Zod schema from string type", () => {
      const schema = createZodSchema("string");
      expect(schema.parse("test")).toBe("test");
    });

    test("should create Zod schema from ISchemaType", () => {
      const schemaType = { type: "Number", params: { min: 0, max: 100 } };
      const schema = createZodSchema(schemaType);
      expect(schema.parse(50)).toBe(50);
      expect(schema.parse("75")).toBe(75);
    });

    test("should handle ENUM type creation", () => {
      const enumType = { type: "ENUM", params: ["A", "B", "C"] };
      const schema = createZodSchema(enumType);
      expect(schema.parse("A")).toBe("A");

      expect(() => schema.parse("D")).toThrow();
    });

    test("should throw error for ENUM without params", () => {
      const enumType = { type: "ENUM" };
      expect(() => createZodSchema(enumType)).toThrow("ENUM type requires params");
    });

    test("should handle Array type creation", () => {
      const arrayType = { type: "Array", params: "String" };
      const schema = createZodSchema(arrayType);
      expect(schema.parse(["a", "b", "c"])).toEqual(["a", "b", "c"]);
    });

    test("should handle Array with object params", () => {
      const arrayType = { type: "Array", params: { type: "Integer" } };
      const schema = createZodSchema(arrayType);
      expect(schema.parse([1, 2, 3])).toEqual([1, 2, 3]);
    });

    test("should handle default values", () => {
      const schemaType = { type: "String", default: "default_value" };
      const schema = createZodSchema(schemaType);
      expect(schema.parse(undefined)).toBe("default_value");
    });

    test("should handle JSON type", () => {
      const jsonType = { type: "JSON" };
      const schema = createZodSchema(jsonType);
      expect(schema.parse({ test: "value" })).toEqual({ test: "value" });
    });

    test("should fallback to unknown type", () => {
      const unknownType = { type: "UnknownType" };
      const schema = createZodSchema(unknownType);
      expect(schema.parse("anything")).toBe("anything");
    });
  });
});

describe("ParamsChecker - Edge Cases and Advanced Features", () => {
  describe("Format Processing", () => {
    test("should handle Array type with format processing", () => {
      const arrayType = { type: "Array", params: { type: "TrimString" } };
      const result = paramsChecker("testArray", [" hello ", " world "], arrayType);
      expect(result).toEqual(["hello", "world"]);
    });

    test("should handle JSON type with invalid JSON string", () => {
      const jsonType = { type: "JSON" };
      expect(() => paramsChecker("testJson", "invalid json", jsonType)).toThrow(/should be valid JSON/);
    });

    test("should handle JSON type with format false", () => {
      const jsonType = { type: "JSON", format: false };
      const result = paramsChecker("testJson", '{"key": "value"}', jsonType);
      expect(result).toBe('{"key": "value"}');
    });

    test("should handle Boolean type with format false", () => {
      const boolType = { type: "Boolean", format: false };
      const result = paramsChecker("testBool", true, boolType);
      expect(result).toBe("true");
    });

    test("should handle Number type with format false", () => {
      const numberType = { type: "Number", format: false };
      const result = paramsChecker("testNumber", 123, numberType);
      expect(result).toBe("123");
    });
  });

  describe("Constraint Validation", () => {
    test("should validate Integer with decimal rejection", () => {
      const intType = { type: "Integer" };
      expect(() => paramsChecker("testInt", "123.45", intType)).toThrow(/should be valid Integer/);
    });

    test("should validate Number with min/max constraints", () => {
      const numberType = { type: "Number", params: { min: 0, max: 100 } };
      expect(() => paramsChecker("testNumber", "150", numberType)).toThrow(/should be valid Number/);
    });

    test("should handle ENUM with mixed types", () => {
      const enumType = { type: "ENUM", params: ["string", 123, true] };

      expect(paramsChecker("testEnum", "string", enumType)).toBe("string");
      expect(paramsChecker("testEnum", 123, enumType)).toBe(123);
      expect(paramsChecker("testEnum", true, enumType)).toBe(true);
    });
  });

  describe("Error Handling", () => {
    test("should handle transform errors gracefully", () => {
      const numberType = { type: "Number" };
      expect(() => paramsChecker("testNumber", "not-a-number", numberType)).toThrow(/should be valid Number/);
    });

    test("should handle Boolean transform errors", () => {
      const boolType = { type: "Boolean" };
      expect(() => paramsChecker("testBool", "maybe", boolType)).toThrow(/should be valid Boolean/);
    });

    test("should propagate array element validation errors", () => {
      const arrayType = { type: "Array", params: { type: "Integer" } };
      expect(() => paramsChecker("testArray", [1, "invalid", 3], arrayType)).toThrow(/should be valid Integer/);
    });
  });
});

describe("ResponseChecker - Output Validation", () => {
  const { responseChecker } = require("../../dist/lib/params");

  test("should validate response with ISchemaType", () => {
    const schema = { type: "String" };
    const result = responseChecker({} as any, "test", schema);
    expect(result).toEqual({ ok: true, message: "success", value: "test" });
  });

  test("should validate response with Zod schema", () => {
    const zodSchema = z.object({ name: z.string(), age: z.number() });
    const validData = { name: "John", age: 30 };
    const result = responseChecker({} as any, validData, zodSchema);
    expect(result).toEqual({ ok: true, message: "success", value: validData });
  });

  test("should validate response with ISchemaTypeRecord", () => {
    const schema = {
      name: { type: "String" },
      age: { type: "Number" },
    };
    const validData = { name: "John", age: 30 };
    const result = responseChecker({} as any, validData, schema);
    expect(result).toEqual({ ok: true, message: "success", value: validData });
  });

  test("should return original data on validation failure", () => {
    const schema = { type: "String" };
    const invalidData = { value: 123 };
    const result = responseChecker({} as any, invalidData, schema);
    expect(result).toEqual(invalidData);
  });

  test("should handle invalid schema types", () => {
    const invalidSchema = "invalid";
    const data = { test: "value" };
    const result = responseChecker({} as any, data, invalidSchema as any);
    expect(result).toEqual(data);
  });
});
