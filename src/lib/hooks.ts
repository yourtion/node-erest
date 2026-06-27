/**
 * @file 生命周期 Hook（Stage 3：可观测性）
 *
 * hook 是同步观察者，不参与控制流（不阻断、不改返回值）。
 * 无订阅者时 dispatch 闭包裁剪掉 hook 调用，热路径零开销。
 */

import type { Context } from "./adapters/types.js";
import type { ERestError } from "./error.js";
import type { LayeredParams } from "./params.js";

/** 生命周期 hook 集合（同步观察者，不参与控制流） */
export interface LifecycleHooks {
  /** 进入中间件链最开始：注入 traceId、开始计时、访问日志 */
  onRequest?: (ctx: Context) => void;
  /** 参数校验完成后：记录校验耗时、失败字段 */
  onValidate?: (ctx: Context, result: LayeredParams | Error) => void;
  /** 链中抛错时：结构化错误日志（保留 ERestError code/details） */
  onError?: (ctx: Context, error: ERestError | Error) => void;
  /** 链正常结束、响应已写入：结束计时、状态码、慢请求标记 */
  onResponse?: (ctx: Context) => void;
}

/** 判断 hooks 是否为空（用于零开销裁剪） */
export function hasHooks(hooks?: LifecycleHooks): boolean {
  if (!hooks) return false;
  return Boolean(hooks.onRequest || hooks.onValidate || hooks.onError || hooks.onResponse);
}
