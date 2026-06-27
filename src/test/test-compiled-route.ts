import { describe, it, expect } from "vitest";
import { z } from "zod";
import { compileValidate } from "../lib/params.js";
import lib from "./lib.js";

const apiService = lib();

describe("compileValidate", () => {
  it("成功校验返回分层参数", () => {
    const compiled = compileValidate(apiService as never, {
      paramsSchema: z.object({ id: z.string() }),
      querySchema: z.object({ limit: z.coerce.number().default(10) }),
      bodySchema: z.object({ name: z.string() }),
    });
    const result = compiled.validate({
      params: { id: "u1" },
      query: { limit: "20" },
      body: { name: "Tom" },
    });
    expect(result.params).toEqual({ id: "u1" });
    expect(result.query).toEqual({ limit: 20 });
    expect(result.body).toEqual({ name: "Tom" });
  });

  it("缺失必填字段抛 MISSING_PARAM", () => {
    const compiled = compileValidate(apiService as never, {
      bodySchema: z.object({ name: z.string() }),
    });
    expect(() => compiled.validate({ body: {} })).toThrow(/missing required parameter/);
  });

  it("类型错误抛 INVALID_PARAM", () => {
    const compiled = compileValidate(apiService as never, {
      bodySchema: z.object({ age: z.number().int() }),
    });
    expect(() => compiled.validate({ body: { age: "abc" } })).toThrow(/should be valid/);
  });

  it("无 schema 的层返回空对象（热路径零分配）", () => {
    const compiled = compileValidate(apiService as never, {});
    const result = compiled.validate({});
    expect(result).toEqual({ params: {}, query: {}, body: {}, headers: {} });
  });

  it("闭包裁剪：只有 bodySchema 时 validate 不触碰 params/query/headers 分支", () => {
    const compiled = compileValidate(apiService as never, {
      bodySchema: z.object({ x: z.number() }),
    });
    // 传入 params/query/headers 的脏数据，不应触发它们的校验（因为无 schema）
    const result = compiled.validate({ params: { id: 123 }, body: { x: 1 } });
    expect(result.body).toEqual({ x: 1 });
    expect(result.params).toEqual({});
  });

  it("body 为 undefined 时不触发 body 校验", () => {
    const compiled = compileValidate(apiService as never, {
      bodySchema: z.object({ name: z.string() }),
    });
    const result = compiled.validate({});
    expect(result.body).toEqual({});
  });
});
