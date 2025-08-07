import lib from "../test/lib";

const apiService = lib();

import { build, TYPES } from "../test/helper";

const paramsChecker = apiService.paramsChecker();
const schemaChecker = apiService.schemaChecker();

const stringP1 = build(TYPES.String, "String1", true);
const stringP2 = build(TYPES.String, "String2", true, "Hello");
const stringP3 = build(TYPES.String, "String3");

const numP = build(TYPES.Number, "Number", true);
const intP = build(TYPES.Integer, "Integer");
const enumP = build(TYPES.ENUM, "ENUM", true, undefined, ["A", "B", 1]);
const jsonP = build(TYPES.JSON, "JSON");

const schema1: Record<string, unknown> = { stringP2, stringP3, numP, intP };
const array1 = build(TYPES.Array, "Array with String param", true, undefined, TYPES.Integer);
const array2 = build(TYPES.Array, "Array with Type param", true, undefined, jsonP);

describe("ParamsChecker", () => {
  test("simple checker success", () => {
    expect(paramsChecker("st1", "1", stringP1)).toBe("1");
    stringP3.format = true;
    expect(paramsChecker("st2", "1", stringP3)).toBe("1");
    expect(paramsChecker("nu1", "1", numP)).toBe(1);
    expect(paramsChecker("en1", "A", enumP)).toBe("A");
    expect(paramsChecker("json", '{ "a": 1 }', jsonP)).toEqual({ a: 1 });
    jsonP.format = false;
    expect(paramsChecker("json", '{ "a": 1 }', jsonP)).toEqual('{ "a": 1 }');
  });

  test("ENUM", () => {
    expect(paramsChecker("en1", 1, enumP)).toBe(1);
    const fn = () => paramsChecker("en2", "C", enumP);
    expect(fn).toThrow("incorrect parameter 'en2' should be valid ENUM with additional restrictions: A,B,1");
  });

  test("Array with String param", () => {
    expect(paramsChecker("array1", ["1", 2, "99"], array1)).toEqual([1, 2, 99]);
    const fn = () => paramsChecker("array1", ["1", 2, "a"], array1);
    expect(fn).toThrow("incorrect parameter 'array1[2]' should be valid Integer");
  });

  test("Array with Type param", () => {
    jsonP.format = true;
    expect(paramsChecker("array2", ['{ "a": 1 }', '{ "b": 2 }', "{}"], array2)).toEqual([{ a: 1 }, { b: 2 }, {}]);
    const fn = () => paramsChecker("array2", ['{ "a": 1 }', "{"], array2);
    expect(fn).toThrow("incorrect parameter 'array2[1]' should be valid JSON");
  });
});

describe("SchemaChecker", () => {
  test("success", () => {
    const data = { stringP2: "a", numP: 1.02, intP: 2 };
    const res = schemaChecker(data, schema1);
    expect(res).toEqual(data);
  });

  test("remove not in schema success", () => {
    const data = { numP: 1.02, a: "xxx" };
    const res = schemaChecker(data, schema1) as Record<string, unknown>;
    expect(res.a).toBeUndefined();
  });

  test("requied check throw", () => {
    const data = { a: "xxx" };
    const fn = () => schemaChecker(data, schema1);
    expect(fn).toThrow("missing required parameter 'numP'");
  });

  test("requiedOneOf check ok", () => {
    const data = { numP: 123 } as Record<string, unknown>;
    const res = schemaChecker(data, schema1, ["numP", "stringP3"]);
    data.stringP2 = "Hello";
    expect(res).toEqual(data);
  });

  test("requiedOneOf check throw", () => {
    const data = { numP: 122, stringP2: "test" };
    const fn = () => schemaChecker(data, schema1, ["intP", "stringP3"]);
    expect(fn).toThrow("missing required parameter one of intP, stringP3 is required");
  });

  test("native Zod schema support", () => {
    const { z } = require("zod");
    const zodSchema = z.object({
      name: z.string(),
      age: z.number().min(0),
      email: z.string().email().optional()
    });
    
    const validData = { name: "John", age: 25, email: "john@example.com" };
    const result = schemaChecker(validData, zodSchema);
    expect(result).toEqual(validData);
  });

  test("native Zod schema missing required field", () => {
    const { z } = require("zod");
    const zodSchema = z.object({
      name: z.string(),
      age: z.number()
    });
    
    const invalidData = { name: "John" };
    const fn = () => schemaChecker(invalidData, zodSchema);
    expect(fn).toThrow("missing required parameter 'age'");
  });

  test("native Zod schema with requiredOneOf", () => {
    const { z } = require("zod");
    const zodSchema = z.object({
      email: z.string().email().optional(),
      phone: z.string().optional(),
      name: z.string()
    });
    
    const validData = { name: "John", email: "john@example.com" };
    const result = schemaChecker(validData, zodSchema, ["email", "phone"]);
    expect(result).toEqual(validData);
  });

  test("native Zod schema requiredOneOf missing", () => {
    const { z } = require("zod");
    const zodSchema = z.object({
      email: z.string().email().optional(),
      phone: z.string().optional(),
      name: z.string()
    });
    
    const invalidData = { name: "John" };
    const fn = () => schemaChecker(invalidData, zodSchema, ["email", "phone"]);
    expect(fn).toThrow("missing required parameter one of email, phone is required");
  });

  test("ISchemaType with numeric constraints", () => {
    const numericSchema = {
      score: { type: "Number", params: { min: 0, max: 100 }, required: true },
      rating: { type: "Integer", params: { min: 1, max: 5 }, required: true }
    };
    
    const validData = { score: 85.5, rating: 4 };
    const result = schemaChecker(validData, numericSchema);
    expect(result).toEqual(validData);
  });

  test("ISchemaType numeric constraints violation", () => {
    const numericSchema = {
      score: { type: "Number", params: { min: 0, max: 100 }, required: true }
    };
    
    const invalidData = { score: 150 };
    const fn = () => schemaChecker(invalidData, numericSchema);
    expect(fn).toThrow();
  });

  test("ISchemaType with default values", () => {
    const schemaWithDefaults = {
      name: { type: "String", required: true },
      status: { type: "String", default: "active", required: false }
    };
    
    const inputData = { name: "John" };
    const result = schemaChecker(inputData, schemaWithDefaults);
    expect(result).toEqual({ name: "John", status: "active" });
  });

  test("ISchemaType ENUM validation", () => {
    const enumSchema = {
      status: { type: "ENUM", params: ["active", "inactive", "pending"], required: true }
    };
    
    const validData = { status: "active" };
    const result = schemaChecker(validData, enumSchema);
    expect(result).toEqual(validData);
  });

  test("ISchemaType ENUM validation failure", () => {
    const enumSchema = {
      status: { type: "ENUM", params: ["active", "inactive"], required: true }
    };
    
    const invalidData = { status: "unknown" };
    const fn = () => schemaChecker(invalidData, enumSchema);
    expect(fn).toThrow("incorrect parameter 'status' should be valid ENUM");
  });

  test("ISchemaType Array validation", () => {
    const arraySchema = {
      tags: { type: "Array", params: "String", required: true }
    };
    
    const validData = { tags: ["tag1", "tag2", "tag3"] };
    const result = schemaChecker(validData, arraySchema);
    expect(result).toEqual(validData);
  });

  test("ISchemaType Array with object params", () => {
    const arraySchema = {
      scores: { type: "Array", params: { type: "Integer" }, required: true }
    };
    
    const validData = { scores: [1, 2, 3] };
    const result = schemaChecker(validData, arraySchema);
    expect(result).toEqual(validData);
  });

  test("invalid schema type error", () => {
    const invalidSchema = "not a valid schema";
    const data = { test: "value" };
    const fn = () => schemaChecker(data, invalidSchema as any);
    expect(fn).toThrow("Invalid schema type");
  });
});

describe("Utility Functions", () => {
  const { isZodSchema, isISchemaType, isISchemaTypeRecord, createZodSchema } = require("../../dist/lib/params");
  const { z } = require("zod");

  test("isZodSchema detection", () => {
    const zodSchema = z.string();
    const nonZodSchema = { type: "String" };
    
    expect(isZodSchema(zodSchema)).toBe(true);
    expect(isZodSchema(nonZodSchema)).toBe(false);
    expect(isZodSchema(null)).toBe(false);
    expect(isZodSchema(undefined)).toBe(false);
    expect(isZodSchema("string")).toBe(false);
    expect(isZodSchema({})).toBe(false);
  });

  test("isISchemaType detection", () => {
    const schemaType = { type: "String", comment: "test" };
    const zodSchema = z.string();
    const invalidType = { notType: "String" };
    
    expect(isISchemaType(schemaType)).toBe(true);
    expect(isISchemaType(zodSchema)).toBe(false);
    expect(isISchemaType(invalidType)).toBe(false);
    expect(isISchemaType(null)).toBe(false);
    expect(isISchemaType("string")).toBe(false);
  });

  test("isISchemaTypeRecord detection", () => {
    const validRecord = {
      field1: { type: "String" },
      field2: { type: "Number" }
    };
    const invalidRecord = {
      field1: { type: "String" },
      field2: z.string()
    };
    const zodSchema = z.object({});
    
    expect(isISchemaTypeRecord(validRecord)).toBe(true);
    expect(isISchemaTypeRecord(invalidRecord)).toBe(false);
    expect(isISchemaTypeRecord(zodSchema)).toBe(false);
    expect(isISchemaTypeRecord(null)).toBe(false);
    expect(isISchemaTypeRecord("string")).toBe(false);
  });

  test("createZodSchema with string type", () => {
    const schema = createZodSchema("string");
    expect(schema.parse("test")).toBe("test");
  });

  test("createZodSchema with ISchemaType", () => {
    const schemaType = { type: "Number", params: { min: 0, max: 100 } };
    const schema = createZodSchema(schemaType);
    expect(schema.parse(50)).toBe(50);
    expect(schema.parse("75")).toBe(75);
  });

  test("createZodSchema with ENUM", () => {
    const enumType = { type: "ENUM", params: ["A", "B", "C"] };
    const schema = createZodSchema(enumType);
    expect(schema.parse("A")).toBe("A");
    
    const fn = () => schema.parse("D");
    expect(fn).toThrow();
  });

  test("createZodSchema with ENUM missing params", () => {
    const enumType = { type: "ENUM" };
    const fn = () => createZodSchema(enumType);
    expect(fn).toThrow("ENUM type requires params");
  });

  test("createZodSchema with Array type", () => {
    const arrayType = { type: "Array", params: "String" };
    const schema = createZodSchema(arrayType);
    expect(schema.parse(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  test("createZodSchema with Array object params", () => {
    const arrayType = { type: "Array", params: { type: "Integer" } };
    const schema = createZodSchema(arrayType);
    expect(schema.parse([1, 2, 3])).toEqual([1, 2, 3]);
  });

  test("createZodSchema with default value", () => {
    const schemaType = { type: "String", default: "default_value" };
    const schema = createZodSchema(schemaType);
    expect(schema.parse(undefined)).toBe("default_value");
  });

  test("createZodSchema with JSON type", () => {
    const jsonType = { type: "JSON" };
    const schema = createZodSchema(jsonType);
    expect(schema.parse({ test: "value" })).toEqual({ test: "value" });
  });

  test("createZodSchema with unknown type fallback", () => {
    const unknownType = { type: "UnknownType" };
    const schema = createZodSchema(unknownType);
    expect(schema.parse("anything")).toBe("anything");
  });
});

describe("ParamsChecker Edge Cases", () => {
  test("Array type with format processing", () => {
    const arrayType = { type: "Array", params: { type: "TrimString" } };
    const result = paramsChecker("testArray", [" hello ", " world "], arrayType);
    expect(result).toEqual(["hello", "world"]);
  });

  test("JSON type with invalid JSON string", () => {
    const jsonType = { type: "JSON" };
    const fn = () => paramsChecker("testJson", "invalid json", jsonType);
    expect(fn).toThrow("incorrect parameter 'testJson' should be valid JSON");
  });

  test("JSON type with format false", () => {
    const jsonType = { type: "JSON", format: false };
    const result = paramsChecker("testJson", '{"key": "value"}', jsonType);
    expect(result).toBe('{"key": "value"}');
  });

  test("JSONString type with format false", () => {
    const jsonStringType = { type: "JSONString", format: false };
    const result = paramsChecker("testJsonString", '{"key": "value"}', jsonStringType);
    expect(result).toBe('{"key": "value"}');
  });

  test("Boolean type with format false", () => {
    const boolType = { type: "Boolean", format: false };
    const result = paramsChecker("testBool", true, boolType);
    expect(result).toBe("true");
  });

  test("TrimString type with format false", () => {
    const trimStringType = { type: "TrimString", format: false };
    const result = paramsChecker("testTrim", " hello ", trimStringType);
    expect(result).toBe(" hello ");
  });

  test("Number type with format false", () => {
    const numberType = { type: "Number", format: false };
    const result = paramsChecker("testNumber", 123, numberType);
    expect(result).toBe("123");
  });

  test("NullableInteger type with format false", () => {
    const nullableIntType = { type: "NullableInteger", format: false };
    const result = paramsChecker("testNullableInt", 123, nullableIntType);
    expect(result).toBe("123");
  });

  test("Integer with decimal point in string", () => {
    const intType = { type: "Integer" };
    const fn = () => paramsChecker("testInt", "123.45", intType);
    expect(fn).toThrow("incorrect parameter 'testInt' should be valid Integer");
  });

  test("Number with min/max constraint violation in string", () => {
    const numberType = { type: "Number", params: { min: 0, max: 100 } };
    const fn = () => paramsChecker("testNumber", "150", numberType);
    expect(fn).toThrow("incorrect parameter 'testNumber' should be valid Number");
  });

  test("Array element validation error propagation", () => {
    const arrayType = { type: "Array", params: { type: "Integer" } };
    const fn = () => paramsChecker("testArray", [1, "invalid", 3], arrayType);
    expect(fn).toThrow("incorrect parameter 'testArray[1]' should be valid Integer");
  });

  test("ENUM with mixed types", () => {
    const enumType = { type: "ENUM", params: ["string", 123, true] };
    const result1 = paramsChecker("testEnum", "string", enumType);
    const result2 = paramsChecker("testEnum", 123, enumType);
    const result3 = paramsChecker("testEnum", true, enumType);
    
    expect(result1).toBe("string");
    expect(result2).toBe(123);
    expect(result3).toBe(true);
  });

  test("Transform error handling", () => {
    const numberType = { type: "Number" };
    const fn = () => paramsChecker("testNumber", "not-a-number", numberType);
    expect(fn).toThrow("incorrect parameter 'testNumber' should be valid Number");
  });

  test("Boolean transform error", () => {
    const boolType = { type: "Boolean" };
    const fn = () => paramsChecker("testBool", "maybe", boolType);
    expect(fn).toThrow("incorrect parameter 'testBool' should be valid Boolean");
  });
});

describe("ResponseChecker", () => {
  const { responseChecker } = require("../../dist/lib/params");
  const { z } = require("zod");

  test("responseChecker with valid data", () => {
    const schema = { type: "String" };
    const result = responseChecker({} as any, "test", schema);
    expect(result).toEqual({ ok: true, message: "success", value: "test" });
  });

  test("responseChecker with Zod schema", () => {
    const zodSchema = z.object({ name: z.string(), age: z.number() });
    const validData = { name: "John", age: 30 };
    const result = responseChecker({} as any, validData, zodSchema);
    expect(result).toEqual({ ok: true, message: "success", value: validData });
  });

  test("responseChecker with ISchemaTypeRecord", () => {
    const schema = {
      name: { type: "String" },
      age: { type: "Number" }
    };
    const validData = { name: "John", age: 30 };
    const result = responseChecker({} as any, validData, schema);
    expect(result).toEqual({ ok: true, message: "success", value: validData });
  });

  test("responseChecker with validation failure returns original data", () => {
    const schema = { type: "String" };
    const invalidData = { value: 123 };
    const result = responseChecker({} as any, invalidData, schema);
    expect(result).toEqual(invalidData);
  });

  test("responseChecker with invalid schema type", () => {
    const invalidSchema = "invalid";
    const data = { test: "value" };
    const result = responseChecker({} as any, data, invalidSchema as any);
    expect(result).toEqual(data);
  });
});
