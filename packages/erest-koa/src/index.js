/**
 * @file Koa Framework Adapter
 * @author Yourtion Guo <yourtion@gmail.com>
 */
import { compose } from "erest";
/**
 * Koa framework adapter
 *
 * 标准化改造后：bindRoute 注册一个 Koa 原生中间件，内部构造标准 Context
 * 并用 compose 串起标准化 handler 链。
 */
export class KoaAdapter {
    name = "koa";
    /**
     * 构造标准 Context 的参数检查器（标准化 Middleware）。
     */
    makeParamsChecker(erest, api) {
        const checker = (ctx, next) => {
            const compiled = api.options.compiled;
            if (!compiled)
                return next();
            const layered = compiled.validate({
                params: ctx.params,
                query: ctx.query,
                body: ctx.body,
                headers: ctx.headers,
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
                }
                catch {
                    /* ignore */
                }
            }
            return next();
        };
        return checker;
    }
    bindRoute(router, api, handlers, hooks) {
        const routerTyped = router;
        const method = api.options.method.toLowerCase();
        const dispatch = compose(handlers);
        const hasHook = Boolean(hooks && (hooks.onRequest || hooks.onValidate || hooks.onError || hooks.onResponse));
        const nativeMiddleware = async (ctx, next) => {
            const reply = createKoaReply(ctx);
            const stdCtx = {
                method: String(ctx.method ?? ctx.request?.method ?? "").toUpperCase(),
                path: String(ctx.path ?? ctx.request?.path ?? ""),
                headers: (ctx.headers ?? ctx.request?.headers ?? {}),
                params: (ctx.params ?? {}),
                query: (ctx.request?.query ?? ctx.query ?? {}),
                body: ctx.request?.body ?? ctx.body,
                state: {},
                reply,
            };
            ctx.$ctx = stdCtx;
            if (hasHook && hooks) {
                try {
                    hooks.onRequest?.(stdCtx);
                }
                catch {
                    /* ignore */
                }
                try {
                    await dispatch(stdCtx);
                    try {
                        hooks.onResponse?.(stdCtx);
                    }
                    catch {
                        /* ignore */
                    }
                }
                catch (err) {
                    try {
                        hooks.onError?.(stdCtx, err);
                    }
                    catch {
                        /* ignore */
                    }
                    throw err;
                }
            }
            else {
                await dispatch(stdCtx);
            }
            await next();
        };
        if (typeof routerTyped[method] === "function") {
            routerTyped[method](api.options.path, nativeMiddleware);
        }
        else {
            console.error(`ERest: Invalid method ${method} for Koa router for path ${api.options.path}.`);
        }
    }
    createGroupRouter(RouterCtor, prefix) {
        const routerPrefix = prefix ? (prefix[0] === "/" ? prefix : `/${prefix}`) : undefined;
        return new RouterCtor(routerPrefix ? { prefix: routerPrefix } : {});
    }
    attachGroupRouter(app, groupRouter, _prefix) {
        const appTyped = app;
        const routerTyped = groupRouter;
        appTyped.use(routerTyped.routes());
        appTyped.use(routerTyped.allowedMethods());
    }
}
/** 构造 Koa 的 Reply 封装（写 ctx.status / ctx.body） */
function createKoaReply(ctx) {
    const koaCtx = ctx;
    const reply = {
        status(code) {
            koaCtx.status = code;
            return reply;
        },
        json(body) {
            koaCtx.type = "application/json";
            koaCtx.body = JSON.stringify(body);
        },
        send(body) {
            koaCtx.body = body;
        },
    };
    return reply;
}
export const koaAdapter = new KoaAdapter();
