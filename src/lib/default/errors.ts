/**
 * @file 基本错误类型
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import { ErrorManager } from "../manager/error";

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
      name: "RATE_LIMITED",
      code: -1001,
      description: "请求过多",
      isShow: true,
      isLog: false,
    },
    {
      name: "MISSING_PARAMETER",
      code: -1002,
      description: "缺少参数",
      isShow: true,
      isLog: false,
    },
    {
      name: "INVALID_PARAMETER",
      code: -1003,
      description: "参数不合法",
      isShow: true,
      isLog: false,
    },
    {
      name: "PERMISSIONS_ERROR",
      code: -1004,
      description: "权限不足",
      isShow: true,
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
      name: "EXCE_INVALID_ERROR",
      code: -1006,
      description: "不合法执行",
      isShow: true,
      isLog: false,
    },
    {
      name: "DATABASE_ERROR",
      code: -1007,
      description: "数据库错误",
      isShow: false,
      isLog: true,
    },
    {
      name: "REPEAT_ERROR",
      code: -1008,
      description: "该记录已经存在",
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
