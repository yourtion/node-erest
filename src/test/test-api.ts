import lib from "./lib";
import { GROUPS, INFO } from "./lib";

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

  it("API - utils", () => {
    expect(apiService.utils.getCallerSourceLine("/qq")).toEqual({
      relative: undefined,
      absolute: undefined,
    });
    const cb = apiService.utils.createPromiseCallback();
    expect(cb.promise).rejects.toEqual(new Error());
    cb(new Error());
  });

  it("API - service Init", () => {
    apiService.setDocOutputForamt((out: any) => out);
    expect(apiService.privateInfo.groups).toEqual(GROUPS);
  });

  it("API - register error empty", () => {
    apiService.errors.register("TEST", {});
  });
});
