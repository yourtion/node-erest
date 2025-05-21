import * as z from 'zod';
import lib from "./lib";

const apiService = lib();
const paramsChecker = apiService.paramsChecker(); // This is ERest<any>.paramsChecker()

describe("paramsChecker with Zod Schemas", () => {
  // Test basic Zod types
  test("z.string()", () => {
    const schema = z.string();
    expect(paramsChecker("myStr", "hello", schema)).toBe("hello");
    expect(() => paramsChecker("myStr", 123, schema)).toThrow(/^参数不合法: 'myStr' Expected string, received number$/);
  });

  test("z.number()", () => {
    const schema = z.number();
    expect(paramsChecker("myNum", 123, schema)).toBe(123);
    expect(paramsChecker("myNum", "123", schema)).toBe(123); // Zod coerces
    expect(() => paramsChecker("myNum", "abc", schema)).toThrow(/^参数不合法: 'myNum' Expected number, received nan$/); // or specific Zod message
  });

  test("z.boolean()", () => {
    const schema = z.boolean();
    expect(paramsChecker("myBool", true, schema)).toBe(true);
    expect(paramsChecker("myBool", "true", schema)).toBe(true); // Zod coerces
    expect(() => paramsChecker("myBool", "notbool", schema)).toThrow(/^参数不合法: 'myBool' Expected boolean, received string$/);
  });
  
  test("z.date()", () => {
    const schema = z.date();
    const date = new Date();
    expect(paramsChecker("myDate", date, schema)).toEqual(date);
    // Zod date coercion from string needs to be ISO 8601
    const dateStr = "2023-01-01T00:00:00.000Z";
    expect(paramsChecker("myDate", dateStr, schema)).toEqual(new Date(dateStr));
    expect(() => paramsChecker("myDate", "not-a-date", schema)).toThrow(/^参数不合法: 'myDate' Invalid date$/);
  });

  test("z.enum()", () => {
    const schema = z.enum(["A", "B", "C"]);
    expect(paramsChecker("myEnum", "A", schema)).toBe("A");
    expect(() => paramsChecker("myEnum", "D", schema)).toThrow(/^参数不合法: 'myEnum' Invalid enum value. Expected 'A' | 'B' | 'C', received 'D'$/);
  });

  test("z.object()", () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    expect(paramsChecker("myObj", { name: "Test", age: 30 }, schema)).toEqual({ name: "Test", age: 30 });
    expect(() => paramsChecker("myObj", { name: "Test", age: "30" }, schema)).toThrow(/^参数不合法: 'myObj.age' Expected number, received string$/); // Zod object errors include path
  });
  
  test("z.array()", () => {
    const schema = z.array(z.number());
    expect(paramsChecker("myArr", [1, 2, 3], schema)).toEqual([1, 2, 3]);
    expect(() => paramsChecker("myArr", [1, "2", 3], schema)).toThrow(/^参数不合法: 'myArr.1' Expected number, received string$/);
  });

  test("z.json()", () => {
    const schema = z.json();
    expect(paramsChecker("myJson", '{ "key": "value" }', schema)).toEqual({ key: "value" });
    expect(() => paramsChecker("myJson", 'not json', schema)).toThrow(/^参数不合法: 'myJson' Invalid json value$/);
  });
  
  test("z.literal()", () => {
    const schema = z.literal("specific_value");
    expect(paramsChecker("myLiteral", "specific_value", schema)).toBe("specific_value");
    expect(() => paramsChecker("myLiteral", "other_value", schema)).toThrow(/^参数不合法: 'myLiteral' Invalid literal value, expected "specific_value"$/);
  });

  test("z.union()", () => {
    const schema = z.union([z.string(), z.number()]);
    expect(paramsChecker("myUnion", "hello", schema)).toBe("hello");
    expect(paramsChecker("myUnion", 123, schema)).toBe(123);
    expect(() => paramsChecker("myUnion", true, schema)).toThrow(/^参数不合法: 'myUnion' Invalid input$/); // Zod union errors can be complex
  });

  test("string transformations/refinements (e.g. email, url, min/max length)", () => {
    const emailSchema = z.string().email();
    expect(paramsChecker("myEmail", "test@example.com", emailSchema)).toBe("test@example.com");
    expect(() => paramsChecker("myEmail", "not-an-email", emailSchema)).toThrow(/^参数不合法: 'myEmail' Invalid email$/);

    const minLengthSchema = z.string().min(5);
    expect(paramsChecker("myMinStr", "abcde", minLengthSchema)).toBe("abcde");
    expect(() => paramsChecker("myMinStr", "abc", minLengthSchema)).toThrow(/^参数不合法: 'myMinStr' String must contain at least 5 character\(s\)$/);
  });

  test("number transformations/refinements (e.g. int, min/max)", () => {
    const intSchema = z.number().int();
    expect(paramsChecker("myInt", 123, intSchema)).toBe(123);
    expect(() => paramsChecker("myInt", 123.5, intSchema)).toThrow(/^参数不合法: 'myInt' Expected integer, received float$/);
    
    const minMaxSchema = z.number().min(0).max(10);
    expect(paramsChecker("myMinMax", 5, minMaxSchema)).toBe(5);
    expect(() => paramsChecker("myMinMax", 11, minMaxSchema)).toThrow(/^参数不合法: 'myMinMax' Number must be less than or equal to 10$/);
  });
  
  test("optional values and defaults", () => {
    const optionalSchema = z.string().optional();
    expect(paramsChecker("myOptStr", undefined, optionalSchema)).toBeUndefined();
    expect(paramsChecker("myOptStr", "hello", optionalSchema)).toBe("hello");

    const defaultSchema = z.string().default("default_val");
    expect(paramsChecker("myDefStr", undefined, defaultSchema)).toBe("default_val");
    expect(paramsChecker("myDefStr", "provided", defaultSchema)).toBe("provided");
  });
  
  test("nullable values", () => {
    const nullableSchema = z.string().nullable();
    expect(paramsChecker("myNullableStr", null, nullableSchema)).toBeNull();
    expect(paramsChecker("myNullableStr", "hello", nullableSchema)).toBe("hello");
    // Note: undefined would typically fail unless .optional() is also chained.
    // For a field to accept string, null, or be absent, it's z.string().nullable().optional()
  });

});
