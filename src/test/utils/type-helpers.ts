/**
 * Type-related test helpers
 * Provides utilities for testing type validation and schema handling
 */

import { z } from "zod";
import { build, TYPES } from "../helper";

/**
 * Common type definitions for testing
 */
export const commonTypes = {
  // Basic types
  requiredString: build(TYPES.String, "Required string", true),
  optionalString: build(TYPES.String, "Optional string", false),
  stringWithDefault: build(TYPES.String, "String with default", false, "default_value"),

  // Numeric types
  requiredNumber: build(TYPES.Number, "Required number", true),
  optionalInteger: build(TYPES.Integer, "Optional integer", false),
  numberWithConstraints: build(TYPES.Number, "Number with constraints", true, undefined, { min: 0, max: 100 }),

  // Special types
  emailType: build(TYPES.Email, "Email address", false),
  enumType: build(TYPES.ENUM, "Enum type", true, undefined, ["A", "B", "C"]),
  jsonType: build(TYPES.JSON, "JSON type", false),
  arrayType: build(TYPES.Array, "Array type", false, undefined, TYPES.String),

  // Boolean and date types
  booleanType: build(TYPES.Boolean, "Boolean type", false),
  dateType: build(TYPES.Date, "Date type", false),
} as const;

/**
 * Create Zod schemas for testing
 */
export const zodSchemas = {
  userSchema: z.object({
    name: z.string().min(1),
    age: z.number().min(0).max(150),
    email: z.string().email().optional(),
    isActive: z.boolean().default(true),
  }),

  productSchema: z.object({
    id: z.string().uuid(),
    title: z.string().min(1).max(100),
    price: z.number().positive(),
    tags: z.array(z.string()).optional(),
    metadata: z
      .object({
        created: z.date(),
        updated: z.date().optional(),
      })
      .optional(),
  }),

  enumSchema: z.object({
    status: z.enum(["active", "inactive", "pending"]),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
  }),

  unionSchema: z.object({
    value: z.union([z.string(), z.number()]),
    optional: z.union([z.string(), z.number()]).optional(),
  }),

  arraySchema: z.object({
    strings: z.array(z.string()),
    numbers: z.array(z.number()),
    objects: z.array(z.object({ id: z.string(), name: z.string() })),
  }),

  lazySchema: z.lazy(() =>
    z.object({
      id: z.string(),
      parent: z.lazy(() => zodSchemas.lazySchema).optional(),
    })
  ),
} as const;

/**
 * Test data for different types
 */
export const typeTestData = {
  validData: {
    string: "test string",
    number: 42,
    integer: 10,
    boolean: true,
    email: "test@example.com",
    date: new Date(),
    array: ["item1", "item2"],
    object: { key: "value" },
    json: { parsed: true },
    enum: "A",
  },

  invalidData: {
    string: 123,
    number: "not a number",
    integer: 3.14,
    boolean: "maybe",
    email: "invalid-email",
    date: "not a date",
    array: "not an array",
    object: "not an object",
    json: "invalid json",
    enum: "invalid",
  },

  edgeCases: {
    emptyString: "",
    zero: 0,
    negativeNumber: -1,
    largeNumber: Number.MAX_SAFE_INTEGER,
    emptyArray: [],
    emptyObject: {},
    nullValue: null,
    undefinedValue: undefined,
  },
} as const;

/**
 * Create parameter validation test cases
 */
export function createParamTestCases(type: string, validValues: unknown[], invalidValues: unknown[]) {
  return {
    type,
    validCases: validValues.map((value) => ({ value, expected: value })),
    invalidCases: invalidValues.map((value) => ({ value, shouldThrow: true })),
  };
}

/**
 * Create schema validation test cases
 */
export function createSchemaTestCases(schema: unknown, validData: unknown[], invalidData: unknown[]) {
  return {
    schema,
    validCases: validData.map((data) => ({ data, expected: data })),
    invalidCases: invalidData.map((data) => ({ data, shouldThrow: true })),
  };
}

/**
 * Generate comprehensive type test suite data
 */
export function generateTypeTestSuite() {
  return {
    string: createParamTestCases(TYPES.String, ["hello", "world", "123", ""], [123, null, undefined, {}, []]),

    number: createParamTestCases(TYPES.Number, [42, 3.14, 0, -1, "123"], ["abc", null, undefined, {}, []]),

    integer: createParamTestCases(TYPES.Integer, [42, 0, -1, "123"], [3.14, "abc", null, undefined, {}, []]),

    boolean: createParamTestCases(
      TYPES.Boolean,
      [true, false, "true", "false", 1, 0],
      ["maybe", null, undefined, {}, []]
    ),

    email: createParamTestCases(
      TYPES.Email,
      ["test@example.com", "user@domain.org"],
      ["invalid-email", "test@", "@domain.com", null, undefined]
    ),

    enum: createParamTestCases(TYPES.ENUM, ["A", "B", "C"], ["D", "invalid", null, undefined, 123]),
  };
}

/**
 * Create mock type registry for testing
 */
export function createMockTypeRegistry() {
  const registry = new Map();

  // Add common types
  registry.set("TestString", z.string());
  registry.set("TestNumber", z.number());
  registry.set("TestBoolean", z.boolean());
  registry.set("TestEmail", z.string().email());
  registry.set("TestEnum", z.enum(["A", "B", "C"]));

  return registry;
}

/**
 * Create mock schema registry for testing
 */
export function createMockSchemaRegistry() {
  const registry = new Map();

  // Add common schemas
  registry.set("User", zodSchemas.userSchema);
  registry.set("Product", zodSchemas.productSchema);
  registry.set("EnumTest", zodSchemas.enumSchema);

  return registry;
}

/**
 * Validate type transformation results
 */
export function validateTypeTransformation(
  input: unknown,
  expected: unknown,
  transformer: (value: unknown) => unknown
) {
  const result = transformer(input);
  return {
    input,
    expected,
    result,
    isValid: result === expected,
  };
}

/**
 * Create comprehensive validation test data
 */
export function createValidationTestData() {
  return {
    // String validation tests
    strings: {
      valid: ["hello", "world", "123", ""],
      invalid: [123, null, undefined, {}, []],
      withConstraints: {
        minLength: { value: "hello", constraint: { min: 3 }, valid: true },
        maxLength: { value: "hi", constraint: { max: 5 }, valid: true },
        tooShort: { value: "hi", constraint: { min: 5 }, valid: false },
        tooLong: { value: "hello world", constraint: { max: 5 }, valid: false },
      },
    },

    // Number validation tests
    numbers: {
      valid: [42, 3.14, 0, -1],
      invalid: ["abc", null, undefined, {}, []],
      withConstraints: {
        min: { value: 5, constraint: { min: 0 }, valid: true },
        max: { value: 50, constraint: { max: 100 }, valid: true },
        tooSmall: { value: -1, constraint: { min: 0 }, valid: false },
        tooLarge: { value: 150, constraint: { max: 100 }, valid: false },
      },
    },

    // Array validation tests
    arrays: {
      valid: [[], ["item"], [1, 2, 3]],
      invalid: ["not array", 123, null, undefined, {}],
      withElementType: {
        stringArray: { value: ["a", "b"], elementType: "String", valid: true },
        numberArray: { value: [1, 2, 3], elementType: "Number", valid: true },
        mixedInvalid: { value: ["a", 1], elementType: "String", valid: false },
      },
    },
  };
}
