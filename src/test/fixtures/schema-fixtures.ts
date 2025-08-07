/**
 * Schema-related test fixtures
 * Provides consistent schema definitions for testing
 */

import { z } from "zod";
import { build, TYPES } from "../helper";

/**
 * ISchemaType fixtures for testing legacy schema format
 */
export const iSchemaFixtures = {
  user: {
    name: build(TYPES.String, "User name", true),
    age: build(TYPES.Integer, "User age", false),
    email: build(TYPES.Email, "Email address", false),
    isActive: build(TYPES.Boolean, "Is active", false, true),
  },

  product: {
    id: build(TYPES.String, "Product ID", true),
    title: build(TYPES.String, "Product title", true),
    price: build(TYPES.Number, "Price", true, undefined, { min: 0 }),
    inStock: build(TYPES.Boolean, "In stock", false, true),
    tags: build(TYPES.Array, "Tags", false, undefined, TYPES.String),
  },

  enumTest: {
    status: build(TYPES.ENUM, "Status", true, undefined, ["active", "inactive", "pending"]),
    priority: build(TYPES.ENUM, "Priority", false, "medium", ["low", "medium", "high"]),
  },

  arrayTest: {
    stringArray: build(TYPES.Array, "String array", false, undefined, TYPES.String),
    numberArray: build(TYPES.Array, "Number array", false, undefined, TYPES.Integer),
    objectArray: build(TYPES.Array, "Object array", false, undefined, {
      id: build(TYPES.String, "ID", true),
      name: build(TYPES.String, "Name", true),
    }),
  },

  jsonTest: {
    metadata: build(TYPES.JSON, "Metadata", false),
    config: build(TYPES.JSON, "Configuration", true),
  },

  constraintsTest: {
    score: build(TYPES.Number, "Score", true, undefined, { min: 0, max: 100 }),
    rating: build(TYPES.Integer, "Rating", true, undefined, { min: 1, max: 5 }),
    username: build(TYPES.String, "Username", true, undefined, { min: 3, max: 20 }),
  },
} as const;

/**
 * Zod schema fixtures for testing modern schema format
 */
export const zodFixtures = {
  user: z.object({
    name: z.string().min(1).max(50),
    age: z.number().int().min(0).max(150).optional(),
    email: z.string().email().optional(),
    isActive: z.boolean().default(true),
    createdAt: z.date().default(() => new Date()),
  }),

  product: z.object({
    id: z.string().uuid(),
    title: z.string().min(1).max(100),
    price: z.number().positive(),
    inStock: z.boolean().default(true),
    tags: z.array(z.string()).optional(),
    metadata: z
      .object({
        category: z.string(),
        brand: z.string().optional(),
        weight: z.number().positive().optional(),
      })
      .optional(),
  }),

  enumTest: z.object({
    status: z.enum(["active", "inactive", "pending"]),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
    type: z.enum(["basic", "premium", "enterprise"]).optional(),
  }),

  arrayTest: z.object({
    strings: z.array(z.string()),
    numbers: z.array(z.number()),
    objects: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        value: z.number().optional(),
      })
    ),
    mixed: z.array(z.union([z.string(), z.number()])),
  }),

  unionTest: z.object({
    value: z.union([z.string(), z.number()]),
    optional: z.union([z.string(), z.number()]).optional(),
    complex: z.union([z.string(), z.object({ type: z.literal("object"), data: z.any() }), z.array(z.string())]),
  }),

  lazyTest: z.lazy(() =>
    z.object({
      id: z.string(),
      name: z.string(),
      parent: z.lazy(() => zodFixtures.lazyTest).optional(),
      children: z.array(z.lazy(() => zodFixtures.lazyTest)).optional(),
    })
  ),

  complexNested: z.object({
    user: zodFixtures.user,
    products: z.array(zodFixtures.product),
    settings: z.object({
      theme: z.enum(["light", "dark"]).default("light"),
      notifications: z.object({
        email: z.boolean().default(true),
        push: z.boolean().default(false),
        sms: z.boolean().default(false),
      }),
      preferences: z.record(z.string(), z.any()).optional(),
    }),
  }),
} as const;

/**
 * Test data for schema validation
 */
export const schemaTestData = {
  validUser: {
    name: "John Doe",
    age: 30,
    email: "john@example.com",
    isActive: true,
  },

  invalidUser: {
    name: "",
    age: -1,
    email: "invalid-email",
    isActive: "maybe",
  },

  partialUser: {
    name: "Jane Doe",
  },

  validProduct: {
    id: "550e8400-e29b-41d4-a716-446655440000",
    title: "Test Product",
    price: 99.99,
    inStock: true,
    tags: ["electronics", "gadget"],
  },

  invalidProduct: {
    id: "invalid-uuid",
    title: "",
    price: -10,
    inStock: "maybe",
    tags: "not-an-array",
  },

  validEnum: {
    status: "active",
    priority: "high",
  },

  invalidEnum: {
    status: "unknown",
    priority: "invalid",
  },

  validArray: {
    strings: ["hello", "world"],
    numbers: [1, 2, 3],
    objects: [
      { id: "1", name: "Object 1", value: 10 },
      { id: "2", name: "Object 2" },
    ],
  },

  invalidArray: {
    strings: ["hello", 123],
    numbers: [1, "two", 3],
    objects: [
      { id: "1" }, // missing name
      { id: 2, name: "Object 2" }, // id should be string
    ],
  },
} as const;

/**
 * Schema validation error patterns
 */
export const schemaErrorPatterns = {
  missingRequired: /missing required parameter/,
  invalidType: /incorrect parameter.*should be valid/,
  invalidEnum: /should be valid ENUM/,
  invalidArray: /should be valid Array/,
  invalidJson: /should be valid JSON/,
  requiredOneOf: /missing required parameter one of.*is required/,
  zodValidation: /Invalid/,
} as const;

/**
 * Mock schema registry data
 */
export const mockSchemaRegistry = {
  User: zodFixtures.user,
  Product: zodFixtures.product,
  EnumTest: zodFixtures.enumTest,
  ArrayTest: zodFixtures.arrayTest,
  UnionTest: zodFixtures.unionTest,
  LazyTest: zodFixtures.lazyTest,
  ComplexNested: zodFixtures.complexNested,
} as const;

/**
 * Documentation test fixtures
 */
export const docFixtures = {
  expectedMarkdownSections: ["# 数据类型", "## 注册类型", "## Schema定义"],

  expectedSwaggerDefinitions: {
    User: {
      type: "object",
      properties: {
        name: { type: "string", description: "字符串类型" },
        age: { type: "number", description: "数字类型" },
        email: { type: "string", description: "字符串类型" },
        isActive: { type: "boolean", description: "布尔类型" },
      },
      required: ["name"],
    },
  },

  typeDescriptions: {
    string: "字符串类型",
    number: "数字类型",
    boolean: "布尔类型",
    object: "对象类型",
    array: "数组类型",
    enum: "枚举类型",
    union: "联合类型",
    optional: "可选类型",
    nullable: "可空类型",
    unknown: "未知类型",
  },
} as const;
