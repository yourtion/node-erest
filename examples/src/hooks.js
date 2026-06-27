/**
 * before / middleware 钩子（框架无关，v3 标准化签名）。
 *
 * erest v3 标准化后，所有 group.before() / group.middleware() / beforeHooks() 的钩子
 * 统一接收框架无关的标准 Context：
 *
 *   (ctx, next) => { ... return next(); }
 *
 * ctx 暴露的字段（见 erest 的 Context 类型）：
 *   - ctx.headers   请求头（大小写不敏感读取）
 *   - ctx.state     跨中间件传递的可读写状态（替代直接写 req/ctx.currentUser）
 *   - ctx.path/ctx.method  路径与方法
 *
 * 因此鉴权/日志/计时三套逻辑只需写**一份**，被 Express / Koa / @leizm/web 三个入口复用。
 * 业务规则（校验 token、判断角色）集中在 resolveUser / requireAdmin，无框架差异。
 */
import { authRequired, forbidden } from "./errors.js";

/**
 * 创建鉴权业务逻辑（框架无关）。
 * @param {{ token: string | undefined }} ctx 规范化上下文（含 token）
 * @param {ReturnType<typeof import('./store.js').createStore>} store
 * @returns {{ id: number; role: string }} 当前用户
 * @throws {ERestError} 未登录抛 AUTH_REQUIRED
 */
export function resolveUser({ token }, store) {
  const user = store.authenticate(token);
  if (!user) throw authRequired();
  return user;
}

/**
 * 要求管理员角色（框架无关）。
 * @param {{ id: number; role: string }} user
 * @throws {ERestError} 非管理员抛 FORBIDDEN
 */
export function requireAdmin(user) {
  if (user.role !== "admin") throw forbidden("需要管理员权限");
  return user;
}

// ====================================================================
// 标准化钩子（框架无关）：签名统一为 (ctx, next)。
// ctx 为 erest 标准 Context，next 为调用链下一个中间件。
// ====================================================================

/**
 * 鉴权 before 钩子：从 ctx.headers 读 token，校验后存到 ctx.state.currentUser。
 * @param {ReturnType<typeof import('./store.js').createStore>} store
 */
export function authBefore(store) {
  return (ctx, next) => {
    const user = resolveUser({ token: ctx.headers["x-admin-token"] }, store);
    ctx.state.currentUser = user;
    return next();
  };
}

/**
 * 管理员鉴权 before 钩子：在 authBefore 之后，校验角色。
 */
export function adminBefore() {
  return (ctx, next) => {
    const user = ctx.state.currentUser;
    if (!user || user.role !== "admin") throw forbidden("需要管理员权限");
    return next();
  };
}

/**
 * 日志 middleware。
 */
export function logMiddleware() {
  return (ctx, next) => {
    const user = ctx.state.currentUser;
    console.log(`[${ctx.method}] ${ctx.path} user=${user?.id ?? "-"}`);
    return next();
  };
}

/**
 * 全局计时 before hook（演示 beforeHooks）：记录请求开始时间。
 */
export function timingBefore() {
  return (ctx, next) => {
    ctx.state.$start = Date.now();
    return next();
  };
}
