/**
 * @file API Test
 * 参考 hojs
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import * as assert from "assert";
import { TestAgent } from "../agent";
import { test as debug } from "../debug";
import API from "../index";
import { IKVObject, ISupportMethds } from "../interfaces";
import { getCallerSourceLine, getSchemaKey } from "../utils";

import { SuperTest } from "supertest";

export type IAgent = Readonly<ISupportMethds<(path: string) => TestAgent>>;

export interface ITest extends IAgent {
  readonly session: () => ITestSession;
}

export interface ITestSession extends IAgent {
  readonly $agent: SuperTest<any>;
}

export function extendTest(apiService: API) {

  const { app, config, info } = apiService.privateInfo;

  let supertest: any;
  try {
    supertest = require("supertest");
  } catch (err) {
    debug(err);
  }

  /**
   * 根据请求方法和请求路径查找对应的schema
   *
   * @param {String} method
   * @param {String} path
   * @return {Object}
   */
  function findSchema(method: string, path: string) {

    // 如果定义了 API 的 basePath，需要在测试时替换掉
    const routerPath = info.basePath ? path.replace(info.basePath, "") : path;

    const key = getSchemaKey(method, routerPath);
    debug(method, path, key);

    // 检查path无变量情况
    if (apiService.api.$schemas.get(key)) { return apiService.api.$schemas.get(key); }
    // 检查path有变量情况
    for (const s of apiService.api.$schemas.values()) {
      if (s.pathTest(method, routerPath)) { return s; }
    }
    return;
  }

  // test.get, apiService.post, ...
  function regTest(method: string) {
   return (path: string) => {

      const s = findSchema(method, path);

      if (!s || !s.key) { throw new Error(`尝试请求未注册的API：${ method } ${ path }`); }
      const a = new TestAgent(method, path, s.key, getCallerSourceLine(config.path), apiService);

      assert(app, "请先调用 setApp() 设置 exprss 实例");
      a.initAgent(app);
      return a.agent();
    };
  }

  /**
   * 创建测试会话
   *
   * @return {Object}
   */
  const session = () => {

    assert(app, "请先调用 setApp() 设置 exprss 实例");
    assert(supertest, "请先安装 supertest");
    const agent = supertest.agent(app);

    function regSession(method: string) {
      return (path: string) => {

        const s = findSchema(method, path);

        if (!s || !s.key) { throw new Error(`尝试请求未注册的API：${ method } ${ path }`); }
        const a = new TestAgent(method, path, s && s.key, s.options.sourceFile, apiService);

        a.setAgent((agent as IKVObject)[method](path));
        return a.agent();

      };
    }
    const ss: ITestSession = {
      $agent: agent,
      get: regSession("get"),
      post: regSession("post"),
      put: regSession("put"),
      delete: regSession("delete"),
      patch: regSession("patch"),
    };

    return ss;
  };

  return {
    session,
    get: regTest("get"),
    post: regTest("post"),
    put: regTest("put"),
    delete: regTest("delete"),
    patch: regTest("patch"),
  };

}
