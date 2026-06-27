/**
 * 自定义错误注册（演示 api.errors.register 能力）。
 *
 * erest 内置一组默认错误（见 erest/src/lib/default/errors.ts）。
 * 通过 api.errors.register 可追加业务错误，它们会出现在生成的错误文档中。
 * 运行时抛错用 ERestError（带 code/message/statusCode）。
 */
import { ERestError } from "erest";

/**
 * 在 erest 实例上注册业务错误。
 * @param {import('erest').ERestInstance<unknown>} api
 */
export function registerErrors(api) {
  // 注册业务错误（仅用于文档展示；名称必须为大写字母与下划线）
  api.errors.register("AUTH_REQUIRED", {
    code: -2001,
    description: "需要登录",
    status: 401,
    isShow: true,
    isLog: false,
  });
  api.errors.register("FORBIDDEN", {
    code: -2002,
    description: "权限不足",
    status: 403,
    isShow: true,
    isLog: true,
  });
}

// —— 运行时错误工厂（handler 中抛出）——

/** 需要登录（401） */
export function authRequired() {
  return new ERestError("PERMISSION_DENIED", "需要登录", undefined, 401);
}

/** 权限不足（403） */
export function forbidden(message = "权限不足") {
  return new ERestError("PERMISSION_DENIED", message, undefined, 403);
}

/** 资源不存在（404） */
export function notFound(message = "资源不存在") {
  return new ERestError("NOT_FOUND", message, undefined, 404);
}
