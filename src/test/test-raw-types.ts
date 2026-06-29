/**
 * @file reply.raw 框架泛型类型推导测试
 * 验证子包 createERest() 工厂构造时锁定 Raw，handler reply.raw 自动强类型
 */
import type express from "express";
import { describe, test, expectTypeOf } from "vitest";
import { createERest as createExpressERest, type ExpressRaw } from "../../packages/erest-express/src/index.js";

describe("createERest 类型锁定", () => {
  test("Express createERest 返回的实例 handler reply.raw 为 ExpressRaw（零标注强类型）", () => {
    const api = createExpressERest({
      info: { title: "t", version: "1.0.0" },
      groups: { Index: "首页" },
    });
    api
      .api.post("/raw-typed")
      .group("Index")
      .registerTyped({}, (_req, reply) => {
        // 构造时锁定 Raw=ExpressRaw：reply.raw 自动强类型，handler 零标注
        expectTypeOf(reply.raw).toEqualTypeOf<ExpressRaw>();
        // reply.raw.res 是 Express Response
        expectTypeOf(reply.raw.res).toMatchTypeOf<express.Response>();
      });
  });
});
