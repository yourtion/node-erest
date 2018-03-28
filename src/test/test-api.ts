import lib from "./lib";
import { GROUPS, INFO } from "./lib";

const apiService = lib();

test("API - service Info", () => {
  const apiInfo = apiService.info;
  expect(apiInfo.title).toBe(INFO.title);
  expect(apiInfo.description).toBe(INFO.description);
  expect(apiInfo.version).toBe(INFO.version);
  expect(apiInfo.host).toBe(INFO.host);

  expect(apiService.groups).toEqual(GROUPS);
});

test("API - service Init", () => {
  expect(apiService.groups).toEqual(GROUPS);
});
