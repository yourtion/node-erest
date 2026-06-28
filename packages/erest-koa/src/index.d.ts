/**
 * @file Koa Framework Adapter
 * @author Yourtion Guo <yourtion@gmail.com>
 */
import type { API } from "erest";
import type { ERest } from "erest";
import type { LifecycleHooks } from "erest";
import type { FrameworkAdapter } from "erest";
/**
 * Koa framework adapter
 *
 * 标准化改造后：bindRoute 注册一个 Koa 原生中间件，内部构造标准 Context
 * 并用 compose 串起标准化 handler 链。
 */
export declare class KoaAdapter<T = unknown> implements FrameworkAdapter<T> {
    readonly name: "koa";
    /**
     * 构造标准 Context 的参数检查器（标准化 Middleware）。
     */
    makeParamsChecker(erest: ERest<T>, api: API<T>): T;
    bindRoute(router: unknown, api: API<T>, handlers: T[], hooks?: LifecycleHooks): void;
    createGroupRouter(RouterCtor: unknown, prefix: string): unknown;
    attachGroupRouter(app: unknown, groupRouter: unknown, _prefix: string): void;
}
export declare const koaAdapter: KoaAdapter<unknown>;
