/**
 * @file Framework Adapter Types
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import type API from "../api.js";
import type ERest from "../index.js";

/** Known framework types (three built-in adapters); third-party adapters use arbitrary string names */
export type FrameworkType = "express" | "koa" | "leizmweb" | (string & {});

/** Group info interface for adapters */
export interface IAdapterGroupInfo<T> {
  name: string;
  prefix?: string;
  middleware: T[];
  before: T[];
}

/**
 * Framework adapter interface
 * Provides unified interface for different web frameworks (Express/Koa/@leizm/web built-in via subpackages;
 * third-party adapters implement this interface with an arbitrary `name`)
 *
 * `Raw` 泛型不在接口方法签名中出现——它仅作为类型标记，由具体 adapter 实现类通过
 * `implements FrameworkAdapter<T, ExpressRaw>` 锁定，再经子包 `createERest()` 工厂透传到
 * registerTyped handler 的 `reply.raw`。故此处 no-unused-vars 不适用（类型层标记用法）。
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Raw 为类型标记，供子类 implements 锁定（见上 JSDoc）
export interface FrameworkAdapter<T = unknown, Raw = unknown> {
  /** Framework identifier (e.g. "express"/"koa"/"leizmweb", or a custom adapter name) */
  readonly name: string;

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
  bindRoute(router: unknown, api: API<T>, handlers: T[], hooks?: import("../hooks.js").LifecycleHooks): void;

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
 *
 * `raw` 是逃生舱：当需要框架特有能力（setCookie/redirect/stream/文件下载等）时，
 * 通过 `reply.raw` 访问框架原生对象。类型由 `ERest<T, Raw>` 的 Raw 泛型驱动，
 * 经子包 `createERest()` 工厂在构造时锁定。
 */
export interface Reply<Raw = unknown> {
  /** 设置 HTTP 状态码并返回自身，支持链式调用 */
  status(code: number): this;
  /** 以 JSON 写入响应体 */
  json(body: unknown): void;
  /** 以纯文本写入响应体 */
  send(body: string): void;
  /** 框架原生对象逃生舱（setCookie/redirect/stream/文件下载等） */
  readonly raw: Raw;
}

/**
 * 框架无关的请求上下文。
 *
 * 由各 adapter 在中间件链最前面构造并注入，让 before/middleware/handler 用统一的
 * `(ctx, next)` 签名，无需关心框架原生 ctx/res 差异。同一份中间件可被
 * Express / Koa / @leizm/web 三个框架复用。
 *
 * params/query/body 为框架原始请求数据（校验前的原始值，由 checker 校验后填入 $validated）。
 */
export interface Context {
  /** 请求方法（GET/POST/...），大写 */
  readonly method: string;
  /** 请求路径（日志/计时用） */
  readonly path: string;
  /** 请求头（大小写不敏感读取；底层为框架原始 headers） */
  readonly headers: Record<string, string>;
  /** 路径参数（校验前原始值，如 { id: '42' }） */
  readonly params: Record<string, unknown>;
  /** query 参数（校验前原始值） */
  readonly query: Record<string, unknown>;
  /** 请求体（校验前原始值） */
  readonly body: unknown;
  /** 跨中间件传递数据的可读写状态（替代直接写 req/ctx.currentUser） */
  readonly state: Record<string, unknown>;
  /** 框架无关响应接口（复用 Reply；中间件可提前响应/终止） */
  readonly reply: Reply<unknown>;
  /** 校验后分层参数（由 checker 注入；before/middleware 执行时尚未填充） */
  $validated?: {
    params: Record<string, unknown>;
    query: Record<string, unknown>;
    body: Record<string, unknown>;
    headers: Record<string, unknown>;
  };
  /** 校验后扁平参数（params+query+body+headers 合并，由 checker 注入；便捷读取） */
  $params?: Record<string, unknown>;
  /** 校验后路径参数（分层快捷访问器，避免同名字段覆盖） */
  $pathParams?: Record<string, unknown>;
  /** 校验后 query 参数（分层快捷访问器） */
  $query?: Record<string, unknown>;
  /** 校验后请求体（分层快捷访问器） */
  $body?: Record<string, unknown>;
  /** 校验后请求头（分层快捷访问器） */
  $headers?: Record<string, unknown>;
}

/**
 * 标准化中间件/handler 签名。
 *
 * - `ctx`：框架无关请求上下文
 * - `next`：调用链中下一个中间件；返回 Promise<void>。不调用 next 表示终止链。
 *
 * before / middleware / register / registerTyped / define 的 handler 均用此签名。
 */
export type Middleware = (ctx: Context, next: () => Promise<void> | void) => Promise<void> | void;
