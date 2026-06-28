/**
 * @file @leizm/web Framework Adapter
 * @author Yourtion Guo <yourtion@gmail.com>
 */
import { compose } from "erest";
/**
 * @leizm/web framework adapter
 *
 * 标准化改造后：bindRoute 注册单个 @leizm/web 中间件（单参数，避开按 .length 区分
 * 错误中间件的约束），内部构造标准 Context 并用 compose 串起标准化 handler 链。
 */
export class LeizmWebAdapter {
    name = "leizmweb";
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
        const method = api.options.method;
        const dispatch = compose(handlers);
        const hasHook = Boolean(hooks && (hooks.onRequest || hooks.onValidate || hooks.onError || hooks.onResponse));
        // 单参数中间件（length=1），避免被 @leizm/web 误判为错误处理中间件
        const nativeMiddleware = (ctx) => {
            const request = ctx.request ?? {};
            const reply = createLeiReply(ctx);
            const stdCtx = {
                method: String(request.method ?? ctx.method ?? "").toUpperCase(),
                path: String(request.path ?? ctx.path ?? ""),
                headers: (request.headers ?? ctx.headers ?? {}),
                params: (request.params ?? {}),
                query: (request.query ?? {}),
                body: request.body,
                state: {},
                reply,
            };
            request.$ctx = stdCtx;
            if (hasHook && hooks) {
                try {
                    hooks.onRequest?.(stdCtx);
                }
                catch {
                    /* ignore */
                }
            }
            return dispatch(stdCtx)
                .then(() => {
                if (hasHook && hooks) {
                    try {
                        hooks.onResponse?.(stdCtx);
                    }
                    catch {
                        /* ignore */
                    }
                }
                ctx.next();
            })
                .catch((err) => {
                if (hasHook && hooks) {
                    try {
                        hooks.onError?.(stdCtx, err);
                    }
                    catch {
                        /* ignore */
                    }
                }
                const e = err;
                const code = e?.statusCode || e?.status || 500;
                const leiRes = (ctx.response ?? {});
                leiRes.status?.(code);
                leiRes.json?.({ error: e?.message || "internal error" });
            });
        };
        routerTyped[method].bind(router)(api.options.path, nativeMiddleware);
    }
    createGroupRouter(RouterCtor, _prefix) {
        return new RouterCtor();
    }
    attachGroupRouter(app, groupRouter, prefix) {
        const appTyped = app;
        const normalizedPrefix = prefix[0] === "/" ? prefix : `/${prefix}`;
        appTyped.use(normalizedPrefix, groupRouter);
    }
}
/** 构造 @leizm/web 的 Reply 封装（写 ctx.response.json/status/send） */
function createLeiReply(ctx) {
    const leiRes = (ctx.response ?? {});
    const reply = {
        status(code) {
            leiRes.status?.(code);
            return reply;
        },
        json(body) {
            leiRes.json?.(body);
        },
        send(body) {
            leiRes.send?.(body);
        },
    };
    return reply;
}
export const leizmWebAdapter = new LeizmWebAdapter();
