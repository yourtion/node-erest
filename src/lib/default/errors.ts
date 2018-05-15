/**
 * @file API 基本类型
 * 参考 hojs
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import * as assert from "assert";
import * as validator from "validator";
import { ErrorManager } from "../manager/error";
import { camelCase2underscore } from "../utils";

export function defaultErrors(error: ErrorManager) {
  error.import([
    {
      name: "INTERNAL_ERROR",
      code: -1000,
      description: "内部错误",
      isShow: true,
      isLog: true,
    },
    {
      name: "MISSING_PARAMETER",
      code: -1001,
      description: "缺少参数",
      isShow: true,
      isLog: false,
    },
    {
      name: "INVALID_PARAMETER",
      code: -1002,
      description: "参数不合法",
      isShow: true,
      isLog: false,
    },
    {
      name: "PERMISSIONS_ERROR",
      code: -1003,
      description: "权限不足",
      isShow: true,
      isLog: true,
    },
    {
      name: "DATABASE_ERROR",
      code: -1004,
      description: "数据库错误",
      isShow: false,
      isLog: true,
    },
    {
      name: "NOT_FOUND_ERROR",
      code: -1005,
      description: "找不到内容",
      isShow: true,
      isLog: false,
    },
    {
      name: "REPEAT_ERROR",
      code: -1007,
      description: "该记录已经存在",
      isShow: true,
      isLog: false,
    },
    {
      name: "EXCE_INVALID_ERROR",
      code: -1008,
      description: "不合法执行",
      isShow: true,
      isLog: false,
    },
    {
      name: "DEPEND_ERROR",
      code: -1009,
      description: "数据存在依赖",
      isShow: true,
      isLog: false,
    },
  ]);
}
