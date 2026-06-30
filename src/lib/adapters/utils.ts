/**
 * @file Adapter Utilities
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import type API from "../api.js";
import type { Context, IAdapterGroupInfo, Middleware } from "./types.js";

export interface BuildHandlerChainOptions<T> {
  /** Global before hooks */
  beforeHooks: Set<T>;
  /** API schema */
  api: API<T>;
  /** Params checker middleware */
  checker: T;
  /** Optional group info for group-based routing */
  groupInfo?: IAdapterGroupInfo<T>;
}

/**
 * Build unified handler chain for all frameworks
 * Order: beforeHooks -> groupBefore -> apiBeforeHooks -> checker -> groupMiddleware -> apiMiddlewares -> handler
 *
 * @param options Handler chain options
 * @returns Array of handlers in correct execution order
 */
export function buildHandlerChain<T>(options: BuildHandlerChainOptions<T>): T[] {
  const { beforeHooks, api, checker, groupInfo } = options;

  const handlers = [
    ...Array.from(beforeHooks),
    ...(groupInfo?.before ?? []),
    ...Array.from(api.options.beforeHooks),
    checker,
    ...(groupInfo?.middleware ?? []),
    ...Array.from(api.options.middlewares),
    api.options.handler,
  ].filter((h): h is T => typeof h === "function");

  return handlers;
}

/**
 * 洋葱式 compose：把标准化 Middleware 数组串成一个可执行的链。
 *
 * 借鉴 Koa 的洋葱模型：每个中间件可在 `await next()` 前后执行逻辑，
 * 不调用 next 则终止链。dispatcher 捕获中间件抛出的错误并向上抛（由框架错误中间件处理）。
 *
 * @param middlewares 标准化中间件数组
 * @returns 接收 Context 的执行器，返回 Promise（链执行完毕）
 */
export function compose(middlewares: Middleware[]): (ctx: Context) => Promise<void> {
  return function dispatch(ctx: Context): Promise<void> {
    let index = -1;
    function execute(i: number): Promise<void> | void {
      if (i <= index) return Promise.reject(new Error("next() called multiple times"));
      index = i;
      const fn = middlewares[i];
      if (!fn) return;
      try {
        return Promise.resolve(fn(ctx, () => execute(i + 1)));
      } catch (err) {
        return Promise.reject(err);
      }
    }
    return execute(0) as Promise<void>;
  };
}

/** enveloper 函数集（由 setResponseEnvelopers 注册，经 bind -> bindRoute 传入） */
export interface Envelopers {
  success?: (data: unknown, ctx: Context) => unknown;
  error?: (err: unknown, ctx: Context) => { body: unknown; status: number };
}

/**
 * 包装 dispatch：注册了 enveloper 时，handler return 值经 successEnveloper 包装写入 reply；
 * 抛错经 errorEnveloper 包装。未注册 enveloper 时退化为原 dispatch（向后兼容，零开销）。
 *
 * handler 的 return 值通过 ctx.__returnValue 传递（由 registerTyped 的 wrappedHandler 写入，
 * 即使 return undefined 也会写入标记 __returned=true，以区分「return undefined」与「调 ctx.reply」）。
 *
 * enveloper 模式约定：handler 只 return data，不调 ctx.reply。若误调又 return，successEnveloper
 * 的 json 会覆盖前者——属误用。
 */
export function wrapWithEnvelope(
  dispatch: (ctx: Context) => Promise<void>,
  envelopers: Envelopers
): (ctx: Context) => Promise<void> {
  const { success: successEnveloper, error: errorEnveloper } = envelopers;
  if (!successEnveloper && !errorEnveloper) return dispatch; // 零开销：未注册时直接返回原 dispatch

  return async function (ctx: Context): Promise<void> {
    try {
      await dispatch(ctx);
      // 成功：handler 执行完无抛错。enveloper 模式下用 successEnveloper 包装 return 值。
      // __returned 标记由 wrappedHandler 在 handler return 后置位（含 return undefined）；
      // 未置位说明 handler 自行调 ctx.reply 写了响应（非 enveloper 用法），不再二次包装。
      // 额外检查 reply.__sent：handler 若调用了 reply.markSent()（或 json/send），
      // 说明响应已手动发送（如经 raw 写 CSV/文件流），enveloper 不再二次包装，
      // 避免覆盖已发送的响应或触发「headers already sent」类错误（各框架行为不一）。
      const reply = ctx.reply as { __sent?: boolean };
      if (successEnveloper && (ctx as Context & { __returned?: boolean }).__returned && !reply.__sent) {
        const returnValue = (ctx as Context & { __returnValue?: unknown }).__returnValue;
        const wrapped = successEnveloper(returnValue, ctx);
        ctx.reply.json(wrapped);
      }
    } catch (err) {
      if (errorEnveloper) {
        const { body, status } = errorEnveloper(err, ctx);
        ctx.reply.status(status).json(body);
      } else {
        throw err; // 未注册 errorEnveloper 时 re-throw（交给 app 级中间件）
      }
    }
  };
}
