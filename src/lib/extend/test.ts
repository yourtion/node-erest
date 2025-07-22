/**
 * @file API Test
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import { strict as assert } from "assert";
import type { SuperTest } from "supertest";
import type ERest from "..";
import type { IApiOptionInfo } from "..";
import { TestAgent } from "../agent";
import type { SUPPORT_METHODS } from "../api";
import { test as debug } from "../debug";
import { getCallerSourceLine, getSchemaKey, type ISupportMethds } from "../utils";

/** 测试Agent */
export type IAgent = Readonly<ISupportMethds<(path: string) => TestAgent>>;

export interface ITestSession extends IAgent {
  /** 原始SuperTestAgent */
  readonly $agent: SuperTest<any>;
}

export default class IAPITest {
  private erest: ERest<any>;
  private info: IApiOptionInfo;
  private app: any;
  private testPath: string;
  private supertest?: any;

  constructor(erestIns: ERest<any>, path: string) {
    this.erest = erestIns;
    const { info, app } = this.erest.privateInfo;
    this.info = info;
    this.app = app;
    this.testPath = path;
    this.supertest = require("supertest");
  }

  get get() {
    return this.buildTest("get");
  }

  get post() {
    return this.buildTest("post");
  }

  get put() {
    return this.buildTest("put");
  }

  get delete() {
    return this.buildTest("delete");
  }

  get patch() {
    return this.buildTest("patch");
  }

  /** 创建测试会话 */
  public session(): ITestSession {
    assert(this.app, "请先调用 setApp() 设置 app 实例");
    assert(this.supertest, "请先安装 supertest");

    const agent = this.supertest.agent(this.app);

    const buildSession = (method: SUPPORT_METHODS) => {
      return (path: string) => {
        const s = this.findApi(method, path);
        if (!s || !s.key) throw new Error(`尝试请求未注册的API：${method} ${path}`);

        const a = new TestAgent(method, path, s.key, s.options.sourceFile, this.erest);
        a.setAgent(agent[method](path));
        return a.agent();
      };
    };

    return {
      $agent: agent,
      get: buildSession("get"),
      post: buildSession("post"),
      put: buildSession("put"),
      delete: buildSession("delete"),
      patch: buildSession("patch"),
    };
  }

  /** 根据请求方法和请求路径查找对应的API */
  private findApi(method: SUPPORT_METHODS, path: string) {
    // 如果定义了 API 的 basePath，需要在测试时替换掉
    const routerPath = this.info.basePath ? path.replace(this.info.basePath, "") : path;

    const key = getSchemaKey(method, routerPath);
    debug(method, path, key);

    // 检查path无变量情况
    if (this.erest.api.$apis.get(key)) {
      return this.erest.api.$apis.get(key);
    }
    // 检查path有变量情况
    for (const s of this.erest.api.$apis.values()) {
      if (s.pathTest(method, routerPath)) return s;
    }
    return;
  }

  /** 生成测试方法 */
  private buildTest(method: SUPPORT_METHODS) {
    return (path: string) => {
      const s = this.findApi(method, path);
      if (!s || !s.key) {
        throw new Error(`尝试请求未注册的API：${method} ${path}`);
      }
      const a = new TestAgent(method, path, s.key, getCallerSourceLine(this.testPath), this.erest);

      assert(this.app, "请先调用 setApp() 设置 app 实例");
      a.initAgent(this.app);
      return a.agent();
    };
  }
}
