'use strict';

/**
 * @file API Test
 * 参考 hojs
 * @author Yourtion Guo <yourtion@gmail.com>
 */

const assert = require('assert');
const { getCallerSourceLine, getSchemaKey } = require('../utils');
const debug = require('../debug').test;
const TestAgent = require('../agent');

let supertest;
try {
  supertest = require('supertest');
} catch (error) {
  debug(error);
}

module.exports = function extendTest() {

  this.test = {};

  /**
   * 根据请求方法和请求路径查找对应的schema
   *
   * @param {String} method
   * @param {String} path
   * @return {Object}
   */
  const findSchema = (method, path) => {

    // 如果定义了 API 的 basePath，需要在测试时替换掉
    const routerPath = this.info.basePath ? path.replace(this.info.basePath, '') : path;

    const key = getSchemaKey(method, routerPath);
    debug(method, path, key);

    // 检查path无变量情况
    if (this.api.$schemas[key]) return this.api.$schemas[key];
    // 检查path有变量情况
    for (const key in this.api.$schemas) {
      const s = this.api.$schemas[key];
      if (s.pathTest(method, routerPath)) {
        return s;
      }
    }
  };

  // test.get, this.post, ...
  for (const method of TestAgent.SUPPORT_METHOD) {
    this.test[method] = (path, rawSupertest) => {

      const s = findSchema(method, path);
      
      assert(s, `尝试请求未注册的API：${ method } ${ path }`);
      const a = new TestAgent(method, path, s.key, getCallerSourceLine(this.config.get('api.path')), this);
      
      assert(this.app, '请先调用 setApp() 设置 exprss 实例');
      a.initAgent(this.app);
      return a.agent(rawSupertest);
    };
  }

  /**
   * 创建测试会话
   *
   * @return {Object}
   */
  this.test.session = () => {

    const session = {};
    assert(this.app, '请先调用 setApp() 设置 exprss 实例');
    assert(supertest, '请先安装 supertest');
    session.$$agent = supertest.agent(this.app);

    for (const method of TestAgent.SUPPORT_METHOD) {
      session[method] = (path, rawSupertest) => {

        const s = findSchema(method, path);
        
        assert(s, `尝试请求未注册的API：${ method } ${ path }`);
        const a = new TestAgent(method, path, s.key, 'a', this);

        a.setAgent(session.$$agent[method](path));
        return a.agent(rawSupertest);

      };
    }

    return session;
  };

};
