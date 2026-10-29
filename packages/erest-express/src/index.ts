/** Express adapter: native routing and I/O, shared erest execution semantics. */
import {
  ERest as ERestCtor,
  createParamsChecker,
  createDispatcher,
  createErrorResponder,
  registerOptionsRoute,
} from "erest";
import type { API, ERest, Envelopers, LifecycleHooks, Context, FrameworkAdapter, Middleware, Reply } from "erest";
import type { Request, Response, ErrorRequestHandler } from "express";
export type ExpressRaw = { req: Request; res: Response };
export class ExpressAdapter<T = unknown> implements FrameworkAdapter<T, ExpressRaw> {
  readonly name = "express" as const;
  makeParamsChecker(erest: ERest<T>, api: API<T>): T {
    return createParamsChecker(erest, api);
  }
  bindRoute(router: unknown, api: API<T>, handlers: T[], hooks?: LifecycleHooks, envelopers?: Envelopers): void {
    const dispatch = createDispatcher(handlers as unknown as Middleware[], hooks, envelopers);
    const nativeMiddleware = (req: Request, res: Response, next: (error?: unknown) => void) => {
      const ctx = createExpressContext(req, res);
      (req as Request & { $ctx?: Context }).$ctx = ctx;
      dispatch(ctx)
        .then(() => {
          if (!(ctx.reply as { __sent?: boolean }).__sent) next();
        })
        .catch(next);
    };
    const routes = router as Record<string, (path: string, handler: typeof nativeMiddleware) => void>;
    routes[String(api.options.method)](String(api.options.path), nativeMiddleware);
    registerOptionsRoute(router as object, String(api.options.path), String(api.options.method), (allow) => {
      routes.options(String(api.options.path), (_req, res) => {
        res.setHeader("Allow", allow());
        res.status(204).end();
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
function createExpressContext(req: Request, res: Response): Context {
  return {
    method: req.method.toUpperCase(),
    path: req.path,
    headers: req.headers as Record<string, string>,
    params: req.params,
    query: req.query,
    body: req.body ?? {},
    state: {},
    reply: createExpressReply(req, res),
  };
}
/** Install after routes to include native parser errors in erest's error policy. */
export function createErrorHandler<T>(service: ERest<T>): ErrorRequestHandler {
  const respond = createErrorResponder(service);
  return (error, req, res, next) => {
    if (res.headersSent) return next(error);
    const existing = (req as Request & { $ctx?: Context }).$ctx;
    try {
      respond(existing ?? createExpressContext(req, res), error, Boolean(existing));
    } catch (err) {
      next(err);
    }
  };
}

function createExpressReply(req: unknown, res: unknown): Reply<ExpressRaw> & { __sent: boolean } {
  const expressRes = res as {
    status?: (c: number) => unknown;
    json?: (b: unknown) => void;
    end?: (b: string) => void;
    setHeader?: (name: string, value: string) => void;
  };
  const reply: Reply<ExpressRaw> & { __sent: boolean } = {
    __sent: false,
    status(code: number) {
      expressRes.status?.(code);
      return reply;
    },
    json(body: unknown) {
      expressRes.json?.(body);
      reply.__sent = true;
    },
    send(body: string) {
      reply.__sent = true;
      expressRes.setHeader?.("Content-Type", "text/plain; charset=utf-8");
      expressRes.end?.(body);
    },
    markSent() {
      reply.__sent = true;
    },
    raw: { req, res } as ExpressRaw,
  };
  return reply;
}

export const expressAdapter = new ExpressAdapter();

/**
 * 创建绑定 Express 原生类型的 ERest 实例（构造时锁定 Raw 泛型）。
 *
 * 返回的 ERest 实例中，registerTyped handler 的 ctx.reply.raw 自动推导为 ExpressRaw，
 * 无需手动标注。等价于 `new ERest<Middleware, ExpressRaw, State>(options)`。
 *
 * 泛型 State 可选：`createERest<MyState>(options)` 让 ctx.state 类型安全（默认 Record<string,unknown>）。
 *
 * @example
 * import { createERest } from "@erest/express";
 * const api = createERest({ info, groups, forceGroup });
 */
export function createERest<State extends Record<string, unknown> = Record<string, unknown>>(
  options: ConstructorParameters<typeof ERestCtor>[0]
): ERest<Middleware<State>, ExpressRaw, State> {
  return new ERestCtor<Middleware<State>, ExpressRaw, State>(options);
}
