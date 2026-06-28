/**
 * @file Framework Adapters Entry Point
 * @author Yourtion Guo <yourtion@gmail.com>
 *
 * v3.0：Express/Koa/@leizm/web 三框架适配器实现已拆分为独立子包
 * （@erest/express / @erest/koa / @erest/leizmweb，目录在 packages/erest-*）。
 * core 仅保留 FrameworkAdapter 接口、Context/Reply/Middleware 类型与
 * compose/buildHandlerChain 工具函数，供子包实现与用户自定义适配器复用。
 */

export * from "./types.js";
export { type BuildHandlerChainOptions, buildHandlerChain, compose } from "./utils.js";
