/**
 * @file @leizm/web Framework Adapter
 * @author Yourtion Guo <yourtion@gmail.com>
 */
import type { API } from "erest";
import type { ERest } from "erest";
import type { LifecycleHooks } from "erest";
import type { FrameworkAdapter } from "erest";
/**
 * @leizm/web framework adapter
 *
 * 标准化改造后：bindRoute 注册单个 @leizm/web 中间件（单参数，避开按 .length 区分
 * 错误中间件的约束），内部构造标准 Context 并用 compose 串起标准化 handler 链。
 */
export declare class LeizmWebAdapter<T = unknown> implements FrameworkAdapter<T> {
    readonly name: "leizmweb";
    /**
     * 构造标准 Context 的参数检查器（标准化 Middleware）。
     */
    makeParamsChecker(erest: ERest<T>, api: API<T>): T;
    bindRoute(router: unknown, api: API<T>, handlers: T[], hooks?: LifecycleHooks): void;
    createGroupRouter(RouterCtor: unknown, _prefix: string): unknown;
    attachGroupRouter(app: unknown, groupRouter: unknown, prefix: string): void;
}
export declare const leizmWebAdapter: LeizmWebAdapter<unknown>;
