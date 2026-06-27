/**
 * @file Koa Framework Adapter
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import type API from "../api.js";
import type ERest from "../index.js";
import type { LifecycleHooks } from "../hooks.js";
import type { Context, FrameworkAdapter, Middleware, Reply } from "./types.js";
import { compose } from "./utils.js";

/**
 * Koa framework adapter
 *
 * 标准化改造后：bindRoute 注册一个 Koa 原生中间件，内部构造标准 Context
 * 并用 compose 串起标准化 handler 链。
 */
export class KoaAdapter<T = unknown> implements FrameworkAdapter<T> {
  readonly name = "koa" as const;

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
      // requiredOneOf 检查（多选一必填）
      const requiredOneOf = api.options.requiredOneOf;
      if (requiredOneOf && requiredOneOf.length > 0) {
        const flat = { ...layered.params, ...layered.query, ...layered.body, ...layered.headers };
        for (const names of requiredOneOf) {
          if (!names.some((n) => typeof flat[n] !== "undefined")) {
            throw erest.getError().missingParameter(`one of ${names.join(", ")} is required`);
          }
        }
      }
      ctx.$validated = layered;
      ctx.$params = { ...layered.params, ...layered.query, ...layered.body, ...layered.headers };
      ctx.$pathParams = layered.params;
      ctx.$query = layered.query;
      ctx.$body = layered.body;
      ctx.$headers = layered.headers;
      // Stage 3：onValidate hook
      const onValidate = erest.getHooks()?.onValidate;
      if (onValidate) {
        try {
          onValidate(ctx, layered);
        } catch {
          /* ignore */
        }
      }
      return next();
    };
    return checker as unknown as T;
  }

  bindRoute(router: unknown, api: API<T>, handlers: T[], hooks?: LifecycleHooks): void {
    const routerTyped = router as Record<string, (...args: unknown[]) => unknown>;
    const method = (api.options.method as string).toLowerCase();
    const dispatch = compose(handlers as unknown as Middleware[]);
    const hasHook = Boolean(hooks && (hooks.onRequest || hooks.onValidate || hooks.onError || hooks.onResponse));
    const nativeMiddleware = async (
      ctx: Record<string, unknown> & { request: Record<string, unknown> },
      next: () => Promise<void>
    ) => {
      const reply = createKoaReply(ctx);
      const stdCtx: Context = {
        method: String(ctx.method ?? ctx.request?.method ?? "").toUpperCase(),
        path: String(ctx.path ?? ctx.request?.path ?? ""),
        headers: ((ctx.headers as Record<string, string>) ?? ctx.request?.headers ?? {}) as Record<string, string>,
        params: (ctx.params ?? {}) as Record<string, unknown>,
        query: (ctx.request?.query ?? ctx.query ?? {}) as Record<string, unknown>,
        body: ctx.request?.body ?? ctx.body,
        state: {},
        reply,
      };
      (ctx as { $ctx?: Context }).$ctx = stdCtx;
      if (hasHook && hooks) {
        try {
          hooks.onRequest?.(stdCtx);
        } catch {
          /* ignore */
        }
        try {
          await dispatch(stdCtx);
          try {
            hooks.onResponse?.(stdCtx);
          } catch {
            /* ignore */
          }
        } catch (err) {
          try {
            hooks.onError?.(stdCtx, err as Error);
          } catch {
            /* ignore */
          }
          throw err;
        }
      } else {
        await dispatch(stdCtx);
      }
      await next();
    };
    if (typeof routerTyped[method] === "function") {
      routerTyped[method](api.options.path, nativeMiddleware);
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

/** 构造 Koa 的 Reply 封装（写 ctx.status / ctx.body） */
function createKoaReply(ctx: Record<string, unknown>): Reply {
  const koaCtx = ctx as { status?: number; body?: unknown; type?: string };
  const reply: Reply = {
    status(code: number) {
      koaCtx.status = code;
      return reply;
    },
    json(body: unknown) {
      koaCtx.type = "application/json";
      koaCtx.body = JSON.stringify(body);
    },
    send(body: string) {
      koaCtx.body = body;
    },
  };
  return reply;
}

export const koaAdapter = new KoaAdapter();
