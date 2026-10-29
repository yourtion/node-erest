/** Shared request semantics used by every built-in adapter. */
import { normalizeRequestError, observeError } from "./errors.js";
import type API from "../api.js";
import type ERest from "../index.js";
import { defaultErrorFormatter } from "../error.js";
import type { LifecycleHooks } from "../hooks.js";
import type { Context, Middleware } from "./types.js";
import { compose, type Envelopers, wrapWithEnvelope } from "./utils.js";

/** For hosts exposing encoded parameters; decode once after routing, before validation. */
export const decodePathParams: Middleware = (ctx, next) => {
  for (const name in ctx.params) {
    if (Object.hasOwn(ctx.params, name) && typeof ctx.params[name] === "string") {
      try {
        ctx.params[name] = decodeURIComponent(ctx.params[name]);
      } catch (error) {
        throw Object.assign(error as Error, { statusCode: 400 });
      }
    }
  }
  return next();
};

const optionsRoutes = new WeakMap<object, Map<string, { methods: Set<string>; allow: string }>>();
/** Register one implicit OPTIONS route per path; its Allow value is assembled only at bind time. */
export function registerOptionsRoute(
  router: object,
  path: string,
  method: string,
  register: (allow: () => string) => void
): void {
  let routes = optionsRoutes.get(router);
  if (!routes) {
    routes = new Map();
    optionsRoutes.set(router, routes);
  }
  let route = routes.get(path);
  const fresh = !route;
  if (!route) {
    route = { methods: new Set(["OPTIONS"]), allow: "" };
    routes.set(path, route);
  }
  route.methods.add(method.toUpperCase());
  if (method.toUpperCase() === "GET") route.methods.add("HEAD");
  route.allow = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    .filter((name) => route.methods.has(name))
    .join(", ");
  if (fresh) {
    const registered = route;
    register(() => registered.allow);
  }
}

export function createParamsChecker<T>(erest: ERest<T>, api: API<T>): T {
  const compiled = api.options.compiled;
  const requiredOneOf = api.options.requiredOneOf;
  const onValidate = erest.getHooks()?.onValidate;
  const checker: Middleware = (ctx, next) => {
    if (!compiled) return next();
    try {
      const layered = compiled.validate(ctx);
      const flat = { ...layered.params, ...layered.query, ...layered.body, ...layered.headers };
      if (requiredOneOf) {
        for (const names of requiredOneOf) {
          if (!names.some((name) => flat[name] !== undefined)) {
            throw erest.getError().missingParameter(`one of ${names.join(", ")} is required`);
          }
        }
      }
      ctx.$validated = layered;
      ctx.$params = flat;
      ctx.$pathParams = layered.params;
      ctx.$query = layered.query;
      ctx.$body = layered.body;
      ctx.$headers = layered.headers;
    } catch (err) {
      try {
        onValidate?.(ctx, err as Error);
      } catch {
        /* observers cannot change control flow */
      }
      throw err;
    }
    try {
      onValidate?.(ctx, ctx.$validated);
    } catch {
      /* observers cannot change control flow */
    }
    return next();
  };
  return checker as unknown as T;
}

/** Assemble once: parsing/validation/handler errors are observed before the error envelope. */
export function createDispatcher(
  handlers: Middleware[],
  hooks?: LifecycleHooks,
  envelopers: Envelopers = {}
): (ctx: Context) => Promise<void> {
  const dispatch = wrapWithEnvelope(compose(handlers), envelopers, hooks?.onError);
  if (!hooks?.onRequest && !hooks?.onResponse) return dispatch;
  return async (ctx) => {
    try {
      hooks.onRequest?.(ctx);
    } catch {
      /* observers cannot change control flow */
    }
    await dispatch(ctx);
    try {
      hooks.onResponse?.(ctx);
    } catch {
      /* observers cannot change control flow */
    }
  };
}

/** Bridge errors raised outside route dispatch (notably native body parsers). */
export function createErrorResponder<T>(erest: ERest<T>) {
  const hooks = erest.getHooks();
  const envelopers = erest.getResponseEnvelopers();
  return (ctx: Context, originalError: unknown, started = false): void => {
    const error = normalizeRequestError(originalError);
    if (!started) {
      try {
        hooks?.onRequest?.(ctx);
      } catch {
        /* observers cannot change control flow */
      }
    }
    observeError(ctx, error, hooks?.onError);
    if ((ctx.reply as { __sent?: boolean }).__sent) throw error;
    const { status, body } = envelopers.error ? envelopers.error(error, ctx) : defaultErrorFormatter(error as Error);
    ctx.reply.status(status).json(body);
    try {
      hooks?.onResponse?.(ctx);
    } catch {
      /* observers cannot change control flow */
    }
  };
}
