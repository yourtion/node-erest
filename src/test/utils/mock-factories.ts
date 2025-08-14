/**
 * Mock factories for creating test doubles
 * Provides reusable mock objects and functions
 */

import { vi } from "vitest";

/**
 * Create a mock hook function with specified name
 */
export function createMockHook(name: string, value: unknown = 1) {
  const mockFn = vi.fn((req: unknown, _res: unknown, next: () => void) => {
    req[`$${name}`] = value;
    next();
  });

  // Set function name for testing
  Object.defineProperty(mockFn, "name", { value: name });

  return mockFn;
}

/**
 * Create a mock Express request object
 */
export function createMockRequest(params: Record<string, unknown> = {}, headers: Record<string, unknown> = {}) {
  return {
    $params: params,
    headers,
    query: {},
    body: {},
    params: {},
  };
}

/**
 * Create a mock Express response object
 */
export function createMockResponse() {
  const res = {
    end: vi.fn(),
    json: vi.fn(),
    status: vi.fn().mockReturnThis(),
    send: vi.fn(),
    type: "",
    body: null,
  };

  return res;
}

/**
 * Create a mock Koa context object
 */
export function createMockKoaContext(params: Record<string, unknown> = {}) {
  return {
    $params: params,
    request: {
      body: {},
      query: {},
      headers: {},
    },
    response: {
      body: null,
      status: 200,
    },
    type: "",
    body: null,
    status: 200,
  };
}

/**
 * Create a mock router with stack tracking
 */
export function createMockRouter() {
  const stack: unknown[] = [];

  return {
    stack,
    get: vi.fn((path: string, ...handlers: unknown[]) => {
      stack.push({
        route: {
          path,
          stack: handlers.map((h) => ({ name: h.name || "anonymous" })),
        },
      });
    }),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
    use: vi.fn(),
  };
}

/**
 * Create a mock Express app
 */
export function createMockExpressApp() {
  const router = {
    stack: [] as unknown[],
  };

  return {
    _router: router,
    use: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
    listen: vi.fn(() => ({ close: vi.fn() })),
  };
}

/**
 * Create a mock server instance
 */
export function createMockServer() {
  return {
    listen: vi.fn(),
    close: vi.fn(),
    address: vi.fn(() => ({ port: 3000 })),
  };
}

/**
 * Create mock Zod schema
 */
export function createMockZodSchema(parseResult: unknown = { success: true, data: {} }) {
  return {
    parse: vi.fn((data: unknown) => {
      if ((parseResult as any).success) {
        return (parseResult as any).data || data;
      }
      throw new Error("Validation failed");
    }),
    safeParse: vi.fn(() => parseResult),
    _def: {
      typeName: "ZodObject",
      shape: () => ({}),
    },
  };
}

/**
 * Create mock ERest instance for testing
 */
export function createMockERestInstance() {
  const apis = new Map();

  return {
    api: {
      $apis: apis,
      get: vi.fn().mockReturnThis(),
      post: vi.fn().mockReturnThis(),
      put: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      patch: vi.fn().mockReturnThis(),
      group: vi.fn().mockReturnThis(),
      title: vi.fn().mockReturnThis(),
      query: vi.fn().mockReturnThis(),
      body: vi.fn().mockReturnThis(),
      params: vi.fn().mockReturnThis(),
      headers: vi.fn().mockReturnThis(),
      register: vi.fn().mockReturnThis(),
      beforeHooks: new Set(),
      afterHooks: new Set(),
    },
    test: {
      get: vi.fn().mockReturnThis(),
      post: vi.fn().mockReturnThis(),
      put: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      patch: vi.fn().mockReturnThis(),
      success: vi.fn(),
      error: vi.fn(),
      raw: vi.fn(),
    },
    paramsChecker: vi.fn(),
    schemaChecker: vi.fn(),
    bindRouter: vi.fn(),
    initTest: vi.fn(),
  };
}

/**
 * Create standard hook order for testing
 */
export const STANDARD_HOOK_ORDER = {
  basic: ["globalBefore", "beforHook", "apiParamsChecker", "middleware", "handler"],
  withGroup: ["globalBefore", "subBefore", "beforHook", "apiParamsChecker", "subMidd", "middleware", "handler"],
} as const;

/**
 * Create a set of standard hooks for testing
 */
export function createStandardHooks() {
  return {
    globalBefore: createMockHook("globalBefore"),
    globalAfter: createMockHook("globalAfter"),
    beforHook: createMockHook("beforHook"),
    middleware: createMockHook("middleware"),
    subBefore: createMockHook("subBefore"),
    subMidd: createMockHook("subMidd"),
  };
}
