/**
 * @file Framework Adapter Types
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import type API from "../api";
import type ERest from "../index";

/** Supported framework types */
export type FrameworkType = "express" | "koa" | "leizmweb";

/** Group info interface for adapters */
export interface IAdapterGroupInfo<T> {
  name: string;
  prefix?: string;
  middleware: T[];
  before: T[];
}

/**
 * Framework adapter interface
 * Provides unified interface for different web frameworks
 */
export interface FrameworkAdapter<T = unknown> {
  /** Framework identifier */
  readonly name: FrameworkType;

  /**
   * Create a params checker middleware for the framework
   * @param erest ERest instance
   * @param api API schema
   */
  makeParamsChecker(erest: ERest<T>, api: API<T>): T;

  /**
   * Bind a single route with handlers
   * @param router Router instance (express.Router, koa-router, etc.)
   * @param api API schema
   * @param handlers Handler chain
   */
  bindRoute(router: unknown, api: API<T>, handlers: T[]): void;

  /**
   * Create a new group router with optional prefix
   * @param RouterCtor Router constructor
   * @param prefix Optional route prefix
   */
  createGroupRouter(RouterCtor: unknown, prefix: string): unknown;

  /**
   * Attach group router to app
   * @param app Application instance
   * @param groupRouter Group router instance
   * @param prefix Route prefix
   */
  attachGroupRouter(app: unknown, groupRouter: unknown, prefix: string): void;
}

/**
 * Checker function type - used by existing public API
 */
export type CheckerFunction<T> = (erest: ERest<T>, schema: API<T>) => T;
