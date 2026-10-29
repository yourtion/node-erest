/** Koa adapter: native routing and I/O, shared erest execution semantics. */
import {
  ERest as ERestCtor,
  createParamsChecker,
  createDispatcher,
  createErrorResponder,
  registerOptionsRoute,
} from "erest";
import type { API, ERest, Envelopers, LifecycleHooks, Context, FrameworkAdapter, Middleware, Reply } from "erest";
import type { Context as KoaContext, Middleware as KoaMiddleware } from "koa";
export type KoaRaw = KoaContext;
export class KoaAdapter<T = unknown> implements FrameworkAdapter<T, KoaRaw> {
  readonly name = "koa" as const;
  makeParamsChecker(erest: ERest<T>, api: API<T>): T {
    return createParamsChecker(erest, api);
  }
  bindRoute(router: unknown, api: API<T>, handlers: T[], hooks?: LifecycleHooks, envelopers?: Envelopers): void {
    const dispatch = createDispatcher(handlers as unknown as Middleware[], hooks, envelopers);
    const nativeMiddleware: KoaMiddleware = async (ctx, next) => {
      const stdCtx = createKoaContext(ctx);
      (ctx as KoaContext & { $ctx?: Context }).$ctx = stdCtx;
      await dispatch(stdCtx);
      if (!(stdCtx.reply as { __sent?: boolean }).__sent) await next();
    };
    const routes = router as Record<string, (path: string, handler: KoaMiddleware) => void>;
    routes[String(api.options.method)](String(api.options.path), nativeMiddleware);
    registerOptionsRoute(router as object, String(api.options.path), String(api.options.method), (allow) => {
      routes.options(String(api.options.path), (ctx) => {
        ctx.set("Allow", allow());
        ctx.status = 204;
      });
    });
  }
  createGroupRouter(RouterCtor: unknown, prefix: string): unknown {
    return new (RouterCtor as new (options: { prefix?: string }) => unknown)({
      prefix: prefix ? (prefix.startsWith("/") ? prefix : `/${prefix}`) : undefined,
    });
  }
  attachGroupRouter(app: unknown, groupRouter: unknown, _prefix: string): void {
    const native = app as { use: (middleware: unknown) => void };
    const router = groupRouter as { routes: () => unknown; allowedMethods: () => unknown };
    native.use(router.routes());
    native.use(router.allowedMethods());
  }
}
function createKoaContext(native: KoaContext): Context {
  return {
    method: native.method.toUpperCase(),
    path: native.path,
    headers: native.headers as Record<string, string>,
    params: native.params ?? {},
    query: native.query,
    body: (native.request as { body?: unknown }).body ?? {},
    state: {},
    reply: createKoaReply(native),
  };
}
/** Install before bodyParser/routes to include native parser errors in erest's error policy. */
export function createErrorHandler<T>(service: ERest<T>): KoaMiddleware {
  const respond = createErrorResponder(service);
  return async (ctx, next) => {
    try {
      await next();
    } catch (error) {
      if (ctx.headerSent) throw error;
      const existing = (ctx as KoaContext & { $ctx?: Context }).$ctx;
      respond(existing ?? createKoaContext(ctx), error, Boolean(existing));
    }
  };
}

function createKoaReply(ctx: Record<string, unknown>): Reply<KoaRaw> & { __sent: boolean } {
  const koaCtx = ctx as { status?: number; body?: unknown; type?: string };
  const reply: Reply<KoaRaw> & { __sent: boolean } = {
    __sent: false,
    status(code: number) {
      koaCtx.status = code;
      return reply;
    },
    json(body: unknown) {
      koaCtx.type = "application/json";
      koaCtx.body = JSON.stringify(body) ?? "";
      reply.__sent = true;
    },
    send(body: string) {
      reply.__sent = true;
      koaCtx.type = "text/plain";
      koaCtx.body = body;
    },
    markSent() {
      reply.__sent = true;
    },
    raw: ctx as KoaRaw,
  };
  return reply;
}

export const koaAdapter = new KoaAdapter();

/**
 * 创建绑定 Koa 原生类型的 ERest 实例（构造时锁定 Raw 泛型）。
 * handler 的 ctx.reply.raw 自动推导为 KoaRaw（原生 Context），无需手动标注。
 *
 * 泛型 State 可选：`createERest<MyState>(options)` 让 ctx.state 类型安全（默认 Record<string,unknown>）。
 *
 * @example
 * import { createERest } from "@erest/koa";
 * const api = createERest({ info, groups, forceGroup });
 */
export function createERest<State extends Record<string, unknown> = Record<string, unknown>>(
  options: ConstructorParameters<typeof ERestCtor>[0]
): ERest<Middleware<State>, KoaRaw, State> {
  return new ERestCtor<Middleware<State>, KoaRaw, State>(options);
}
