/**
 * @file Koa Framework Adapter
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import type API from "../api";
import type ERest from "../index";
import { apiParamsCheck } from "../params";
import type { FrameworkAdapter } from "./types";

/**
 * Koa framework adapter
 * Handles Koa-specific context patterns (async middleware)
 */
export class KoaAdapter<T = unknown> implements FrameworkAdapter<T> {
  readonly name = "koa" as const;

  makeParamsChecker(erest: ERest<T>, api: API<T>): T {
    return async function apiParamsCheckerKoa(
      ctx: Record<string, unknown> & { request: Record<string, unknown> },
      next: () => Promise<void>
    ) {
      const result = apiParamsCheck(
        erest as ERest<unknown>,
        api,
        ctx.params as Record<string, unknown> | undefined,
        ctx.request.query as Record<string, unknown> | undefined,
        ctx.request.body as Record<string, unknown> | undefined,
        ctx.request.headers as Record<string, unknown> | undefined
      );
      // 扁平参数：向后兼容 ctx.$params
      ctx.$params = result.flat;
      // 分层参数：registerTyped 的 handler 通过它获得类型安全入参
      ctx.$validated = result.layered;
      await next();
    } as T;
  }

  bindRoute(router: unknown, api: API<T>, handlers: T[]): void {
    const routerTyped = router as Record<string, (...args: unknown[]) => unknown>;
    const method = (api.options.method as string).toLowerCase();
    if (typeof routerTyped[method] === "function") {
      routerTyped[method](api.options.path, ...handlers);
    } else {
      console.error(`ERest: Invalid method ${method} for Koa router for path ${api.options.path}.`);
    }
  }

  createGroupRouter(RouterCtor: unknown, prefix: string): unknown {
    const routerPrefix = prefix ? (prefix[0] === "/" ? prefix : `/${prefix}`) : undefined;
    return new (RouterCtor as new (options?: { prefix?: string }) => unknown)(
      routerPrefix ? { prefix: routerPrefix } : {}
    );
  }

  attachGroupRouter(app: unknown, groupRouter: unknown, _prefix: string): void {
    const appTyped = app as Record<string, (...args: unknown[]) => unknown>;
    const routerTyped = groupRouter as Record<string, (...args: unknown[]) => unknown>;
    appTyped.use(routerTyped.routes());
    appTyped.use(routerTyped.allowedMethods());
  }
}

export const koaAdapter = new KoaAdapter();
