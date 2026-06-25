/**
 * @file Express Framework Adapter
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import type API from "../api";
import type ERest from "../index";
import { apiParamsCheck } from "../params";
import type { FrameworkAdapter, Reply } from "./types";

/**
 * Express framework adapter
 * Handles Express-specific request/response patterns
 */
export class ExpressAdapter<T = unknown> implements FrameworkAdapter<T> {
  readonly name = "express" as const;

  makeParamsChecker(erest: ERest<T>, api: API<T>): T {
    return function apiParamsChecker(req: Record<string, unknown>, res: unknown, next: () => void) {
      const result = apiParamsCheck(
        erest as ERest<unknown>,
        api,
        req.params as Record<string, unknown> | undefined,
        req.query as Record<string, unknown> | undefined,
        req.body as Record<string, unknown> | undefined,
        req.headers as Record<string, unknown> | undefined
      );
      // 扁平参数：向后兼容 $params（params+query+body+headers 合并）
      req.$params = result.flat;
      // 分层参数：registerTyped / handler 直接按来源读取（避免同名字段覆盖）
      req.$validated = result.layered;
      req.$pathParams = result.layered.params;
      req.$query = result.layered.query;
      req.$body = result.layered.body;
      req.$headers = result.layered.headers;
      // 框架无关响应：封装 Express 的 res.json/status/send
      const expressRes = res as { status?: (c: number) => unknown; json?: (b: unknown) => void; end?: (b: string) => void };
      const reply: Reply = {
        status(code: number) {
          expressRes.status?.(code);
          return reply;
        },
        json(body: unknown) {
          expressRes.json?.(body);
        },
        send(body: string) {
          expressRes.end?.(body);
        },
      };
      req.$reply = reply;
      next();
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

export const expressAdapter = new ExpressAdapter();
