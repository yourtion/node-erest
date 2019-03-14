/**
 * @file API Agent
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import assert from "assert";
import { IDebugger } from "debug";
import stream from "stream";
import { Test } from "supertest";
import util from "util";
import { create as createDebug, test as debug } from "./debug";
import { SUPPORT_METHOD, SUPPORT_METHODS } from "./api";
import { SourceResult } from "./utils";
import ERest from ".";

const defaultFormatOutput = (data: any) => [null, data];

/** 返回对象结构字符串 */
function inspect(obj: any) {
  return util.inspect(obj, { depth: 5, colors: true });
}

export interface ITestAgentOption {
  erest: ERest<any>;
  sourceFile: SourceResult;
  method: SUPPORT_METHODS;
  path: string;
  agent?: Test;
  takeExample: boolean;
  agentTestName?: string;
  headers?: Record<string, any>;
  input?: Record<string, any>;
  output?: Record<string, any>;
  agentHeader?: Record<string, any>;
  agentInput: Record<string, any>;
  agentOutput?: Record<string, any>;
}

/**
 * 测试代理类
 */
export class TestAgent {
  public options: ITestAgentOption;
  public key: string;
  public debug: IDebugger;

  /**
   * 构造函数
   *
   * @param method HTTP请求方法
   * @param path 请求路径
   * @param key 键名：`method path`
   * @param sourceFile 源文件路径描述对象
   * @param erestIns hojs实例
   */
  constructor(method: SUPPORT_METHODS, path: string, key: string, sourceFile: SourceResult, erestIns: any) {
    assert(typeof method === "string", "`method` must be string");
    assert(SUPPORT_METHOD.indexOf(method.toLowerCase()) !== -1, "`method` must be one of " + SUPPORT_METHOD);
    assert(typeof path === "string", "`path` must be string");
    assert(path[0] === "/", '`path` must be start with "/"');
    this.options = {
      erest: erestIns,
      sourceFile,
      method: method.toLowerCase() as SUPPORT_METHODS,
      path,
      takeExample: false,
      agentInput: {} as Record<string, any>,
    };
    this.key = key;
    this.debug = createDebug(`agent:${this.key}`);
    this.debug("new: %s %s from %s", method, path, sourceFile.absolute);
  }

  /** 设置`supertest.Agent`实例 */
  public setAgent(agent: Test) {
    this.debug("setAgent");
    this.options.agent = agent;
  }

  /** 初始化`supertest.Agent`实例 */
  public initAgent(app: any) {
    const request = require("supertest");
    assert(request, "Install `supertest` first");
    assert(app, `express app instance could not be empty`);
    debug("create supertest agent");
    this.setAgent(request(app)[this.options.method](this.options.path) as Test);
  }

  /** 获取测试代理 */
  public agent(): TestAgent {
    debug("agent");
    return this;
  }

  /** 对测试结果加入文档 */
  public takeExample(name: string) {
    this.debug("takeExample: %s", name);
    this.options.agentTestName = name;
    this.options.takeExample = true;
    return this;
  }

  /** 设置请求header */
  public headers(data: Record<string, any>) {
    this.debug("headers: %j", data);
    this.options.agentHeader = data;
    Object.keys(data).forEach(k => this.options.agent!.set(k, data[k]));
    return this;
  }

  /** 添加 query 参数 */
  public query(data: Record<string, any>) {
    this.debug("query: %j", data);
    Object.assign(this.options.agentInput, data);
    this.options.agent!.query(data);
    return this;
  }

  /** 添加输入参数 */
  public input(data: Record<string, any>) {
    this.debug("input: %j", data);
    Object.assign(this.options.agentInput, data);
    if (this.options.method === "get" || this.options.method === "delete") {
      this.options.agent!.query(data);
    } else {
      this.options.agent!.send(data);
    }
    return this;
  }

  /** 添加 POST 参数 */
  public attach(data: Record<string, any>) {
    this.debug("attach: %j", data);
    for (const i in data) {
      if (data[i] instanceof stream.Readable) {
        this.options.agent!.attach(i, data[i]);
        delete data[i];
      } else {
        this.options.agent!.field(i, data[i]);
      }
    }
    Object.assign(this.options.agentInput, data);
    return this;
  }

  /** 保存输出结果到 Example */
  private saveExample() {
    this.debug("Save Example: %o", this.options.takeExample);
    if (this.options.takeExample) {
      this.options.erest.api.$apis.get(this.key)!.example({
        name: this.options.agentTestName,
        headers: this.options.agentHeader,
        input: this.options.agentInput || {},
        output: this.options.agentOutput,
      });
    }
  }

  /** 获取输出结果 */
  private output(raw = false, save = false) {
    this.options.erest.api.$apis.get(this.key)!.options.tested = true;
    return this.options.agent!.then(res => {
      this.options.agentOutput = res.body;
      if (raw) return res;
      const formatOutputReverse = this.options.erest.api.formatOutputReverse || defaultFormatOutput;
      const [err2, ret] = formatOutputReverse(res.body);
      if (err2) throw err2;
      if (save) this.saveExample();
      return ret;
    });
  }

  /** 期望输出成功结果 */
  public success() {
    this.debug("success");
    return this.output(false, true).catch(err => {
      throw new Error(`${this.key} 期望API输出成功结果，但实际输出失败结果：${inspect(err)}`);
    });
  }

  /** 期望输出失败结果 */
  public error() {
    this.debug("error");
    return this.output()
      .then(ret => {
        throw new Error(`${this.key} 期望API输出失败结果，但实际输出成功结果：${inspect(ret)}`);
      })
      .catch(err => {
        this.saveExample();
        return err;
      });
  }

  /** 获取原始输出 */
  public raw() {
    this.debug("raw");
    return this.output(true, true);
  }
}
