import API from "../dist/lib";

const INFO = {
  title: "erest-demo",
  description: "Easy to write, easy to test, easy to generate document.",
  version: new Date(),
  host: "http://127.0.0.1:3001",
  basePath: "/api",
};
const GROUPS = {
  Index: "首页",
};

const apiService = new API({
  info: INFO,
  groups: GROUPS,
});

test("API service Info", () => {
  const apiInfo = apiService.info;
  expect(apiInfo.title).toBe(INFO.title);
  expect(apiInfo.description).toBe(INFO.description);
  expect(apiInfo.version).toBe(INFO.version);
  expect(apiInfo.host).toBe(INFO.host);

  expect(apiService.groups).toEqual(GROUPS);
});

test("API service Init", () => {
  expect(apiService.groups).toEqual(GROUPS);
});
