/**
 * @file Express Framework Adapter
 * @author Yourtion Guo <yourtion@gmail.com>
 */
import { compose } from "erest";
/**
 * Express framework adapter
 *
 * 标准化改造后：bindRoute 注册一个 Express 原生中间件，内部构造标准 Context
 * 并用 compose 串起标准化 handler 链。框架只看到这一个中间件，避开 Express
 * 对 handler 数组的签名假设。
 */
export class ExpressAdapter {
    name = "express";
    /**
     * 构造标准 Context 的参数检查器（标准化 Middleware）。
     * 从 ctx 读取原始 params/query/body/headers，校验后填入 ctx.$validated。
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
            // requiredOneOf 检查（多选一必填，Zod 之上的便利方法）
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
            // Stage 3：onValidate hook（校验后触发，观察者）
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
        // 包装为单个 Express 中间件：构造标准 Context + compose 标准化 handler 链
        const dispatch = compose(handlers);
        // Stage 3：零开销裁剪——无 hooks 时装配不含 hook 调用的 dispatch
        const hasHook = Boolean(hooks && (hooks.onRequest || hooks.onValidate || hooks.onError || hooks.onResponse));
        const nativeMiddleware = (req, res, next) => {
            const reply = createExpressReply(res);
            const ctx = {
                method: String(req.method ?? "").toUpperCase(),
                path: String(req.path ?? req.url ?? ""),
                headers: (req.headers ?? {}),
                params: (req.params ?? {}),
                query: (req.query ?? {}),
                body: req.body,
                state: {},
                reply,
            };
            req.$ctx = ctx;
            if (hasHook && hooks) {
                try {
                    hooks.onRequest?.(ctx);
                }
                catch {
                    /* hook 是观察者，异常不影响主流程 */
                }
                dispatch(ctx)
                    .then(() => {
                    try {
                        hooks.onResponse?.(ctx);
                    }
                    catch {
                        /* ignore */
                    }
                    next();
                })
                    .catch((err) => {
                    try {
                        hooks.onError?.(ctx, err);
                    }
                    catch {
                        /* ignore */
                    }
                    next(err);
                });
            }
            else {
                dispatch(ctx)
                    .then(() => next())
                    .catch((err) => next(err));
            }
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
/** 构造 Express 的 Reply 封装 */
function createExpressReply(res) {
    const expressRes = res;
    const reply = {
        status(code) {
            expressRes.status?.(code);
            return reply;
        },
        json(body) {
            expressRes.json?.(body);
        },
        send(body) {
            expressRes.end?.(body);
        },
    };
    return reply;
}
export const expressAdapter = new ExpressAdapter();
