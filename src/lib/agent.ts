/**
 * @file API Agent
 * 参考 hojs
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import * as assert from "assert";
import { IDebugger } from "debug";
import * as stream from "stream";
import { SuperAgent, SuperAgentRequest } from "superagent";
import { Test } from "supertest";
import * as util from "util";
import { create as createDebug, test as debug } from "./debug";
import { ICallback, IKVObject, IPromiseCallback } from "./interfaces";
import { Schema } from "./schema";
import * as utils from "./utils";

const defaultFormatOutput = (data: any) => [null, data];

/**
 * 返回对象结构字符串
 *
 * @param {Object} obj
 * @return {String}
 */
function inspect(obj: any) {
  return util.inspect(obj, {
    depth: 5,
    colors: true,
  });
}

export interface ITestAgentOption {
  parent: any;
  sourceFile: utils.ISourceResult;
  method: string;
  path: string;
  agent?: Test;
  takeExample: boolean;
  agentTestName?: string;
  headers?: IKVObject;
  input?: IKVObject;
  output?: IKVObject;
  agentPath?: IKVObject;
  agentHeader?: IKVObject;
  agentInput: IKVObject;
  agentOutput?: IKVObject;
}

/**
 * 测试代理类
 */
export class TestAgent {
  public static SUPPORT_METHOD = Schema.SUPPORT_METHOD;
  public options: ITestAgentOption;
  public key: string;
  public debug: IDebugger;

  /**
   * 构造函数
   *
   * @param {String} method HTTP请求方法
   * @param {String} path 请求路径
   * @param {String} key 键名：`method path`
   * @param {Object} sourceFile 源文件路径描述对象
   * @param {Object} parent hojs实例
   */
  constructor(
    method: string,
    path: string,
    key: string,
    sourceFile: utils.ISourceResult,
    parent: any,
  ) {
    assert(method && typeof method === "string", "`method` must be string");
    assert(
      TestAgent.SUPPORT_METHOD.indexOf(method.toLowerCase()) !== -1,
      "`method` must be one of " + TestAgent.SUPPORT_METHOD,
    );
    assert(path && typeof path === "string", "`path` must be string");
    assert(path[0] === "/", '`path` must be start with "/"');
    this.options = {
      parent,
      sourceFile,
      method: method.toLowerCase(),
      path,
      takeExample: false,
      agentInput: {} as IKVObject,
    };
    this.key = key;
    this.debug = createDebug(`agent:${this.key}`);
    this.debug("new: %s %s from %s", method, path, sourceFile.absolute);
  }

  /**
   * 设置`supertest.Agent`实例
   *
   * @param {Object} agent
   */
  public setAgent(agent: Test) {
    this.options.agent = agent;
  }

  /**
   * 初始化`supertest.Agent`实例
   *
   * @param {Object} app Express实例
   */
  public initAgent(app: object) {
    let request;
    try {
      request = require("supertest");
      assert(request, "Install `supertest` first");
    } catch (err) {
      debug(err);
    }
    if (!request) {
      return;
    }
    assert(app, `express app instance could not be empty`);
    this.debug("create supertest agent");
    this.setAgent(request(app)[this.options.method](this.options.path) as Test);
  }

  /**
   * 获取测试代理
   *
   * @return {Object}
   */
  public agent(): TestAgent {
    debug("agent");
    return this;
  }

  /**
   * 对测试结果加入文档
   *
   * @param {String} name 测试名
   * @returns {Object}
   */
  public takeExample(name: string) {
    this.options.agentTestName = name;
    this.options.takeExample = true;
    return this;
  }

  public headers(data: IKVObject) {
    this.options.agentHeader = data;
    Object.keys(data).forEach((k) => this.options.agent && this.options.agent.set(k, data[k]));
    return this;
  }

  public query(data: IKVObject) {
    this.debug("query: %j", data);
    Object.assign(this.options.agentInput, data);
    this.options.agent!.query(data);
    return this;
  }

  /**
   * 输入参数
   *
   * @param {Object} data
   * @return {Object}
   */
  public input(data: IKVObject) {
    this.debug("input: %j", data);
    Object.assign(this.options.agentInput, data);
    if (
      this.options.method === "get" ||
      this.options.method === "head" ||
      this.options.method === "delete"
    ) {
      this.options.agent!.query(data);
    } else {
      this.options.agent!.send(data);
    }
    return this;
  }

  public attach(data: IKVObject) {
    this.debug("input: %j", data);
    Object.assign(this.options.agentInput, data);
    for (const i in data) {
      // TODO: use fs.ReadStream
      if (data[i] instanceof stream.Readable) {
        this.options.agent!.attach(i, data[i]);
        delete data[i];
      } else {
        this.options.agent!.field(i, data[i]);
      }
    }
    return this;
  }

  /**
   * 期望输出成功结果
   *
   * @param {Function} callback
   * @return {Promise}
   */
  public success(callback?: ICallback<any>) {
    const cb = (callback as IPromiseCallback<any>) || utils.createPromiseCallback();
    this.output((err, ret) => {
      if (err) {
        const err2 = new Error(
          `${this.key} 期望API输出成功结果，但实际输出失败结果：${inspect(err)}`,
        );
        cb(err2);
      } else {
        this.saveExample();
        cb(null, ret);
      }
    });
    return cb.promise;
  }

  /**
   * 期望输出失败结果
   *
   * @param {Function} callback
   * @return {Promise}
   */
  public error(callback?: ICallback<any>) {
    const cb = (callback as IPromiseCallback<any>) || utils.createPromiseCallback();
    this.output((err, ret) => {
      if (err) {
        this.saveExample();
        cb(null, err);
      } else {
        const err2 = new Error(
          `${this.key} 期望API输出失败结果，但实际输出成功结果：${inspect(ret)}`,
        );
        cb(err2);
      }
    });
    return cb.promise;
  }

  /**
   * 获取原始输出
   *
   * @param {Function} callback
   * @return {Promise}
   */
  public raw(callback?: ICallback<any>) {
    const cb = (callback as IPromiseCallback<any>) || utils.createPromiseCallback();
    this.output((err, ret) => {
      if (err) {
        const err2 = new Error(
          `${this.key} 期望API输出成功结果，但实际输出失败结果：${inspect(err)}`,
        );
        cb(err2);
      } else {
        this.saveExample();
        cb(null, ret);
      }
    }, true);
    return cb.promise;
  }

  private saveExample() {
    debug("Save Example", this.key, this.options.takeExample);
    if (this.options.takeExample) {
      this.options.parent.api.$schemas.get(this.key).example({
        name: this.options.agentTestName,
        path: this.options.agentPath,
        headers: this.options.agentHeader,
        input: this.options.agentInput || {},
        output: this.options.agentOutput,
      });
    }
    debug(this.options.parent.api.$schemas.get(this.key).options.examples);
  }

  /**
   * 输出结果
   *
   * @param {Function} callback
   * @param {Boolean} raw 原始输出
   * @return {Promise}
   */
  private output(callback?: ICallback<any>, raw = false): Promise<any> {
    const cb = (callback as IPromiseCallback<any>) || utils.createPromiseCallback();
    this.options.agent!.end((err: Error, res: IKVObject) => {
      this.options.agentPath = res.req.path;
      this.options.agentOutput = res.body;
      if (err) {
        return cb(err);
      }
      const formatOutputReverse =
        this.options.parent.api.formatOutputReverse || defaultFormatOutput;
      if (raw) { return cb(null, res); }
      const [err2, ret] = formatOutputReverse(res.body);
      cb(err2, ret);
    });
    return cb.promise as Promise<any>;
  }
}
