/**
 * Test setup utilities
 * Provides common test setup and teardown functions
 */

import { vi, beforeEach, afterEach, afterAll } from "vitest";
import type ERest from "../../lib";
import lib from "../lib";

/**
 * Standard test setup configuration
 */
export interface TestSetupConfig {
  forceGroup?: boolean;
  groups?: Record<string, string | { name: string; prefix?: string }>;
  info?: {
    title?: string;
    description?: string;
    version?: string | number;
    host?: string;
    basePath?: string;
  };
}

/**
 * Create a standardized ERest instance for testing
 */
export function createTestERestInstance(config: TestSetupConfig = {}): ERest {
  return lib({
    forceGroup: config.forceGroup || false,
    groups: config.groups || {
      Index: "首页",
      Index2: "首页2",
    },
    info: config.info || {
      title: "Test API",
      description: "Test API Description",
      version: "1.0.0",
      host: "http://localhost:3000",
      basePath: "/api",
    },
  });
}

/**
 * Setup test environment with server cleanup
 */
export function setupTestEnvironment() {
  let server: any;

  afterEach(() => {
    if (server && typeof server.close === "function") {
      server.close();
      server = null;
    }
  });

  return {
    setServer: (s: any) => {
      server = s;
    },
    getServer: () => server,
  };
}

/**
 * Setup test with ERest instance and server
 */
export function setupERestTest(config: TestSetupConfig = {}) {
  let apiService: ERest;
  let server: any;

  beforeEach(() => {
    apiService = createTestERestInstance(config);
  });

  afterEach(() => {
    if (server && typeof server.close === "function") {
      server.close();
      server = null;
    }
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  return {
    getApiService: () => apiService,
    setServer: (s: any) => {
      server = s;
    },
    getServer: () => server,
  };
}

/**
 * Setup Express test environment
 */
export function setupExpressTest(config: TestSetupConfig = {}) {
  const express = require("express");
  const { getApiService, setServer, getServer } = setupERestTest(config);

  const createApp = () => {
    const app = express();
    const router = express.Router();
    return { app, router };
  };

  return {
    getApiService,
    createApp,
    setServer,
    getServer,
  };
}

/**
 * Setup Koa test environment
 */
export function setupKoaTest(config: TestSetupConfig = {}) {
  const Koa = require("koa");
  const KoaRouter = require("koa-router");
  const { getApiService, setServer, getServer } = setupERestTest(config);

  const createApp = () => {
    const app = new Koa();
    const router = new KoaRouter();
    return { app, router };
  };

  return {
    getApiService,
    createApp,
    setServer,
    getServer,
  };
}

/**
 * Common test data for parameter validation
 */
export const testData = {
  validString: "test string",
  validNumber: 42,
  validInteger: 10,
  validBoolean: true,
  validArray: ["item1", "item2", "item3"],
  validObject: { key: "value", nested: { prop: "test" } },
  validEmail: "test@example.com",
  validEnum: "active",

  invalidString: 123,
  invalidNumber: "not a number",
  invalidInteger: 3.14,
  invalidBoolean: "maybe",
  invalidArray: "not an array",
  invalidObject: "not an object",
  invalidEmail: "invalid-email",
  invalidEnum: "unknown",
} as const;

/**
 * Common schema definitions for testing
 */
export const testSchemas = {
  userSchema: {
    name: { type: "String", required: true },
    age: { type: "Integer", required: false },
    email: { type: "Email", required: false },
  },

  productSchema: {
    id: { type: "String", required: true },
    title: { type: "String", required: true },
    price: { type: "Number", required: true },
    inStock: { type: "Boolean", required: false, default: true },
  },

  enumSchema: {
    status: { type: "ENUM", params: ["active", "inactive", "pending"], required: true },
    priority: { type: "ENUM", params: ["low", "medium", "high"], required: false, default: "medium" },
  },

  arraySchema: {
    tags: { type: "Array", params: "String", required: false },
    scores: { type: "Array", params: { type: "Integer" }, required: false },
  },
} as const;

/**
 * Reset all mocks and clear state
 */
export function resetTestState() {
  vi.clearAllMocks();
  vi.resetAllMocks();
}

/**
 * Create a test suite wrapper with common setup
 */
export function createTestSuite(name: string, config: TestSetupConfig = {}) {
  return {
    name,
    setup: () => setupERestTest(config),
    setupExpress: () => setupExpressTest(config),
    setupKoa: () => setupKoaTest(config),
  };
}
