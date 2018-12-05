import ERest from "../lib";

export const ERROR_INFO = Object.freeze({
  DataBaseError: { code: -1004, desc: "数据库错误", show: false, log: true },
  PermissionsError: { code: -1003, desc: "权限不足", show: true, log: true },
});

export const INFO = {
  title: "erest-demo",
  description: "Easy to write, easy to test, easy to generate document.",
  version: new Date(),
  host: "http://127.0.0.1:3001",
  basePath: "/api",
};

export const GROUPS = {
  Index: "首页",
  Index2: "首页2",
};

export default (options = {}) => {
  const packPath = process.env.ISLIB ? "../lib" : "../../dist/lib";
  const pack = require(packPath);
  const ERest = pack.default;
  const apiService = new ERest(
    Object.assign(
      {
        info: INFO,
        errors: ERROR_INFO,
        groups: GROUPS,
        path: __dirname,
        docs: {
          wiki: true,
          index: true,
          home: true,
          swagger: true,
          postman: true,
          json: true,
          axios: true,
          all: true,
        },
      },
      options
    )
  );
  return apiService as ERest;
};
