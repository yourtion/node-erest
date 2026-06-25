import { createRequire } from "node:module";
import type ERest from "../lib";
import * as ERestModule from "../lib";

/** CJS/ESM 兼容的 require（加载发布产物用） */
const require = createRequire(import.meta.url);

/** 错误信息 */
export const ERROR_INFO = Object.freeze({
  DataBaseError: { code: -1004, desc: "数据库错误", show: false, log: true },
  PermissionsError: { code: -1003, desc: "权限不足", show: true, log: true },
  missingParameterError: (msg: string) => ({ status: 400, message: `Missing Parameter: ${msg}` }),
  invalidParameterError: (msg: string) => ({ status: 400, message: `Invalid Parameter: ${msg}` }),
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
  let ERest: typeof ERestModule.default;
  if (process.env.ISLIB) {
    // 测试源码：ISLIB=1 时直接导入 src 源码，无需构建 dist
    // 用于 test:lib / test:cov / dev，可在干净仓库直接运行
    ERest = ERestModule.default;
  } else {
    // 测试发布产物：未设置 ISLIB 时加载 dist 编译产物，
    // 用于 `npm test`（脚本会先执行 build，此时 dist 必然存在）
    const pack = require("../../dist/lib");
    ERest = pack.default;
  }
  // 生成 EREST
  const apiService = new ERest(Object.assign({ ...DEFAULT_OPTION, ...options }));
  return apiService as ERest;
};
