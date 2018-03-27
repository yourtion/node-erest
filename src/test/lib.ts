import * as api from "../lib";

export const INFO = {
  title: "erest-demo",
  description: "Easy to write, easy to test, easy to generate document.",
  version: new Date(),
  host: "http://127.0.0.1:3001",
  basePath: "/api",
};

export const GROUPS = {
  Index: "首页",
};

export default (options = { info: INFO, groups: GROUPS }) => {
  const packPath = process.env.ISCOV ? "../lib" : "../../dist/lib";
  const pack = require(packPath);
  const API = pack.default;
  const apiService = new API({
    info: INFO,
    groups: GROUPS,
  });
  return apiService as api.default;
};
