/**
 * @file Adapter Utilities
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import type API from "../api";
import type { IAdapterGroupInfo } from "./types";

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
