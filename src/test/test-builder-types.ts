import { z } from "zod";
import { describe, test, expectTypeOf } from "vitest";
import API from "../lib/api.js";
import lib from "./lib.js";

const apiService = lib();

describe("Builder 类型推导", () => {
  test("registerTyped 的 handler 入参由 Zod schema 编译期推导", () => {
    apiService.api
      .post("/type-infer")
      .group("Index")
      .registerTyped(
        {
          query: z.object({ active: z.boolean() }),
          body: z.object({ name: z.string(), age: z.number().int() }),
          params: z.object({ id: z.string() }),
        },
        (req) => {
          // 编译期类型断言：req 各层类型由 Zod schema 精确推导
          expectTypeOf(req.query.active).toEqualTypeOf<boolean>();
          expectTypeOf(req.body.name).toEqualTypeOf<string>();
          expectTypeOf(req.body.age).toEqualTypeOf<number>();
          expectTypeOf(req.params.id).toEqualTypeOf<string>();
        }
      );
  });

  test("链式 .body().query() 设置 schema 后 options 正确持有", () => {
    const api = new API("post", "/chain", { absolute: "t" } as never, "g");
    api.body(z.object({ name: z.string() })).query(z.object({ page: z.number() }));
    expectTypeOf(api.options.bodySchema).not.toBeAny();
    expectTypeOf(api.options.querySchema).not.toBeAny();
  });
});
