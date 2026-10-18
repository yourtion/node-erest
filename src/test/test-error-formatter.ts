/**
 * @file defaultErrorFormatter 测试
 * 验证错误格式器对 ERestError / 普通 Error 输出一致的 {status, body} 结构
 *
 * 另含 Stryker 存活 mutant 补测：默认错误表（default/errors.ts）、ErrorManager（manager/error.ts）、debug 模块（debug.ts）。
 */
import Debug from "debug";
import { describe, expect, it } from "vitest";
import * as debugModule from "../lib/debug";
import { defaultErrors } from "../lib/default/errors";
import { ERestError, defaultErrorFormatter } from "../lib/error.js";
import { ErrorManager } from "../lib/manager/error";

describe("defaultErrorFormatter", () => {
  it("ERestError 输出 statusCode 与 code/message body", () => {
    const err = new ERestError("PERMISSION_DENIED", "未登录", undefined, 401);
    const out = defaultErrorFormatter(err);
    expect(out.status).toBe(401);
    expect(out.body).toEqual({ error: "未登录", code: "PERMISSION_DENIED" });
  });

  it("ERestError 默认 statusCode 400", () => {
    const err = new ERestError("VALIDATION_ERROR", "校验失败");
    const out = defaultErrorFormatter(err);
    expect(out.status).toBe(400);
    expect(out.body).toEqual({ error: "校验失败", code: "VALIDATION_ERROR" });
  });

  it("普通 Error 退化为 400 + INTERNAL_ERROR", () => {
    const err = new Error("boom");
    const out = defaultErrorFormatter(err);
    expect(out.status).toBe(400);
    expect(out.body).toEqual({ error: "boom", code: "INTERNAL_ERROR" });
  });

  it("带 status 属性的 Error 取 status", () => {
    const err = Object.assign(new Error("forbidden"), { status: 403 });
    const out = defaultErrorFormatter(err);
    expect(out.status).toBe(403);
    expect(out.body).toEqual({ error: "forbidden", code: "INTERNAL_ERROR" });
  });
});

/** 临时开启 debug 命名空间并捕获输出（结束后恢复） */
function captureDebugLogs(namespace: string, logger: Debug.Debugger, run: () => void): string[] {
  const lines: string[] = [];
  const originalLog = (logger as unknown as { log: unknown }).log;
  Debug.enable(namespace);
  (logger as unknown as { log: (fmt: unknown, ...args: unknown[]) => void }).log = (...args: unknown[]) => {
    lines.push(args.map((a) => String(a)).join(" "));
  };
  try {
    run();
  } finally {
    (logger as unknown as { log: unknown }).log = originalLog;
    Debug.disable();
  }
  return lines;
}

describe("默认错误表 defaultErrors", () => {
  it("注册全部 10 个默认错误且字段精确", () => {
    const em = new ErrorManager();
    defaultErrors(em);
    const names: string[] = [];
    em.forEach((_v, k) => names.push(k));
    expect(names).toEqual([
      "INTERNAL_ERROR",
      "RATE_LIMITED",
      "MISSING_PARAMETER",
      "INVALID_PARAMETER",
      "PERMISSIONS_ERROR",
      "NOT_FOUND_ERROR",
      "EXCE_INVALID_ERROR",
      "DATABASE_ERROR",
      "REPEAT_ERROR",
      "DEPEND_ERROR",
    ]);

    expect(em.get("INTERNAL_ERROR")).toEqual({
      name: "INTERNAL_ERROR",
      code: -1000,
      description: "内部错误",
      status: 200,
      isDefault: true,
      isShow: true,
      isLog: true,
    });
    expect(em.get("RATE_LIMITED")).toEqual({
      name: "RATE_LIMITED",
      code: -1001,
      description: "请求过多",
      status: 200,
      isDefault: true,
      isShow: true,
      isLog: false,
    });
    expect(em.get("MISSING_PARAMETER")).toEqual({
      name: "MISSING_PARAMETER",
      code: -1002,
      description: "缺少参数",
      status: 200,
      isDefault: true,
      isShow: true,
      isLog: false,
    });
    expect(em.get("INVALID_PARAMETER")).toEqual({
      name: "INVALID_PARAMETER",
      code: -1003,
      description: "参数不合法",
      status: 200,
      isDefault: true,
      isShow: true,
      isLog: false,
    });
    expect(em.get("PERMISSIONS_ERROR")).toEqual({
      name: "PERMISSIONS_ERROR",
      code: -1004,
      description: "权限不足",
      status: 200,
      isDefault: true,
      isShow: true,
      isLog: true,
    });
    expect(em.get("NOT_FOUND_ERROR")).toEqual({
      name: "NOT_FOUND_ERROR",
      code: -1005,
      description: "找不到内容",
      status: 200,
      isDefault: true,
      isShow: true,
      isLog: false,
    });
    expect(em.get("EXCE_INVALID_ERROR")).toEqual({
      name: "EXCE_INVALID_ERROR",
      code: -1006,
      description: "不合法执行",
      status: 200,
      isDefault: true,
      isShow: true,
      isLog: false,
    });
    expect(em.get("DATABASE_ERROR")).toEqual({
      name: "DATABASE_ERROR",
      code: -1007,
      description: "数据库错误",
      status: 200,
      isDefault: true,
      isShow: false,
      isLog: true,
    });
    expect(em.get("REPEAT_ERROR")).toEqual({
      name: "REPEAT_ERROR",
      code: -1008,
      description: "该记录已经存在",
      status: 200,
      isDefault: true,
      isShow: true,
      isLog: false,
    });
    expect(em.get("DEPEND_ERROR")).toEqual({
      name: "DEPEND_ERROR",
      code: -1009,
      description: "数据存在依赖",
      status: 200,
      isDefault: true,
      isShow: true,
      isLog: false,
    });
  });
});

describe("ErrorManager 注册与查询", () => {
  it("register 最小参数填充默认值并返回 this", () => {
    const em = new ErrorManager();
    expect(em.register("MIN_ERR", {})).toBe(em);
    expect(em.get("MIN_ERR")).toEqual({
      name: "MIN_ERR",
      code: -1,
      description: "",
      status: 200,
      isDefault: false,
      isShow: false,
      isLog: false,
    });
  });

  it("register 保留显式字段", () => {
    const em = new ErrorManager();
    em.register("FULL_ERR", { code: 100, description: "自定义", status: 404, isShow: true, isLog: true });
    expect(em.get("FULL_ERR")).toEqual({
      name: "FULL_ERR",
      code: 100,
      description: "自定义",
      status: 404,
      isDefault: false,
      isShow: true,
      isLog: true,
    });
  });

  it("名称必须是大写字母或下划线的字符串", () => {
    const em = new ErrorManager();
    expect(() => em.register("lower_case", {})).toThrowError(/name must be uppercase or _ but get lower_case/);
    expect(() => em.register(123 as unknown as string, {})).toThrowError(/error name must be string/);
  });

  it("重复 code 拒绝注册", () => {
    const em = new ErrorManager();
    em.register("A_ERR", { code: 42 });
    expect(() => em.register("B_ERR", { code: 42 })).toThrowError(/code already exits: 42/);
  });

  it("modify 仅允许已存在的默认错误", () => {
    const em = new ErrorManager();
    em.register("D_ERR", { code: 1, isDefault: true });
    em.register("NORMAL", { code: 10 });
    expect(() => em.modify("NOPE", {})).toThrowError(/error not exits: NOPE/);
    expect(() => em.modify("NORMAL", { code: 11 })).toThrowError(/only modify default error/);
    expect(em.get("NORMAL")?.code).toBe(10);
  });

  it("modify 默认错误：字段被覆盖、isDefault 置 false、新 code 纳入查重", () => {
    const em = new ErrorManager();
    em.register("D_ERR", { code: 1, isDefault: true, description: "旧描述" });
    em.modify("D_ERR", { code: 500, description: "新描述" });
    expect(em.get("D_ERR")).toEqual({
      name: "D_ERR",
      code: 500,
      description: "新描述",
      status: 200,
      isDefault: false,
      isShow: false,
      isLog: false,
    });
    expect(() => em.register("DUP_ERR", { code: 500 })).toThrowError(/code already exits: 500/);
  });

  it("import 跳过无 name 的条目", () => {
    const em = new ErrorManager();
    expect(() => em.import([{}, { code: 9 }])).not.toThrow();
    const names: string[] = [];
    em.forEach((_v, k) => names.push(k));
    expect(names).toEqual([]);
  });

  it("register 的 debug 输出包含 register: 前缀", () => {
    const em = new ErrorManager();
    const logs = captureDebugLogs("erest:core:error", debugModule.coreError, () => {
      em.register("DBG_ERR", { code: 77 });
    });
    expect(logs.join("\n")).toContain("register:");
  });
});

describe("debug 模块命名空间", () => {
  it("create 生成 erest: 前缀命名空间", () => {
    expect(debugModule.create("custom").namespace).toBe("erest:custom");
  });

  it("预置命名空间精确值", () => {
    expect(debugModule.core.namespace).toBe("erest:core");
    expect(debugModule.coreError.namespace).toBe("erest:core:error");
    expect(debugModule.coreType.namespace).toBe("erest:core:types");
    expect(debugModule.api.namespace).toBe("erest:api");
    expect(debugModule.params.namespace).toBe("erest:params");
    expect(debugModule.test.namespace).toBe("erest:test");
    expect(debugModule.docs.namespace).toBe("erest:docs");
    expect(debugModule.plugin.namespace).toBe("erest:plugin");
  });
});

// ---- error.ts：ERestError 工厂方法 ----

describe("error: ERestError 工厂方法", () => {
  test("missingParam：消息与 details", () => {
    const err = ERestError.missingParam("name");
    expect(err.message).toBe("missing required parameter 'name'");
    expect(err.code).toBe("MISSING_PARAM");
    expect(err.statusCode).toBe(400);
    expect(err.details).toEqual({ field: "name" });
  });

  test("invalidParam：无 expected 时消息为 incorrect parameter", () => {
    const err = ERestError.invalidParam("slug");
    expect(err.message).toBe("incorrect parameter 'slug'");
    expect(err.details).toEqual({ field: "slug", expected: undefined, received: undefined });
  });

  test("invalidParam：有 expected 时消息带期望类型", () => {
    const err = ERestError.invalidParam("slug", "int", "abc");
    expect(err.message).toBe("'slug' should be valid int");
    expect(err.details).toEqual({ field: "slug", expected: "int", received: "abc" });
  });

  test("internal：消息前缀 internal error + 500", () => {
    const err = ERestError.internal("boom");
    expect(err.message).toBe("internal error boom");
    expect(err.code).toBe("INTERNAL_ERROR");
    expect(err.statusCode).toBe(500);
    expect(err.details).toBeUndefined();
  });

  test("validation：消息透传", () => {
    const err = ERestError.validation("custom message", { field: "f" });
    expect(err.message).toBe("custom message");
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.details).toEqual({ field: "f" });
  });

  test("原型链与 toJSON", () => {
    const err = ERestError.missingParam("f");
    expect(err).toBeInstanceOf(ERestError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ERestError");
    expect(err.toJSON()).toEqual({
      name: "ERestError",
      code: "MISSING_PARAM",
      message: "missing required parameter 'f'",
      details: { field: "f" },
      statusCode: 400,
    });
  });
});
