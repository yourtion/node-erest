import lib from "./lib";
import express from "express";
import { build, TYPES } from "./helper";
import { GROUPS, INFO } from "./lib";
import { getCallerSourceLine, getPath } from "../lib/utils";

describe("ERest - 基础测试", () => {
  const apiService = lib();

  test("ERest - 信息初始化", () => {
    const apiInfo = apiService.privateInfo.info;
    expect(apiInfo.title).toBe(INFO.title);
    expect(apiInfo.description).toBe(INFO.description);
    expect(apiInfo.version).toBe(INFO.version);
    expect(apiInfo.host).toBe(INFO.host);
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

describe("ERest - schema 注册与使用", () => {
  const apiService = lib();

  // 注册一个名字为`a`的 schema
  apiService.schema.register("a", {
    a: build(TYPES.String, "str"),
  });

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
    const api = apiService.api.define({
      method: "get",
      path: "/a",
      group: "Index",
      title: "ENUM Without params Test",
      query: { p: build(TYPES.ENUM, "ENUM Without params", true) },
      handler: () => {},
    });

    test("apiChecker", () => {
      const checker = apiService.apiChecker();
      expect(() => checker(api, {}, {}, {})).toThrow("missing required parameter 'p'");
    });

    test("responseChecker", () => {
      const checker = apiService.responseChecker();
      const ret = checker(api, {});
      expect(ret).toEqual({ ok: true, message: "success", value: {} });
    });

    test("require params", () => {
      expect(() => api.init(apiService)).toThrow("ENUM is require a params");
    });
  });
});
