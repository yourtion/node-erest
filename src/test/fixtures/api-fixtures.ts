/**
 * API-related test fixtures
 * Provides consistent test data for API testing
 */

import { build, TYPES } from "../helper";

/**
 * Standard API parameter fixtures
 */
export const apiFixtures = {
  params: {
    name: build(TYPES.String, "Your name", true),
    age: build(TYPES.Integer, "Your age", false),
    email: build(TYPES.Email, "Email address", false),
    id: build(TYPES.String, "Unique identifier", true),
    status: build(TYPES.ENUM, "Status", false, "active", ["active", "inactive", "pending"]),
    score: build(TYPES.Number, "Score", false, undefined, { min: 0, max: 100 }),
    tags: build(TYPES.Array, "Tags", false, undefined, TYPES.String),
    metadata: build(TYPES.JSON, "Metadata", false),
  },

  /**
   * Standard API definitions for testing
   */
  definitions: {
    basicGet: {
      method: "get" as const,
      path: "/test",
      title: "Basic GET Test",
      group: "Index",
    },

    postWithBody: {
      method: "post" as const,
      path: "/test",
      title: "POST with Body",
      group: "Index",
      body: {
        name: build(TYPES.String, "Name", true),
        age: build(TYPES.Integer, "Age", false),
      },
      required: ["name"],
    },

    deleteWithParams: {
      method: "delete" as const,
      path: "/test/:id",
      title: "DELETE with Params",
      group: "Index",
      params: {
        id: build(TYPES.String, "ID", true),
      },
    },

    getWithQuery: {
      method: "get" as const,
      path: "/search",
      title: "GET with Query",
      group: "Index",
      query: {
        q: build(TYPES.String, "Search query", true),
        limit: build(TYPES.Integer, "Limit", false, 10),
      },
    },

    putWithHeaders: {
      method: "put" as const,
      path: "/test",
      title: "PUT with Headers",
      group: "Index",
      headers: {
        authorization: build(TYPES.String, "Authorization", true),
      },
      body: {
        data: build(TYPES.JSON, "Data", true),
      },
    },
  },

  /**
   * Expected API responses for testing
   */
  responses: {
    success: { success: true, message: "Operation completed successfully" },
    error: { success: false, message: "Operation failed" },
    notFound: { success: false, message: "Resource not found" },
    validationError: { success: false, message: "Validation failed" },

    userData: {
      id: "user123",
      name: "John Doe",
      email: "john@example.com",
      age: 30,
      isActive: true,
    },

    productData: {
      id: "prod456",
      title: "Test Product",
      price: 99.99,
      inStock: true,
      tags: ["electronics", "gadget"],
    },

    listResponse: {
      success: true,
      data: [
        { id: 1, name: "Item 1" },
        { id: 2, name: "Item 2" },
        { id: 3, name: "Item 3" },
      ],
      total: 3,
      page: 1,
      limit: 10,
    },
  },

  /**
   * Common request data for testing
   */
  requests: {
    validUser: {
      name: "John Doe",
      email: "john@example.com",
      age: 30,
    },

    invalidUser: {
      name: "",
      email: "invalid-email",
      age: -1,
    },

    partialUser: {
      name: "Jane Doe",
    },

    validProduct: {
      title: "Test Product",
      price: 99.99,
      inStock: true,
    },

    invalidProduct: {
      title: "",
      price: -10,
      inStock: "maybe",
    },
  },
} as const;

/**
 * Hook execution order fixtures
 */
export const hookOrderFixtures = {
  basic: ["globalBefore", "beforHook", "apiParamsChecker", "middleware", "handler"],
  withGroup: ["globalBefore", "subBefore", "beforHook", "apiParamsChecker", "subMidd", "middleware", "handler"],
  minimal: ["apiParamsChecker", "handler"],
  withAfter: ["globalBefore", "beforHook", "apiParamsChecker", "middleware", "handler", "globalAfter"],
} as const;

/**
 * Group configuration fixtures
 */
export const groupFixtures = {
  basic: {
    Index: "首页",
    User: "用户管理",
    Product: "产品管理",
  },

  withPrefix: {
    v1: { name: "Version 1", prefix: "/v1" },
    v2: { name: "Version 2", prefix: "/v2" },
    admin: { name: "Admin", prefix: "/admin" },
  },

  mixed: {
    Index: "首页",
    v1: { name: "Version 1", prefix: "/v1" },
    user: { name: "User Management" },
  },
} as const;
