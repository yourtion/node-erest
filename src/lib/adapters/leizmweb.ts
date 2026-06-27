/**
 * @file @leizm/web Framework Adapter
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import type API from "../api.js";
import type ERest from "../index.js";
import type { Context, FrameworkAdapter, Middleware, Reply } from "./types.js";
import { compose } from "./utils.js";

/**
 * @leizm/web framework adapter
 *
 * 标准化改造后：bindRoute 注册单个 @leizm/web 中间件（单参数，避开按 .length 区分
 * 错误中间件的约束），内部构造标准 Context 并用 compose 串起标准化 handler 链。
 */
export class LeizmWebAdapter<T = unknown> implements FrameworkAdapter<T> {
  readonly name = "leizmweb" as const;

  /**
   * 构造标准 Context 的参数检查器（标准化 Middleware）。
   */
  makeParamsChecker(erest: ERest<T>, api: API<T>): T {
    const checker: Middleware = (ctx, next) => {
      const compiled = api.options.compiled;
      if (!compiled) return next();
      const layered = compiled.validate({
        params: ctx.params,
        query: ctx.query as Record<string, unknown> | undefined,
        body: ctx.body as Record<string, unknown> | undefined,
        headers: ctx.headers as Record<string, unknown> | undefined,
      });
      ctx.$validated = layered;
      ctx.$params = { ...layered.params, ...layered.query, ...layered.body, ...layered.headers };
      ctx.$pathParams = layered.params;
      ctx.$query = layered.query;
      ctx.$body = layered.body;
      ctx.$headers = layered.headers;
      return next();
    };
    return checker as unknown as T;
  }

  bindRoute(router: unknown, api: API<T>, handlers: T[]): void {
    const routerTyped = router as Record<string, (...args: unknown[]) => unknown>;
    const method = api.options.method as string;
    const dispatch = compose(handlers as unknown as Middleware[]);
    // 单参数中间件（length=1），避免被 @leizm/web 误判为错误处理中间件
    const nativeMiddleware = (
      ctx: Record<string, unknown> & { request: Record<string, unknown>; next: () => void }
    ) => {
      const request = ctx.request ?? {};
      const reply = createLeiReply(ctx);
      const stdCtx: Context = {
        method: String(request.method ?? ctx.method ?? "").toUpperCase(),
        path: String(request.path ?? ctx.path ?? ""),
        headers: (request.headers ?? ctx.headers ?? {}) as Record<string, string>,
        params: (request.params ?? {}) as Record<string, unknown>,
        query: (request.query ?? {}) as Record<string, unknown>,
        body: request.body,
        state: {},
        reply,
      };
      (request as { $ctx?: Context }).$ctx = stdCtx;
      // dispatch 是 compose 出来的 Promise。成功后调 ctx.next() 继续框架链；
      // 失败时直接写错误响应（@leizm/web 的 ctx.next 不接受 err 参数，
      // 且 nativeMiddleware 同步返回无法被错误中间件捕获，故直接 response.status/json）。
      return dispatch(stdCtx)
        .then(() => ctx.next())
        .catch((err: unknown) => {
          const e = err as { statusCode?: number; status?: number; message?: string };
          const code = e?.statusCode || e?.status || 500;
          const leiRes = (ctx.response ?? {}) as { status?: (c: number) => unknown; json?: (b: unknown) => void };
          leiRes.status?.(code);
          leiRes.json?.({ error: e?.message || "internal error" });
        });
    };
    routerTyped[method].bind(router)(api.options.path, nativeMiddleware);
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

/** 构造 @leizm/web 的 Reply 封装（写 ctx.response.json/status/send） */
function createLeiReply(ctx: Record<string, unknown>): Reply {
  const leiRes = (ctx.response ?? {}) as {
    status?: (c: number) => unknown;
    json?: (b: unknown) => void;
    send?: (b: string) => void;
  };
  const reply: Reply = {
    status(code: number) {
      leiRes.status?.(code);
      return reply;
    },
    json(body: unknown) {
      leiRes.json?.(body);
    },
    send(body: string) {
      leiRes.send?.(body);
    },
  };
  return reply;
}

export const leizmWebAdapter = new LeizmWebAdapter();
