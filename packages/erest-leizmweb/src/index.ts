/**
 * @file @leizm/web Framework Adapter
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import type { API } from "erest";
import type { ERest } from "erest";
import { ERest as ERestCtor, compose } from "erest";
import type { LifecycleHooks } from "erest";
import type { Context, FrameworkAdapter, Middleware, Reply } from "erest";
import type { Context as LeiContext } from "@leizm/web";

/** @leizm/web 原生对象类型（reply.raw 在 @leizm/web 下为原生 Context） */
export type LeizmWebRaw = LeiContext;

/**
 * @leizm/web framework adapter
 *
 * 标准化改造后：bindRoute 注册单个 @leizm/web 中间件（单参数，避开按 .length 区分
 * 错误中间件的约束），内部构造标准 Context 并用 compose 串起标准化 handler 链。
 */
export class LeizmWebAdapter<T = unknown> implements FrameworkAdapter<T, LeizmWebRaw> {
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
    const method = api.options.method as string;
    const dispatch = compose(handlers as unknown as Middleware[]);
    const hasHook = Boolean(hooks && (hooks.onRequest || hooks.onValidate || hooks.onError || hooks.onResponse));
    // 单参数中间件（length=1），避免被 @leizm/web 误判为错误处理中间件
    const nativeMiddleware = (
      ctx: Record<string, unknown> & { request: Record<string, unknown>; next: (err?: unknown) => void }
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
      if (hasHook && hooks) {
        try {
          hooks.onRequest?.(stdCtx);
        } catch {
          /* ignore */
        }
      }
      return dispatch(stdCtx)
        .then(() => {
          if (hasHook && hooks) {
            try {
              hooks.onResponse?.(stdCtx);
            } catch {
              /* ignore */
            }
          }
          ctx.next();
        })
        .catch((err: unknown) => {
          if (hasHook && hooks) {
            try {
              hooks.onError?.(stdCtx, err as Error);
            } catch {
              /* ignore */
            }
          }
          // 与 express/koa adapter 对齐：re-throw 给 app 级错误中间件，而非在此吞错写死 {error}。
          // nativeMiddleware 是单参数普通中间件，ctx.next(err) 会触发 @leizm/web 的双参数错误中间件。
          ctx.next(err as Error);
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

/** 构造 @leizm/web 的 Reply 封装（写 ctx.response.json/status/send；含 raw 逃生舱：原生 ctx） */
function createLeiReply(ctx: Record<string, unknown>): Reply<LeizmWebRaw> {
  const leiRes = (ctx.response ?? {}) as {
    status?: (c: number) => unknown;
    json?: (b: unknown) => void;
    send?: (b: string) => void;
  };
  const reply: Reply<LeizmWebRaw> = {
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
    // LeizmWebRaw 是 @leizm/web 的 Context（结构含 request/response/session 等），
    // 与此处的 Record<string, unknown> 不充分重叠，需经 unknown 双重断言（同运行时桥接）
    raw: ctx as unknown as LeizmWebRaw,
  };
  return reply;
}

export const leizmWebAdapter = new LeizmWebAdapter();

/**
 * 创建绑定 @leizm/web 原生类型的 ERest 实例（构造时锁定 Raw 泛型）。
 * handler 的 reply.raw 自动推导为 LeizmWebRaw（原生 Context），无需手动标注。
 *
 * @example
 * import { createERest } from "@erest/leizmweb";
 * const api = createERest({ info, groups, forceGroup });
 */
export function createERest(options: ConstructorParameters<typeof ERestCtor>[0]): ERest<Middleware, LeizmWebRaw> {
  return new ERestCtor<Middleware, LeizmWebRaw>(options);
}
