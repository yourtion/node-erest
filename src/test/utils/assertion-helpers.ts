/**
 * Common assertion helpers for testing
 * Provides reusable assertion patterns and utilities
 */

import { expect } from "vitest";

/**
 * Assert that an API is properly registered
 */
export function assertApiRegistered(
  api: { $apis: Map<string, any> },
  method: string,
  path: string,
  expectedKey?: string
) {
  const key = expectedKey || `${method.toUpperCase()}_${path}`;
  const apiInfo = api.$apis.get(key);

  expect(apiInfo).toBeDefined();
  expect(apiInfo?.key).toBe(key);
  expect(apiInfo?.options.method).toBe(method.toLowerCase());
  expect(apiInfo?.options.path).toBe(path);

  return apiInfo;
}

/**
 * Assert router stack order matches expected hooks
 */
export function assertRouterStackOrder(routerStack: { name: string }[], expectedOrder: string[]) {
  expect(routerStack.length).toBe(expectedOrder.length);
  const hooksName = routerStack.map((r: { name: string }) => r.name);
  expect(hooksName).toEqual(expectedOrder);
}

/**
 * Assert API response matches expected format
 */
export function assertApiResponse(response: unknown, expectedData: unknown) {
  if (typeof expectedData === "object") {
    expect(response).toEqual(expectedData);
  } else {
    expect(response).toBe(expectedData);
  }
}

/**
 * Assert error is thrown with specific message pattern
 */
export function assertThrowsWithMessage(fn: () => void, messagePattern: string | RegExp) {
  expect(fn).toThrow(messagePattern);
}

/**
 * Assert parameter validation result
 */
export function assertParamValidation(
  checker: (name: string, value: unknown, param: unknown) => unknown,
  name: string,
  value: unknown,
  param: unknown,
  expected: unknown
) {
  const result = checker(name, value, param);
  expect(result).toEqual(expected);
}

/**
 * Assert parameter validation throws error
 */
export function assertParamValidationError(
  checker: (name: string, value: unknown, param: unknown) => unknown,
  name: string,
  value: unknown,
  param: unknown,
  errorPattern: string | RegExp
) {
  expect(() => checker(name, value, param)).toThrow(errorPattern);
}

/**
 * Assert schema validation result
 */
export function assertSchemaValidation(
  checker: (data: unknown, schema: unknown, requiredOneOf?: string[]) => unknown,
  data: unknown,
  schema: unknown,
  expected: unknown,
  requiredOneOf?: string[]
) {
  const result = checker(data, schema, requiredOneOf);
  expect(result).toEqual(expected);
}

/**
 * Assert schema validation throws error
 */
export function assertSchemaValidationError(
  checker: (data: unknown, schema: unknown, requiredOneOf?: string[]) => unknown,
  data: unknown,
  schema: unknown,
  errorPattern: string | RegExp,
  requiredOneOf?: string[]
) {
  expect(() => checker(data, schema, requiredOneOf)).toThrow(errorPattern);
}

/**
 * Assert documentation contains expected content
 */
export function assertDocumentationContains(doc: string, expectedContent: string[]) {
  expectedContent.forEach((content) => {
    expect(doc).toContain(content);
  });
}

/**
 * Assert Zod schema validation
 */
export function assertZodValidation(
  schema: { safeParse: (data: unknown) => { success: boolean; data?: unknown } },
  validData: unknown,
  invalidData?: unknown
) {
  // Test valid data
  const validResult = schema.safeParse(validData);
  expect(validResult.success).toBe(true);
  if (validResult.success) {
    expect(validResult.data).toEqual(validData);
  }

  // Test invalid data if provided
  if (invalidData !== undefined) {
    const invalidResult = schema.safeParse(invalidData);
    expect(invalidResult.success).toBe(false);
  }
}
