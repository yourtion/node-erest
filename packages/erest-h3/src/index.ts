/** H3 v2 framework adapter. */
/* eslint-disable no-underscore-dangle -- erest's envelope bridge uses __sent and __returnValue. */
import {
  ERest as ERestCtor,
  createParamsChecker,
  createDispatcher,
  createErrorResponder,
  registerOptionsRoute,
  decodePathParams,
} from "erest";
import type { API, Context, ERest, Envelopers, FrameworkAdapter, LifecycleHooks, Middleware, Reply } from "erest";
import { getQuery, getRouterParams, readBody } from "h3";
import type { H3, H3Event, HTTPMethod } from "h3";

/** H3 原生事件，可通过 reply.raw 访问请求、响应头和 event.context。 */
export type H3Raw = H3Event;

export class H3Adapter implements FrameworkAdapter<Middleware, H3Raw> {
  readonly name = "h3" as const;

  makeParamsChecker<T>(erest: ERest<T>, api: API<T>): T {
    return createParamsChecker(erest, api);
  }

  bindRoute<T>(router: unknown, api: API<T>, handlers: T[], hooks?: LifecycleHooks, envelopers?: Envelopers): void {
    // Body parsing runs inside dispatch so parse errors follow the same envelope/hook path.
    // Only declared body schemas consume the stream; raw handlers can read other bodies themselves.
    const dispatch = createDispatcher(
      api.options.bodySchema
        ? [decodePathParams, readRequestBody, ...(handlers as unknown as Middleware[])]
        : [decodePathParams, ...(handlers as unknown as Middleware[])],
      hooks,
      envelopers
    );
    (router as H3).on(
      String(api.options.method).toUpperCase() as HTTPMethod,
      String(api.options.path),
      async (event) => {
        const ctx = createH3Context(event);
        const reply = ctx.reply as ReturnType<typeof createH3Reply>;
        event.context.$ctx = ctx;
        await dispatch(ctx);
        // markSent() + registerTyped return supports native Response/streams/redirects.
        return reply.body ?? (reply.__sent ? (ctx as Context & { __returnValue?: unknown }).__returnValue : undefined);
      }
    );
    registerOptionsRoute(router as object, String(api.options.path), String(api.options.method), (allow) => {
      (router as H3).on("OPTIONS", String(api.options.path), (event) => {
        event.res.headers.set("Allow", allow());
        event.res.status = 204;
        return "";
      });
    });
  }

  createGroupRouter(RouterCtor: unknown, _prefix: string): unknown {
    return new (RouterCtor as new () => H3)();
  }

  attachGroupRouter(app: unknown, groupRouter: unknown, prefix: string): void {
    (app as H3).mount(prefix.startsWith("/") ? prefix : `/${prefix}`, groupRouter as H3);
  }
}

function createH3Context(event: H3Event): Context {
  return {
    method: event.req.method.toUpperCase(),
    path: event.url.pathname,
    headers: Object.fromEntries(event.req.headers),
    params: getRouterParams(event),
    query: getQuery(event),
    body: {},
    state: {},
    reply: createH3Reply(event),
  };
}
/** H3 onError boundary; unwraps the original error and reuses route observations. */
export function createErrorHandler<T>(service: ERest<T>) {
  const respond = createErrorResponder(service);
  return (error: Error & { cause?: unknown }, event: H3Event) => {
    const existing = event.context.$ctx as Context | undefined;
    const ctx = existing ?? createH3Context(event);
    respond(ctx, error.cause instanceof Error ? error.cause : error, Boolean(existing));
    return (ctx.reply as ReturnType<typeof createH3Reply>).body;
  };
}

const readRequestBody: Middleware = async (ctx, next) => {
  (ctx as { body: unknown }).body = (await readBody(ctx.reply.raw as H3Event)) ?? {};
  await next();
};

function createH3Reply(event: H3Event): Reply<H3Raw> & { __sent: boolean; body?: string } {
  const reply: Reply<H3Raw> & { __sent: boolean; body?: string } = {
    __sent: false,
    status(code) {
      event.res.status = code;
      return reply;
    },
    json(body) {
      reply.body = JSON.stringify(body) ?? "";
      event.res.headers.set("content-type", "application/json; charset=utf-8");
      reply.__sent = true;
    },
    send(body) {
      reply.body = body;
      event.res.headers.set("content-type", "text/plain; charset=utf-8");
      reply.__sent = true;
    },
    markSent() {
      reply.__sent = true;
    },
    raw: event,
  };
  return reply;
}

export const h3Adapter = new H3Adapter();

/** 创建锁定 H3Event 原生类型的实例；State 泛型用于跨中间件的 ctx.state。 */
export function createERest<State extends Record<string, unknown> = Record<string, unknown>>(
  options: ConstructorParameters<typeof ERestCtor>[0]
): ERest<Middleware<State>, H3Raw, State> {
  return new ERestCtor<Middleware<State>, H3Raw, State>(options);
}
