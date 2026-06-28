/**
 * @file Express Framework Adapter
 * @author Yourtion Guo <yourtion@gmail.com>
 */
import type { API } from "erest";
import type { ERest } from "erest";
import type { LifecycleHooks } from "erest";
import type { FrameworkAdapter } from "erest";
/**
 * Express framework adapter
 *
 * 标准化改造后：bindRoute 注册一个 Express 原生中间件，内部构造标准 Context
 * 并用 compose 串起标准化 handler 链。框架只看到这一个中间件，避开 Express
 * 对 handler 数组的签名假设。
 */
export declare class ExpressAdapter<T = unknown> implements FrameworkAdapter<T> {
    readonly name: "express";
    /**
     * 构造标准 Context 的参数检查器（标准化 Middleware）。
     * 从 ctx 读取原始 params/query/body/headers，校验后填入 ctx.$validated。
     */
    makeParamsChecker(erest: ERest<T>, api: API<T>): T;
    bindRoute(router: unknown, api: API<T>, handlers: T[], hooks?: LifecycleHooks): void;
    createGroupRouter(RouterCtor: unknown, _prefix: string): unknown;
    attachGroupRouter(app: unknown, groupRouter: unknown, prefix: string): void;
}
export declare const expressAdapter: ExpressAdapter<unknown>;
