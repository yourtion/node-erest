/**
 * @file Express Framework Adapter
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import type { API } from "erest";
import type { ERest } from "erest";
import type { LifecycleHooks } from "erest";
import type { Context, FrameworkAdapter, Middleware, Reply } from "erest";
import { compose } from "erest";

/**
 * Express framework adapter
 *
 * 标准化改造后：bindRoute 注册一个 Express 原生中间件，内部构造标准 Context
 * 并用 compose 串起标准化 handler 链。框架只看到这一个中间件，避开 Express
 * 对 handler 数组的签名假设。
 */
export class ExpressAdapter<T = unknown> implements FrameworkAdapter<T> {
  readonly name = "express" as const;

  /**
   * 构造标准 Context 的参数检查器（标准化 Middleware）。
   * 从 ctx 读取原始 params/query/body/headers，校验后填入 ctx.$validated。
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
    // 包装为单个 Express 中间件：构造标准 Context + compose 标准化 handler 链
    const dispatch = compose(handlers as unknown as Middleware[]);
    // Stage 3：零开销裁剪——无 hooks 时装配不含 hook 调用的 dispatch
    const hasHook = Boolean(hooks && (hooks.onRequest || hooks.onValidate || hooks.onError || hooks.onResponse));
    const nativeMiddleware = (req: Record<string, unknown>, res: unknown, next: (err?: unknown) => void) => {
      const reply: Reply = createExpressReply(res);
      const ctx: Context = {
        method: String(req.method ?? "").toUpperCase(),
        path: String(req.path ?? req.url ?? ""),
        headers: (req.headers ?? {}) as Record<string, string>,
        params: (req.params ?? {}) as Record<string, unknown>,
        query: (req.query ?? {}) as Record<string, unknown>,
        body: req.body,
        state: {},
        reply,
      };
      req.$ctx = ctx;
      if (hasHook && hooks) {
        try {
          hooks.onRequest?.(ctx);
        } catch {
          /* hook 是观察者，异常不影响主流程 */
        }
        dispatch(ctx)
          .then(() => {
            try {
              hooks.onResponse?.(ctx);
            } catch {
              /* ignore */
            }
            next();
          })
          .catch((err) => {
            try {
              hooks.onError?.(ctx, err);
            } catch {
              /* ignore */
            }
            next(err);
          });
      } else {
        dispatch(ctx)
          .then(() => next())
          .catch((err) => next(err));
      }
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

/** 构造 Express 的 Reply 封装 */
function createExpressReply(res: unknown): Reply {
  const expressRes = res as { status?: (c: number) => unknown; json?: (b: unknown) => void; end?: (b: string) => void };
  const reply: Reply = {
    status(code: number) {
      expressRes.status?.(code);
      return reply;
    },
    json(body: unknown) {
      expressRes.json?.(body);
    },
    send(body: string) {
      expressRes.end?.(body);
    },
  };
  return reply;
}

export const expressAdapter = new ExpressAdapter();
