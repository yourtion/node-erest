import { describe, expect, it } from "vitest";
import { z } from "../lib/index.js";

describe("z.anyObject() 便利别名", () => {
  it("应接受任意键值的对象", () => {
    const schema = z.anyObject();
    const parsed = schema.parse({ foo: 1, bar: "x", nested: { a: true } });
    expect(parsed).toEqual({ foo: 1, bar: "x", nested: { a: true } });
  });

  it("应拒绝非对象值", () => {
    const schema = z.anyObject();
    expect(() => schema.parse("not-object")).toThrow();
    expect(() => schema.parse(42)).toThrow();
    expect(() => schema.parse(null)).toThrow();
  });

  it("空对象应通过", () => {
    const schema = z.anyObject();
    expect(schema.parse({})).toEqual({});
  });
});
