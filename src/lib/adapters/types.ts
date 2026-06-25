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

/**
 * 框架无关的响应接口。
 *
 * 由各 adapter 注入到请求对象（`$reply`），让 registerTyped 的 handler 用统一的
 * `reply.json()/status()` 写响应，从而与具体框架解耦——同一份 handler 可被
 * Express / Koa / @leizm/web 三个框架复用。
 */
export interface Reply {
  /** 设置 HTTP 状态码并返回自身，支持链式调用 */
  status(code: number): Reply;
  /** 以 JSON 写入响应体 */
  json(body: unknown): void;
  /** 以纯文本写入响应体 */
  send(body: string): void;
}
