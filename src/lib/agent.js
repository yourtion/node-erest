'use strict';

/**
 * @file API Agent
 * 参考 hojs
 * @author Yourtion Guo <yourtion@gmail.com>
 */

const fs = require('fs');
const util = require('util');
const assert = require('assert');
const utils = require('./utils');
const createDebug = require('./debug').create;
const debug = require('./debug').test;

let request;
try {
  request = require('supertest');
} catch (error) {
  debug(error);
}


/* 支持的HTTP请求方法 */
const SUPPORT_METHOD = [ 'get', 'post', 'put', 'delete', 'patch' ];

/* 输出结果断言错误 */
const AssertionError = utils.customError('AssertionError', { type: 'api_output_error' });

/**
 * 返回对象结构字符串
 *
 * @param {Object} obj
 * @return {String}
 */
function inspect(obj) {
  return util.inspect(obj, {
    depth: 5,
    colors: true,
  });
}

/**
 * 测试代理类
 */
const TestAgent = module.exports = class TestAgent {

  /**
   * 构造函数
   *
   * @param {String} method HTTP请求方法
   * @param {String} path 请求路径
   * @param {String} key 键名：`method path`
   * @param {Object} sourceFile 源文件路径描述对象
   * @param {Object} parent hojs实例
   */
  constructor(method, path, key, sourceFile, parent) {
    assert(method && typeof method === 'string', '`method` must be string');
    assert(TestAgent.SUPPORT_METHOD.indexOf(method.toLowerCase()) !== -1, '`method` must be one of ' + TestAgent.SUPPORT_METHOD);
    assert(path && typeof path === 'string', '`path` must be string');
    assert(path[0] === '/', '`path` must be start with "/"');
    this.options = {
      parent,
      sourceFile,
      method: method.toLowerCase(),
      path,
      agent: null,
    };
    this.key = key;
    this._extendsOutput();
    this.debug = createDebug(`agent:${ this.key }`);
    this.debug('new: %s %s from %s', method, path, sourceFile.absolute);
  }

  /**
   * 设置`supertest.Agent`实例
   *
   * @param {Object} agent
   */
  setAgent(agent) {
    this.options.agent = agent;
  }

  /**
   * 初始化`supertest.Agent`实例
   *
   * @param {Object} app Express实例
   */
  initAgent(app) {
    assert(app, `express app instance could not be empty`);
    assert(request, 'Install `supertest` first');
    this.debug('create supertest agent');
    this.setAgent(request(app)[this.options.method](this.options.path));
  }

  /**
   * 获取测试代理
   *
   * @param {Boolean} rawSupertest `true`表示返回`supertest.Agent`实例，`false`返回`TestAgent`实例
   * @return {Object}
   */
  agent(rawSupertest = false) {
    debug('agent: rawSupertest=%s', rawSupertest);
    if (rawSupertest) {
      return this.options.agent;
    }
    return this;
  }

  /**
   * 对测试结果加入文档
   * 
   * @param {String} name 测试名
   * @returns {Object}
   */
  takeExample(name){
    this.options.agentTestName = name;
    this.options.takeExample = true;
    return this;
  }

  _saveExample() {
    debug('Save Example', this.key, this.options.takeExample);
    if(this.options.takeExample) {
      this.options.parent.api.$schemas[this.key].example({
        name: this.options.agentTestName,
        path: this.options.agentPath,
        headers: this.options.agentHeader,
        input: this.options.agentInput || {},
        output: this.options.agentOutput,
      });
    }
    debug(this.options.parent.api.$schemas[this.key].options.examples);
  }

  headers(data) {
    this.options.agentHeader = data;
    Object.keys(data).forEach(k => this.options.agent.set(k, data[k]));
    return this;
  }

  /**
   * 输入参数
   *
   * @param {Object} data
   * @return {Object}
   */
  input(data) {
    this.debug('input: %j', data);
    this.options.agentInput = data;
    if (this.options.method === 'get' || this.options.method === 'head' || this.options.method === 'delete') {
      this.options.agent.query(data);
    } else {
      for (const i in data) {
        if (data[i] instanceof fs.ReadStream) {
          this.options.agent.attach(i, data[i]);
          delete data[i];
        }
      }
      this.options.agent.send(data);
    }
    return this;
  }

  /**
   * 输出结果
   *
   * @param {Function} callback
   * @return {Promise}
   */
  output(callback) {
    const self = this;
    const cb = callback || utils.createPromiseCallback();
    self.options.agent.end((err, res) => {
      self.options.agentPath = res.req.path;
      self.options.agentOutput = res.body;
      if (err) {
        return cb(err);
      }
      const formatOutputReverse = self.options.parent.api.formatOutputReverse;
      const [ err2, ret ] = formatOutputReverse(res.body);
      cb(err2, ret);
    });
    return cb.promise;
  }

  _extendsOutput() {

    /**
     * 期望输出成功结果
     *
     * @param {Function} callback
     * @return {Promise}
     */
    this.output.success = (callback) => {
      const cb = callback || utils.createPromiseCallback();
      this.output((err, ret) => {
        if (err) {
          const err2 = new AssertionError(`${ this.key } 期望API输出成功结果，但实际输出失败结果：${ inspect(err) }`);
          cb(err2);
        } else {
          this._saveExample();
          cb(null, ret);
        }
      });
      return cb.promise;
    };

    /**
     * 期望输出失败结果
     *
     * @param {Function} callback
     * @return {Promise}
     */
    this.output.error = (callback) => {
      const cb = callback || utils.createPromiseCallback();
      this.output((err, ret) => {
        if (err) {
          this._saveExample();
          cb(null, err);
        } else {
          const err2 = new AssertionError(`${ this.key } 期望API输出失败结果，但实际输出成功结果：${ inspect(ret) }`);
          cb(err2);
        }
      });
      return cb.promise;
    };

  }

};

/* 支持的HTTP请求方法 */
TestAgent.SUPPORT_METHOD = SUPPORT_METHOD;
