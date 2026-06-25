/**
 * 框架相关钩子（before / middleware）工厂。
 *
 * 重要约束：erest 的组级 before()/middleware() 钩子接收的是框架原生 ctx（在 checker
 * 之前/之后执行），无法跨框架复用。因此每个框架入口需提供本框架的 hook 实现。
 *
 * 本文件导出「鉴权 + 日志」的业务逻辑，由各入口的 hook 适配器调用，
 * 让业务规则（校验 token、判断角色）集中一处，框架差异仅限于如何从 ctx 读 header。
 */
import { authRequired, forbidden } from './errors.js';

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
  if (user.role !== 'admin') throw forbidden('需要管理员权限');
  return user;
}

// ====================================================================
// 以下是各框架的 hook 适配器：把框架 ctx 转成 { token }，调用上面的业务逻辑，
// 并把 currentUser 写回 ctx（供 handler 经框架方式读取）。
// 返回的函数即 erest group().before() / middleware() 的入参。
// ====================================================================

/**
 * Express 鉴权 before 钩子：从 req.headers 读 token，校验后挂到 req.currentUser。
 * @param {ReturnType<typeof import('./store.js').createStore>} store
 */
export function expressAuthBefore(store) {
  return (req, _res, next) => {
    try {
      const user = resolveUser({ token: req.headers['x-admin-token'] }, store);
      req.currentUser = user;
      next();
    } catch (e) {
      next(e);
    }
  };
}

/**
 * Express 管理员鉴权 before 钩子：在 expressAuthBefore 之后，校验角色。
 */
export function expressAdminBefore() {
  return (req, _res, next) => {
    if (!req.currentUser || req.currentUser.role !== 'admin') return next(forbidden('需要管理员权限'));
    next();
  };
}

/**
 * Express 日志 middleware。
 */
export function expressLogMiddleware() {
  return (req, _res, next) => {
    console.log(`[express] ${req.method} ${req.path} user=${req.currentUser?.id ?? '-'}`);
    next();
  };
}

// —— Koa ——（ctx.headers / ctx.set）

/**
 * Koa 鉴权 before 钩子。
 * @param {ReturnType<typeof import('./store.js').createStore>} store
 */
export function koaAuthBefore(store) {
  return async (ctx, next) => {
    try {
      const user = resolveUser({ token: ctx.headers['x-admin-token'] }, store);
      ctx.currentUser = user;
      await next();
    } catch (e) {
      throw e;
    }
  };
}

/** Koa 管理员鉴权 before 钩子 */
export function koaAdminBefore() {
  return async (ctx, next) => {
    if (!ctx.currentUser || ctx.currentUser.role !== 'admin') throw forbidden('需要管理员权限');
    await next();
  };
}

/** Koa 日志 middleware */
export function koaLogMiddleware() {
  return async (ctx, next) => {
    console.log(`[koa] ${ctx.method} ${ctx.path} user=${ctx.currentUser?.id ?? '-'}`);
    await next();
  };
}

// —— @leizm/web ——（ctx.request.headers / ctx.data）

/**
 * @leizm/web 鉴权 before 钩子。
 * @param {ReturnType<typeof import('./store.js').createStore>} store
 */
export function leiAuthBefore(store) {
  return (ctx) => {
    const user = resolveUser({ token: ctx.request.headers['x-admin-token'] }, store);
    ctx.data['currentUser'] = user;
    ctx.next();
  };
}

/** @leizm/web 管理员鉴权 before 钩子 */
export function leiAdminBefore() {
  return (ctx) => {
    const user = ctx.data['currentUser'];
    if (!user || user.role !== 'admin') throw forbidden('需要管理员权限');
    ctx.next();
  };
}

/** @leizm/web 日志 middleware */
export function leiLogMiddleware() {
  return (ctx) => {
    const user = ctx.data['currentUser'];
    console.log(`[leizmweb] ${ctx.request.method} ${ctx.request.path} user=${user?.id ?? '-'}`);
    ctx.next();
  };
}

// ====================================================================
// 全局 timing before 钩子（演示 beforeHooks）：记录请求开始时间，响应时输出耗时。
// 同样框架相关，由各入口选用。
// ====================================================================

/** Express 全局计时 before hook */
export function expressTimingBefore() {
  return (req, _res, next) => {
    req.$start = Date.now();
    next();
  };
}

/** Koa 全局计时 before hook */
export function koaTimingBefore() {
  return async (ctx, next) => {
    ctx.$start = Date.now();
    await next();
  };
}

/** @leizm/web 全局计时 before hook */
export function leiTimingBefore() {
  return (ctx) => {
    ctx.request.$start = Date.now();
    ctx.next();
  };
}
