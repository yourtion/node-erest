import type ERest from "../lib";
import * as ERestModule from "../lib";

/**
 * 非源码模式（未设 ISLIB）时，预加载 dist 发布产物（ESM-only）。
 * 用顶层 await 在模块加载阶段完成 import 并缓存，lib() 保持同步签名，
 * 避免所有调用点改为 async。仅 `npm test`（含 build）走此分支；
 * test:lib / test:cov / dev 设 ISLIB=1 直接用源码，不触发此 import。
 */
let distDefault: typeof ERestModule.default | undefined;
if (!process.env.ISLIB) {
  const pack = await import("../../dist/lib/index.js");
  distDefault = pack.default;
}

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
  const ERest = process.env.ISLIB ? ERestModule.default : distDefault!;
  // 生成 EREST
  const apiService = new ERest(Object.assign({ ...DEFAULT_OPTION, ...options }));
  return apiService as ERest;
};
