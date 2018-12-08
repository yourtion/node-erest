import ERest from "../lib";

/** 错误信息 */
export const ERROR_INFO = Object.freeze({
  DataBaseError: { code: -1004, desc: "数据库错误", show: false, log: true },
  PermissionsError: { code: -1003, desc: "权限不足", show: true, log: true },
});

/** 基本信息 */
export const INFO = Object.freeze({
  title: "erest-demo",
  description: "Easy to write, easy to test, easy to generate document.",
  version: 1.0,
  host: "http://127.0.0.1:3001",
  basePath: "/api",
});

/** 分组信息 */
export const GROUPS = Object.freeze({
  Index: "首页",
  Index2: "首页2",
});

/** 默认配置信息 */
const DEFAULT_OPTION = Object.freeze({
  info: INFO,
  errors: ERROR_INFO,
  groups: GROUPS,
  path: __dirname,
  docs: Object.freeze({
    wiki: true,
    index: true,
    home: true,
    swagger: true,
    postman: true,
    json: true,
    axios: true,
    all: true,
  }),
});

/** 获得 ERest 实例 */
export default (options = {}) => {
  // 根据环境获取包
  const packPath = process.env.ISLIB ? "../lib" : "../../dist/lib";
  const pack = require(packPath);
  const ERest = pack.default;
  // 生成 EREST
  const apiService = new ERest(Object.assign({ ...DEFAULT_OPTION, ...options }));
  return apiService as ERest;
};
