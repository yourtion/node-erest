import lib from "./lib";
import express from "express";
import * as z from 'zod'; // Add zod import
// Removed build, TYPES from "./helper"
import { GROUPS, INFO } from "./lib";
import { getCallerSourceLine, getPath } from "../lib/utils";

describe("ERest - 基础测试", () => {
  const apiService = lib();

  test("ERest - 信息初始化", () => {
    const libInfo = apiService.privateInfo.info;
    expect(libInfo.title).toBe(INFO.title);
    expect(libInfo.description).toBe(INFO.description);
    expect(libInfo.version).toBe(INFO.version);
    expect(libInfo.host).toBe(INFO.host);
  });

  test("ERest - 分组信息", () => {
    expect(apiService.privateInfo.groups).toEqual(GROUPS);
  });

  test("ERest - 注册文件输出函数", () => {
    const org = (apiService as any).apiInfo.docOutputForamt;
    const fn = (out: any) => out;
    apiService.setDocOutputForamt(fn);
    const now = (apiService as any).apiInfo.docOutputForamt;
    expect(org).not.toEqual(now);
    expect(now).toEqual(fn);
  });

  test("ERest - 注册错误信息", () => {
    apiService.errors.register("TEST", {});
  });
});

// Describe block for old schema/type registration is removed as the system was removed.
// New tests would focus on using Zod schemas directly.

describe("ERest - 更多测试（完善覆盖率）", () => {
  const apiService = lib();

  describe("Utils", () => {
    test("getCallerSourceLine", () => {
      const { relative, absolute } = getCallerSourceLine("z:/getCallerSourceLine");
      expect(relative).toBeUndefined();
      expect(absolute).toBeUndefined();
    });

    test("getPath", () => {
      const p = getPath("Yourtion", "/a");
      expect(p).toBe("/a");
    });
  });

  describe("ERest", () => {
    test("genDocs", () => {
      apiService.genDocs(undefined, true);
    });

    test("error mamager modify", () => {
      apiService.errors.modify("PERMISSIONS_ERROR", { code: -999, isShow: false });
      const e = apiService.errors.get("PERMISSIONS_ERROR");
      expect(e!.isShow).toEqual(false);
      expect(e!.isDefault).toEqual(false);
    });
  });

  // TODO: 完善 Mock 方法
  apiService.setMockHandler(() => () => {});
  apiService.api.get("/b").mock();

  describe("Checker", () => {
    const apiWithEnumQuery = apiService.api.define({
      method: "get",
      path: "/a",
      group: "Index",
      title: "ENUM Test",
      query: z.object({ p: z.enum(["val1", "val2"]) }), // Zod enum
      handler: () => {},
    });

    test("apiChecker with missing required enum", () => {
      const checker = apiService.apiChecker();
      // apiParamsCheck will use the schema from apiWithEnumQuery.options.query
      // Zod error for missing 'p' would be something like "Required"
      // ErrorManager prepends "缺少参数: "
      expect(() => checker(apiWithEnumQuery, {}, {}, {})).toThrow(/^缺少参数: 'p' Required$/);
    });

    test("responseChecker with Zod schema", () => {
      const checker = apiService.responseChecker();
      const sampleZodSchema = z.object({ name: z.string() });
      const successData = { name: "test" };
      const failureData = { name: 123 };
      
      let ret = checker(successData, sampleZodSchema);
      expect(ret.ok).toBe(true);
      expect(ret.value).toEqual(successData);
      expect(ret.error).toBeUndefined();

      ret = checker(failureData, sampleZodSchema);
      expect(ret.ok).toBe(false);
      expect(ret.value).toBeUndefined();
      expect(ret.error).toBeInstanceOf(z.ZodError);
      // Check for specific error message if needed, e.g.:
      // expect(ret.error?.errors[0].message).toBe("Expected string, received number");
    });

    // "require params" test is removed as it tested a feature of the old type system's .init() method
  });
});
