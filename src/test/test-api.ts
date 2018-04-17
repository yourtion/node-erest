import lib from "./lib";
import { GROUPS, INFO } from "./lib";

const apiService = lib();

describe("API - base", () => {
  test("API - service Info", () => {
    const apiInfo = apiService.privateInfo.info;
    expect(apiInfo.title).toBe(INFO.title);
    expect(apiInfo.description).toBe(INFO.description);
    expect(apiInfo.version).toBe(INFO.version);
    expect(apiInfo.host).toBe(INFO.host);

    expect(apiService.privateInfo.groups).toEqual(GROUPS);
  });

  test("API - service Init", () => {
    expect(apiService.privateInfo.groups).toEqual(GROUPS);
  });
});

describe("API - addon", () => {
  test("API - utils", () => {
    apiService.utils.customError();
    expect(apiService.utils.getCallerSourceLine("/qq")).toEqual({
      relative: undefined,
      absolute: undefined,
    });
    const cb = apiService.utils.createPromiseCallback();
    expect(cb.promise).rejects.toEqual(new Error());
    cb(new Error());
  });

  test("API - service Init", () => {
    apiService.setDocOutputForamt((out: any) => out);
    expect(apiService.privateInfo.groups).toEqual(GROUPS);
  });
});
