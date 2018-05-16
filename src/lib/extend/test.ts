/**
 * @file API Test
 * 参考 hojs
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import * as assert from "assert";
import { TestAgent } from "../agent";
import { test as debug } from "../debug";
import API, { IAPIConfig, IApiOptionInfo } from "../index";
import { IKVObject, ISupportMethds } from "../interfaces";
import { getCallerSourceLine, getSchemaKey } from "../utils";

import { SuperTest } from "supertest";

export type IAgent = Readonly<ISupportMethds<(path: string) => TestAgent>>;

export interface ITestSession extends IAgent {
  readonly $agent: SuperTest<any>;
}

export default class IAPITest {
  private parent: API;
  private info: IApiOptionInfo;
  private app: any;
  private supertest?: any;
  private config: IAPIConfig;

  constructor(apiService: API) {
    this.parent = apiService;
    const { info, app, config } = this.parent.privateInfo;
    this.info = info;
    this.app = app;
    this.config = config;
    this.supertest = require("supertest");
  }

  get get() {
    return this.regTest("get");
  }

  get post() {
    return this.regTest("post");
  }

  get put() {
    return this.regTest("put");
  }

  get delete() {
    return this.regTest("delete");
  }

  get patch() {
    return this.regTest("patch");
  }

  /**
   * 创建测试会话
   */
  public session() {
    assert(this.app, "请先调用 setApp() 设置 exprss 实例");
    assert(this.supertest, "请先安装 supertest");
    const agent = this.supertest.agent(this.app);

    const regSession = (method: string) => {
      return (path: string) => {
        const s = this.findSchema(method, path);

        if (!s || !s.key) {
          throw new Error(`尝试请求未注册的API：${method} ${path}`);
        }
        const a = new TestAgent(method, path, s && s.key, s.options.sourceFile, this.parent);

        a.setAgent((agent as IKVObject)[method](path));
        return a.agent();
      };
    };
    const ss: ITestSession = {
      $agent: agent,
      get: regSession("get"),
      post: regSession("post"),
      put: regSession("put"),
      delete: regSession("delete"),
      patch: regSession("patch"),
    };

    return ss;
  }

  /**
   * 根据请求方法和请求路径查找对应的schema
   */
  private findSchema(method: string, path: string) {
    // 如果定义了 API 的 basePath，需要在测试时替换掉
    const routerPath = this.info.basePath ? path.replace(this.info.basePath, "") : path;

    const key = getSchemaKey(method, routerPath);
    debug(method, path, key);

    // 检查path无变量情况
    if (this.parent.api.$schemas.get(key)) {
      return this.parent.api.$schemas.get(key);
    }
    // 检查path有变量情况
    for (const s of this.parent.api.$schemas.values()) {
      if (s.pathTest(method, routerPath)) {
        return s;
      }
    }
    return;
  }

  private regTest(method: string) {
    return (path: string) => {
      const s = this.findSchema(method, path);
      if (!s || !s.key) {
        throw new Error(`尝试请求未注册的API：${method} ${path}`);
      }
      const a = new TestAgent(method, path, s.key, getCallerSourceLine(this.config.path), this.parent);

      assert(this.app, "请先调用 setApp() 设置 exprss 实例");
      a.initAgent(this.app);
      return a.agent();
    };
  }
}
