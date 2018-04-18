/**
 * @file API 类型管理器
 * 参考 hojs
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import * as assert from "assert";
import { core as debug } from "../debug";
import { Manager } from "./manager";

export interface IError {
  name: string;
  status: number;
  code: number;
  message: string;
  isDefault: boolean;
  isShow: boolean;
  isLog: boolean;
}

export class ErrorManager extends Manager<IError> {

  private codes: Set<number> = new Set();
  private NAME_REGX = new RegExp("[^A-Z_]", "g");

  /**
   * 注册错误类型
   *
   * @param {String} name 名称（一般为英文字母）
   * @param {Object} data 数据
   *   - {String|Number} status 错误代码
   *   - {String} message 错误描述
   * @return {Object}
   */
  public register(name: string, data: Partial<IError>) {

    assert(typeof name === "string", "error name must be string");
    assert(!this.NAME_REGX.test(name), `name must be uppercase or _ but get ${name}`);

    const {
      code = -1,
      message = "",
      status = 200,
      isDefault = false,
      isShow = false,
      isLog = false,
    } = data;

    assert(!this.codes.has(code), "code already exits");

    debug("register: %s %j", name, data);
    this.codes.add(code);
    this.map.set(name, { name, code, message, status, isDefault, isShow, isLog });

    return this;
  }

}
