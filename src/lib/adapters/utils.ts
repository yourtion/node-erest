/**
 * @file Adapter Utilities
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import type API from "../api.js";
import type { Context, IAdapterGroupInfo, Middleware } from "./types.js";

export interface BuildHandlerChainOptions<T> {
  /** Global before hooks */
  beforeHooks: Set<T>;
  /** API schema */
  api: API<T>;
  /** Params checker middleware */
  checker: T;
  /** Optional group info for group-based routing */
  groupInfo?: IAdapterGroupInfo<T>;
}

/**
 * Build unified handler chain for all frameworks
 * Order: beforeHooks -> groupBefore -> apiBeforeHooks -> checker -> groupMiddleware -> apiMiddlewares -> handler
 *
 * @param options Handler chain options
 * @returns Array of handlers in correct execution order
 */
export function buildHandlerChain<T>(options: BuildHandlerChainOptions<T>): T[] {
  const { beforeHooks, api, checker, groupInfo } = options;

  const handlers = [
    ...Array.from(beforeHooks),
    ...(groupInfo?.before ?? []),
    ...Array.from(api.options.beforeHooks),
    checker,
    ...(groupInfo?.middleware ?? []),
    ...Array.from(api.options.middlewares),
    api.options.handler,
  ].filter((h): h is T => typeof h === "function");

  return handlers;
}

/**
 * 洋葱式 compose：把标准化 Middleware 数组串成一个可执行的链。
 *
 * 借鉴 Koa 的洋葱模型：每个中间件可在 `await next()` 前后执行逻辑，
 * 不调用 next 则终止链。dispatcher 捕获中间件抛出的错误并向上抛（由框架错误中间件处理）。
 *
 * @param middlewares 标准化中间件数组
 * @returns 接收 Context 的执行器，返回 Promise（链执行完毕）
 */
export function compose(middlewares: Middleware[]): (ctx: Context) => Promise<void> {
  return function dispatch(ctx: Context): Promise<void> {
    let index = -1;
    function execute(i: number): Promise<void> | void {
      if (i <= index) return Promise.reject(new Error("next() called multiple times"));
      index = i;
      const fn = middlewares[i];
      if (!fn) return;
      try {
        return Promise.resolve(fn(ctx, () => execute(i + 1)));
      } catch (err) {
        return Promise.reject(err);
      }
    }
    return execute(0) as Promise<void>;
  };
}
