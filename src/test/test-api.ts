import lib from "./lib";
import express from "express";
import { build, TYPES } from "./helper";
import { GROUPS, INFO } from "./lib";
import { getCallerSourceLine, getPath } from "../lib/utils";

describe("API - base", () => {
  const apiService = lib();

  it("API - service Info", () => {
    const apiInfo = apiService.privateInfo.info;
    expect(apiInfo.title).toBe(INFO.title);
    expect(apiInfo.description).toBe(INFO.description);
    expect(apiInfo.version).toBe(INFO.version);
    expect(apiInfo.host).toBe(INFO.host);

    expect(apiService.privateInfo.groups).toEqual(GROUPS);
  });

  it("API - service Init", () => {
    expect(apiService.privateInfo.groups).toEqual(GROUPS);
  });

  it("API - service Init", () => {
    apiService.setDocOutputForamt((out: any) => out);
    expect(apiService.privateInfo.groups).toEqual(GROUPS);
  });

  it("API - register error empty", () => {
    apiService.errors.register("TEST", {});
  });
});

describe("API - Params wtih schema", () => {
  const apiService = lib();
  apiService.schema.register("a", {
    a: build(TYPES.String, "str"),
  });
  apiService.api
    .get("/")
    .group("Index")
    .query({
      a: build("a", "Int", true),
      b: build("a[]", "Int[]", true),
    })
    .register(() => {});
  const router = express();
  apiService.bindRouter(router, apiService.checkerExpress);
  expect(apiService.schema.has("a")).toBeTruthy();
});

describe("API - more test", () => {
  const apiService = lib();
  apiService.setMockHandler(() => {
    return () => {};
  });
  apiService.api.get("/b").mock();
  const api = apiService.api
    .get("/a")
    .params({
      p: build(TYPES.ENUM, "Int", true),
    })
    .group("Index")
    .register(() => {});

  it("Utils - getCallerSourceLine", () => {
    const { relative, absolute } = getCallerSourceLine("z:/getCallerSourceLine");
    expect(relative).toBeUndefined();
    expect(absolute).toBeUndefined();
  });

  it("Utils - getPath", () => {
    const p = getPath("Yourtion", "/a");
    expect(p).toBe("/a");
  });

  it("API - genDocs", () => {
    apiService.genDocs(undefined, true);
  });

  it("API - apiChecker", () => {
    const checker = apiService.apiChecker();
    expect(() => checker(api, {}, {}, {})).toThrow("missing required parameter 'p'");
  });

  it("API - responseChecker", () => {
    const checker = apiService.responseChecker();
    const ret = checker(api, {});
    expect(ret).toEqual({ ok: true, message: "success", value: {} });
  });

  it("API - require a params", () => {
    expect(() => api.init(apiService)).toThrow("ENUM is require a params");
  });

  it("API - error mamager modify", () => {
    apiService.errors.modify("PERMISSIONS_ERROR", { isShow: false });
    const e = apiService.errors.get("PERMISSIONS_ERROR");
    expect(e!.isShow).toEqual(false);
    expect(e!.isDefault).toEqual(false);
  });
});
