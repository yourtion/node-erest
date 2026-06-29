/**
 * @file defaultErrorFormatter 测试
 * 验证错误格式器对 ERestError / 普通 Error 输出一致的 {status, body} 结构
 */
import { describe, expect, it } from "vitest";
import { ERestError, defaultErrorFormatter } from "../lib/error.js";

describe("defaultErrorFormatter", () => {
  it("ERestError 输出 statusCode 与 code/message body", () => {
    const err = new ERestError("AUTH_REQUIRED", "未登录", undefined, 401);
    const out = defaultErrorFormatter(err);
    expect(out.status).toBe(401);
    expect(out.body).toEqual({ error: "未登录", code: "AUTH_REQUIRED" });
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
