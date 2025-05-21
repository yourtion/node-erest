import * as z from 'zod';
import lib from "../test/lib";

const apiService = lib();

const paramsChecker = apiService.paramsChecker();
const schemaChecker = apiService.schemaChecker();

// Zod schema definitions
const stringP1Schema = z.string().describe("String1");
const stringP2Schema = z.string().default("Hello").describe("String2");
const stringP3Schema = z.string().describe("String3").optional(); // Assuming not required means optional

const numPSchema = z.number().describe("Number");
const intPSchema = z.number().int().describe("Integer").optional(); // Assuming not required means optional
const enumPSchema = z.enum(["A", "B"]).or(z.literal(1)).describe("ENUM"); // Zod enums are strict
const jsonPSchema = z.json().describe("JSON"); // z.json() parses a JSON string to an unknown type

const schema1Zod = z.object({
  stringP2: stringP2Schema,
  stringP3: stringP3Schema,
  numP: numPSchema,
  intP: intPSchema,
});

const array1Schema = z.array(z.number().int()).describe("Array with Integer param");
const array2Schema = z.array(z.json()).describe("Array with JSON param");


describe("ParamsChecker", () => {
  test("simple checker success", () => {
    expect(paramsChecker("st1", "1", stringP1Schema)).toBe("1");
    // stringP3.format = true; // format is not a Zod concept in the same way
    expect(paramsChecker("st2", "1", stringP3Schema.unwrap().default("fallback"))).toBe("1"); // Test with a value
    expect(paramsChecker("nu1", "1", numPSchema)).toBe(1); // Zod will coerce "1" to 1 for z.number()
    expect(paramsChecker("en1", "A", enumPSchema)).toBe("A");
    expect(paramsChecker("json", '{ "a": 1 }', jsonPSchema)).toEqual({ a: 1 });
    // jsonP.format = false; // z.json() always parses, no raw string return for valid JSON
    // To test returning raw string, the schema would need to be z.string() and then manually JSON.parse
  });

  test("ENUM", () => {
    expect(paramsChecker("en1", 1, enumPSchema)).toBe(1);
    const fn = () => paramsChecker("en2", "C", enumPSchema);
    // Zod's error message for enums is detailed. Example: "Invalid enum value. Expected 'A' | 'B' | 1, received 'C'"
    expect(fn).toThrow(/^参数不合法: 'en2' Invalid enum value. Expected 'A' | 'B' | 1, received 'C'$/);
  });

  test("Array with Integer param", () => {
    // Zod array elements are strictly typed. ["1", 2, "99"] will fail if schema is z.array(z.number())
    // because "1" and "99" are strings. Correct input: [1, 2, 99]
    expect(paramsChecker("array1", [1, 2, 99], array1Schema)).toEqual([1, 2, 99]);
    const fn = () => paramsChecker("array1", [1, 2, "a"], array1Schema);
    // Zod error path will point to the specific element: 'array1[2]'
    // Zod message for wrong type in array: "Expected number, received string"
    expect(fn).toThrow(/^参数不合法: 'array1.2' Expected number, received string$/);
  });

  test("Array with Type param (JSON)", () => {
    // jsonP.format = true; // z.json() always parses
    expect(paramsChecker("array2", ['{ "a": 1 }', '{ "b": 2 }', '{}'], array2Schema)).toEqual([{ a: 1 }, { b: 2 }, {}]);
    const fn = () => paramsChecker("array2", ['{ "a": 1 }', "{"], array2Schema);
    // Zod error for invalid JSON string: "Invalid json value"
    expect(fn).toThrow(/^参数不合法: 'array2.1' Invalid json value$/);
  });
});

describe("SchemaChecker", () => {
  test("success", () => {
    const data = { stringP2: "a", numP: 1.02, intP: 2 }; // stringP3 is optional, so it's fine if missing
    const res = schemaChecker(data, schema1Zod);
    expect(res).toEqual({ stringP2: "a", numP: 1.02, intP: 2 }); // stringP3 will be undefined
  });

  test("remove not in schema success (strip)", () => {
    const data = { numP: 1.02, a: "xxx" }; // stringP2 is required by default by schema1Zod
    // To make schemaChecker strip, the Zod object needs .strip()
    const schema1ZodStripped = schema1Zod.strip();
    // If stringP2 is not provided, it should fail unless stringP2 is made optional or given a default.
    // For this test to pass as "remove not in schema", stringP2 must be optional or have a default.
    // Let's assume stringP2 has a default for this specific test case:
    const schemaForStripTest = z.object({
        stringP2: z.string().default("Hello"), 
        stringP3: stringP3Schema, 
        numP: numPSchema, 
        intP: intPSchema
    }).strip();
    const res = schemaChecker({ numP: 1.02, a: "xxx" }, schemaForStripTest);
    expect(res.a).toBeUndefined();
    expect(res.stringP2).toBe("Hello"); // Default value
  });

  test("required check throw", () => {
    const data = { a: "xxx" }; // numP is required by schema1Zod
    const fn = () => schemaChecker(data, schema1Zod);
    // Zod error: 'numP' Required
    expect(fn).toThrow(/^缺少参数: 'numP' is required$/);
  });

  test("requiredOneOf check ok", () => {
    const data = { numP: 123, stringP2: "defined" } as any; // stringP2 is part of schema1Zod
    // schemaChecker's requiredOneOf applies *after* Zod validation
    const res = schemaChecker(data, schema1Zod, ["numP", "stringP3"]);
    expect(res.numP).toBe(123);
  });

  test("requiredOneOf check throw", () => {
    const data = { stringP2: "Hello" }; // numP is required by schema1Zod, this will fail before requiredOneOf
    // To test requiredOneOf properly, schema1Zod needs to be valid first.
    // Let's assume data that passes schema1Zod but fails requiredOneOf:
    const validDataForSchema1 = { numP: 1, stringP2: "ok" }; // intP and stringP3 are optional
    const fn = () => schemaChecker(validDataForSchema1, schema1Zod, ["intP", "stringP3"]);
    expect(fn).toThrow(/^缺少参数: one of intP, stringP3 is required$/);
  });
});
