'use strict';

/**
 * @file API Scheme
 * @author Yourtion Guo <yourtion@gmail.com>
 */

const assert = require('assert');
const debug = require('./debug').core;
const TypeManager = require('./manager/type');
const registerDefaultTypes = require('./default/types');
const Schema = require('./schema');
const { getCallerSourceLine } = require('./utils');
const paramChecker = require('./params');
const extendDocs = require('./extend/docs');
const extendTest = require('./extend/test');

const missingParameter = (msg) => { return new Error(`missing required parameter ${ msg }`); };
const invalidParameter = (msg) => { return new Error(`incorrect parameter ${ msg }`); };
const internalError = (msg) => { return new Error(`internal error ${ msg }`); };

module.exports = class API {

  /**
   * Creates an instance of API.
   * @param {Objcet} [options={}] 
   *   - {Object} info 信息
   *   - {Object} groups 分组
   *   - {String} path 路由文件所在路径
   *   - {Object} router 路由
   *   - {Object} errors 错误信息
   *   - {Function} missingParameterError 缺少参数错误生成方法
   *   - {Function} invalidParameterError 参数错误生成方法
   *   - {Function} invalidParameterError 内部错误生成方法
   */
  constructor(options = {}) {
    this.utils = require('./utils');
    this.info = options.info || {};
    this.api = {};
    this.api.$schemas = {};
    this.api.beforeHooks = [];
    this.api.afterHooks = [];
    this.config = {
      path: options.path || process.cwd(),
    };
    this.error = {
      missingParameter: options.missingParameterError || missingParameter,
      invalidParameter: options.invalidParameterError || invalidParameter,
      internalError: options.internalError || internalError,
    };
    this.router = options.router;
    // 参数类型管理
    this.type = new TypeManager(this);
    this.errors = options.errors;
    registerDefaultTypes.call(this, this.type);
    this.groups = options.groups || {};
    this._register();
  }

  initTest(app) {
    if(this.app && this.test) return;
    debug('initTest');
    this.app = app;
    extendTest.call(this);
    extendDocs.call(this);
    this.api.docs.markdown();
    this.api.docs.saveOnExit(process.cwd() + '/docs/');
  }

  setFormatOutput(fn) {
    this.api.formatOutputReverse = fn;
  }

  setDocOutputForamt(fn) {
    this.api.docOutputForamt = fn;
  }

  _register() {
    /**
     * 注册API
     *
     * @param {String} method HTTP请求方法
     * @param {String} path 请求路径
     * @return {Object}
     */
    const register = (method, path) => {
      const s = new Schema(method, path, getCallerSourceLine(this.config['path']));
      const s2 = this.api.$schemas[s.key];
      assert(!s2, `尝试注册API：${ s.key }（所在文件：${ s.options.sourceFile.absolute }）失败，因为该API已在文件${ s2 && s2.options.sourceFile.absolute }中注册过`);
      
      this.api.$schemas[s.key] = s;
      return s;
    };

    for (const method of Schema.SUPPORT_METHOD) {
      this.api[method] = (path) => {
        return register(method, path, true);
      };
    }
  }

  /**
   * 绑定路由
   * 
   * @param {Object} [router=this.router] 路由
   */
  bindRouter(router = this.router) {
    for(const key of Object.keys(this.api.$schemas)) {
      debug('bind router' + key);
      const schema = this.api.$schemas[key];
      schema.init(this);
      router[schema.options.method].bind(router)(
        schema.options.path,
        ...this.api.beforeHooks,
        ...schema.options.beforeHooks,
        paramChecker(this, schema),
        ...schema.options.middlewares,
        schema.options.handler,
        ...schema.options.afterHooks,
        ...this.api.afterHooks
      );
    }
  }

  genDocs(path, onExit = true) {
    extendDocs.call(this);
    this.api.docs.markdown();
    const savePath = path || process.cwd() + '/docs/';
    if (onExit) {
      this.api.docs.saveOnExit(savePath);
    } else {
      this.api.docs.save(savePath);
    }
  }
  
};
