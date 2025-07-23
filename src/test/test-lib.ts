import express from "express";
import { z } from "zod";
import { getCallerSourceLine, getPath } from "../lib/utils";
import { build, TYPES } from "./helper";
import lib, { GROUPS, INFO } from "./lib";

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
    const org = (apiService as { apiInfo: { docOutputForamt: unknown } }).apiInfo.docOutputForamt;
    const fn = (out: unknown) => out;
    apiService.setDocOutputForamt(fn);
    const now = (apiService as { apiInfo: { docOutputForamt: unknown } }).apiInfo.docOutputForamt;
    expect(org).not.toEqual(now);
    expect(now).toEqual(fn);
  });

  test("ERest - 注册错误信息", () => {
    apiService.errors.register("TEST", {});
  });
});

describe("ERest - schema 注册与使用", () => {
  const apiService = lib();

  test("add Type", () => {
    apiService.type.register("Any2", z.unknown());
    expect(apiService.type.has("Any2")).toBeTruthy();
  });

  test("add Schema", () => {
    // 注册一个名字为`a`的 schema
    const aSchema = apiService.createSchema({
      a: build(TYPES.String, "str"),
    });
    apiService.schema.register("a", aSchema);

    apiService.api
      .get("/")
      .group("Index")
      .query({
        a: build("a", "Object-a", true),
        // 使用 a 类型对象的数组
        b: build("a[]", "Object-a Array", true),
      })
      .register(() => {});

    const router = express();
    apiService.bindRouter(router, apiService.checkerExpress);
    expect(apiService.schema.has("a")).toBeTruthy();
  });
});

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
      expect(e?.isShow).toEqual(false);
      expect(e?.isDefault).toEqual(false);
    });
  });

  // TODO: 完善 Mock 方法
  apiService.setMockHandler(() => () => {});
  apiService.api.get("/b").mock();

  describe("Checker", () => {
    const api = apiService.api.define({
      method: "get",
      path: "/a",
      group: "Index",
      title: "ENUM Without params Test",
      query: { p: build(TYPES.ENUM, "ENUM Without params", true) },
      handler: () => {},
    });

    test("apiParamsCheck", () => {
      expect(() => api.init(apiService)).toThrow("ENUM is require a params");
    });

    test("responseChecker", () => {
      const checker = apiService.responseChecker();
      const ret = checker({}, { type: "object" });
      expect(ret).toEqual({ ok: true, message: "success", value: {} });
    });

    test("require params", () => {
      expect(() => api.init(apiService)).toThrow("ENUM is require a params");
    });
  });
});
