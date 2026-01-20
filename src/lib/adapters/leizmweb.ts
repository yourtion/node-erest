/**
 * @file @leizm/web Framework Adapter
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import type API from "../api";
import type ERest from "../index";
import { apiParamsCheck } from "../params";
import type { FrameworkAdapter } from "./types";

/**
 * @leizm/web framework adapter
 * Handles @leizm/web-specific context patterns (sync next())
 */
export class LeizmWebAdapter<T = unknown> implements FrameworkAdapter<T> {
  readonly name = "leizmweb" as const;

  makeParamsChecker(erest: ERest<T>, api: API<T>): T {
    return function apiParamsChecker(
      ctx: Record<string, unknown> & {
        request: Record<string, unknown>;
        next: () => void;
      }
    ) {
      ctx.request.$params = apiParamsCheck(
        erest as ERest<unknown>,
        api,
        ctx.request.params as Record<string, unknown> | undefined,
        ctx.request.query as Record<string, unknown> | undefined,
        ctx.request.body as Record<string, unknown> | undefined,
        ctx.request.headers as Record<string, unknown> | undefined
      );
      ctx.next();
    } as T;
  }

  bindRoute(router: unknown, api: API<T>, handlers: T[]): void {
    const routerTyped = router as Record<string, (...args: unknown[]) => unknown>;
    const method = api.options.method as string;
    routerTyped[method].bind(router)(api.options.path, ...handlers);
  }

  createGroupRouter(RouterCtor: unknown, _prefix: string): unknown {
    return new (RouterCtor as new () => unknown)();
  }

  attachGroupRouter(app: unknown, groupRouter: unknown, prefix: string): void {
    const appTyped = app as Record<string, (...args: unknown[]) => unknown>;
    const normalizedPrefix = prefix[0] === "/" ? prefix : `/${prefix}`;
    appTyped.use(normalizedPrefix, groupRouter);
  }
}

export const leizmWebAdapter = new LeizmWebAdapter();
