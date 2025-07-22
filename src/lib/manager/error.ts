/**
 * @file API 类型管理器
 * 参考 hojs
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import { strict as assert } from "assert";
import { coreError as debug } from "../debug";
import { Manager } from "./manager";

const NAME_REGX = new RegExp("[^A-Z_]", "g");
export interface IError {
  /** 错误名称 */
  name: string;
  /** 错误状态码 */
  status: number;
  /** 错误码 */
  code: number;
  /** 错误描述 */
  description: string;
  /** 是否为默认错误 */
  isDefault: boolean;
  /** 出现错误时是否输出到前端 */
  isShow: boolean;
  /** 出现错误时是否打印日志 */
  isLog: boolean;
}

export class ErrorManager extends Manager<IError> {
  private codes: Set<number> = new Set();

  /** 注册错误类型 */
  public register(name: string, error: Partial<IError>) {
    assert(typeof name === "string", "error name must be string");
    assert(!NAME_REGX.test(name), `name must be uppercase or _ but get ${name}`);

    const { code = -1, description = "", status = 200, isDefault = false, isShow = false, isLog = false } = error;

    assert(!this.codes.has(code), "code already exits: " + code);

    debug("register: %s %j", name, error);
    this.codes.add(code);
    this.map.set(name, { name, code, description, status, isDefault, isShow, isLog });

    return this;
  }

  /** 修改默认错误 */
  public modify(name: string, data: Partial<IError>) {
    assert(this.map.has(name), "error not exits: " + name);
    const old = this.map.get(name);
    assert(old!.isDefault, "only modify default error");

    if (data.code) this.codes.add(data.code);
    data.isDefault = false;
    this.map.set(name, Object.assign(old!, data));

    return this;
  }

  /** 导入错误 */
  public import(errors: Array<Partial<IError>>) {
    for (const err of errors) {
      this.register(err.name!, err);
    }
  }
}
