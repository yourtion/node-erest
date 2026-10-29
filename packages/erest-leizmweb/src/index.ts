/** LeizmWeb adapter: native routing and I/O, shared erest execution semantics. */
import {
  ERest as ERestCtor,
  createParamsChecker,
  createDispatcher,
  createErrorResponder,
  registerOptionsRoute,
  decodePathParams,
} from "erest";
import type { API, ERest, Envelopers, LifecycleHooks, Context, FrameworkAdapter, Middleware, Reply } from "erest";
import type { Context as LeiContext } from "@leizm/web";
export type LeizmWebRaw = LeiContext;
export class LeizmWebAdapter<T = unknown> implements FrameworkAdapter<T, LeizmWebRaw> {
  readonly name = "leizmweb" as const;
  makeParamsChecker(erest: ERest<T>, api: API<T>): T {
    return createParamsChecker(erest, api);
  }
  bindRoute(router: unknown, api: API<T>, handlers: T[], hooks?: LifecycleHooks, envelopers?: Envelopers): void {
    const dispatch = createDispatcher([decodePathParams, ...(handlers as unknown as Middleware[])], hooks, envelopers);
    // One argument: @leizm/web uses arity to identify ordinary middleware.
    const nativeMiddleware = (ctx: LeiContext) => {
      const stdCtx = createLeiContext(ctx);
      (ctx.request as unknown as { $ctx?: Context }).$ctx = stdCtx;
      return dispatch(stdCtx)
        .then(() => {
          if (!(stdCtx.reply as { __sent?: boolean }).__sent) ctx.next();
        })
        .catch((err: Error) => ctx.next(err));
    };
    const routes = router as Record<string, (path: string, handler: typeof nativeMiddleware) => void>;
    routes[String(api.options.method)](String(api.options.path), nativeMiddleware);
    // Match the implicit GET -> HEAD behavior of Express, Koa and H3.
    if (api.options.method === "get") routes.head(String(api.options.path), nativeMiddleware);
    registerOptionsRoute(router as object, String(api.options.path), String(api.options.method), (allow) => {
      routes.options(String(api.options.path), (ctx) => {
        ctx.response.setHeader("Allow", allow());
        ctx.response.status(204).end();
        return Promise.resolve();
      });
    });
  }
  createGroupRouter(RouterCtor: unknown, _prefix: string): unknown {
    return new (RouterCtor as new () => unknown)();
  }
  attachGroupRouter(app: unknown, groupRouter: unknown, prefix: string): void {
    (app as { use: (prefix: string, router: unknown) => void }).use(
      prefix.startsWith("/") ? prefix : `/${prefix}`,
      groupRouter
    );
  }
}
function createLeiContext(native: LeiContext): Context {
  return {
    method: String(native.request.method ?? "").toUpperCase(),
    path: native.request.path,
    headers: native.request.headers as Record<string, string>,
    params: native.request.params ?? {},
    query: native.request.query ?? {},
    body: native.request.body ?? {},
    state: {},
    reply: createLeiReply(native as unknown as Record<string, unknown>),
  };
}
/** Install after routes; the two-argument signature identifies native error middleware. */
export function createErrorHandler<T>(service: ERest<T>) {
  const respond = createErrorResponder(service);
  return (ctx: LeiContext, error: Error) => {
    if (!error) return ctx.next();
    if (ctx.response.headersSent) return ctx.next(error);
    const existing = (ctx.request as unknown as { $ctx?: Context }).$ctx;
    try {
      respond(existing ?? createLeiContext(ctx), error, Boolean(existing));
    } catch (err) {
      ctx.next(err as Error);
    }
  };
}

function createLeiReply(ctx: Record<string, unknown>): Reply<LeizmWebRaw> & { __sent: boolean } {
  const leiRes = (ctx.response ?? {}) as {
    status?: (c: number) => unknown;
    json?: (b: unknown) => void;
    end?: (b?: string) => void;
    setHeader?: (n: string, v: string) => void;
  };
  const reply: Reply<LeizmWebRaw> & { __sent: boolean } = {
    __sent: false,
    status(code: number) {
      leiRes.status?.(code);
      return reply;
    },
    json(body: unknown) {
      leiRes.json?.(body);
      reply.__sent = true;
    },
    // @leizm/web 的 response 没有 send() 方法（仅有 end/json/file），纯文本响应用 end()。
    // 此前误调不存在的 send()（可选链静默跳过）→ 响应体未写 → 框架 final handler 返回 404。
    // 修正：send 映射到 end()，并补 text/plain content-type，与 json() 的 application/json 对齐。
    send(body: string) {
      reply.__sent = true;
      leiRes.setHeader?.("Content-Type", "text/plain; charset=utf-8");
      leiRes.end?.(body);
    },
    markSent() {
      reply.__sent = true;
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
export function createERest<State extends Record<string, unknown> = Record<string, unknown>>(
  options: ConstructorParameters<typeof ERestCtor>[0]
): ERest<Middleware<State>, LeizmWebRaw, State> {
  return new ERestCtor<Middleware<State>, LeizmWebRaw, State>(options);
}
