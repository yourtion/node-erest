"use strict";

/**
 * @file API Test
 * 参考 hojs
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import * as assert from "assert";
import { TestAgent } from "../agent";
import { test as debug } from "../debug";
import API from "../index";
import { getCallerSourceLine, getSchemaKey } from "../utils";

import * as supertest from "supertest";

export function extendTest(apiService: API) {

  apiService.test = {};

  /**
   * 根据请求方法和请求路径查找对应的schema
   *
   * @param {String} method
   * @param {String} path
   * @return {Object}
   */
  const findSchema = (method, path) => {

    // 如果定义了 API 的 basePath，需要在测试时替换掉
    const routerPath = apiService.info.basePath ? path.replace(apiService.info.basePath, "") : path;

    const key = getSchemaKey(method, routerPath);
    debug(method, path, key);

    // 检查path无变量情况
    if (apiService.api.$schemas.get(key)) { return apiService.api.$schemas.get(key); }
    // 检查path有变量情况
    for (const s of apiService.api.$schemas.values()) {
      if (s.pathTest(method, routerPath)) { return s; }
    }
    return;
  };

  // test.get, apiService.post, ...
  for (const method of TestAgent.SUPPORT_METHOD) {
    apiService.test[method] = (path, rawSupertest) => {

      const s = findSchema(method, path);

      assert(s, `尝试请求未注册的API：${ method } ${ path }`);
      const a = new TestAgent(method, path, s && s.key, getCallerSourceLine(apiService.config.get("api.path")), apiService);

      assert(apiService.app, "请先调用 setApp() 设置 exprss 实例");
      a.initAgent(apiService.app);
      return a.agent(rawSupertest);
    };
  }

  /**
   * 创建测试会话
   *
   * @return {Object}
   */
  apiService.test.session = () => {

    assert(apiService.app, "请先调用 setApp() 设置 exprss 实例");
    assert(supertest, "请先安装 supertest");
    const session = {
      $$agent: supertest.agent(apiService.app),
    };

    for (const method of TestAgent.SUPPORT_METHOD) {
      session[method] = (path, rawSupertest) => {

        const s = findSchema(method, path);

        assert(s, `尝试请求未注册的API：${ method } ${ path }`);
        const a = new TestAgent(method, path, s && s.key, "a", apiService);

        a.setAgent(session.$$agent[method](path));
        return a.agent(rawSupertest);

      };
    }

    return session;
  };

}
