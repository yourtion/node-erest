import lib from "./lib";
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

describe("API - more test", () => {
  const apiService = lib();
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

  it("API - require a params", () => {
    expect(() => api.init(apiService)).toThrow("ENUM is require a params");
  });
});
