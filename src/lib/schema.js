'use strict';

/**
 * @file API Scheme
 * @author Yourtion Guo <yourtion@gmail.com>
 */

const assert = require('assert');
const pathToRegExp = require('path-to-regexp');
const debug = require('./debug').schema;
const SUPPORT_METHOD = [ 'get', 'post', 'put', 'delete', 'patch' ];
const { getSchemaKey } = require('./utils');

const Schema = module.exports = class Schema {

  /**
   * 构造函数
   *
   * @param {String} method 请求方法
   * @param {String} path 请求路径
   * @param {Object} sourceFile 源文件路径描述对象
   */
  constructor(method, path, sourceFile) {

    assert(method && typeof method === 'string', '`method`必须是字符串类型');
    assert(Schema.SUPPORT_METHOD.indexOf(method.toLowerCase()) !== -1, '`method`必须是以下请求方法中的一个：' + Schema.SUPPORT_METHOD);
    assert(path && typeof path === 'string', '`path`必须是字符串类型');
    assert(path[0] === '/', '`path`必须以"/"开头');

    this.options = {
      sourceFile,
      method: method.toLowerCase(),
      path,
      examples: [],
      beforeHooks: [],
      afterHooks: [],
      middlewares: [],
      required: new Set(),
      requiredOneOf: new Set(),
      query: {},
      body: {},
      params: {},
      _params: {},
    };

    this.key = getSchemaKey(method, path);
    this._pathTestRegExp = pathToRegExp(path);
    this.inited = false;

    debug('new: %s %s from %s', method, path, sourceFile);
  }

  /**
   * 检查是否已经完成初始化，如果是则报错
   */
  _checkInited() {
    if (this.inited) {
      throw new Error(`${ this.key }已经完成初始化，不能再进行更改`);
    }
  }

  /**
   * 检查URL是否符合API规则
   *
   * @param {String} method
   * @param {String} path
   * @return {Boolean}
   */
  pathTest(method, path) {
    return this.options.method === method.toLowerCase() && this._pathTestRegExp.test(path);
  }

  /**
   * API标题
   *
   * @param {String} title
   * @return {Object}
   */
  title(title) {
    this._checkInited();
    assert(typeof title === 'string', '`title`必须是字符串类型');
    this.options.title = title;
    return this;
  }

  /**
   * API描述
   *
   * @param {String} description
   * @return {Object}
   */
  description(description) {
    this._checkInited();
    assert(typeof description === 'string', '`description`必须是字符串类型');
    this.options.description = description;
    return this;
  }

  /**
   * API分组
   *
   * @param {String} group
   * @return {Object}
   */
  group(group) {
    this._checkInited();
    assert(typeof group === 'string', '`group`必须是字符串类型');
    this.options.group = group;
    return this;
  }

  /**
   * API使用例子
   *
   * @param {Object} example
   *   - {Object} input 输入参数
   *   - {Object} output 输出结果
   * @return {Object}
   */
  example(example) {
    // this._checkInited();
    assert(example.input && typeof example.input === 'object', '`input`必须是一个对象');
    assert(example.output && typeof example.output === 'object', '`output`必须是一个对象');
    this._addExample(example);
    return this;
  }

  _addExample(example) {
    this.options.examples.push(example);
  }

  /**
   * 输入参数
   *
   * @param {String} name 参数名称
   * @param {Object} options
   *   - {String} type 参数类型
   *   - {Boolean} format 是否格式化，默认true
   *   - {Mixed} default 默认值，默认无
   *   - {String} comment 备注信息（用于文档生成）
   * @param {String} place 位置（body、query、params）
   */
  _params(name, options = {}, place) {

    this._checkInited();

    assert(name && typeof name === 'string', '`name`必须是字符串类型');
    assert(place && [ 'query', 'body', 'params' ].indexOf(place) > -1, '`place` 必须是 "query" "body", "param"');
    assert(name.indexOf(' ') === -1, '`name`不能包含空格');
    assert(name[0] !== '$', '`name`不能以"$"开头');
    assert(!(name in this.options._params), `参数 ${ name } 已存在`);

    assert(options && (typeof options === 'string' || typeof options === 'object'));
    // if (typeof options === 'string') options = { type: options, format: true };

    if (!('format' in options)) options.format = true;

    assert(options.type, `type必须存在：${ place }:${ name } -> ${ options.type }`);
    assert(/^[A-Z]/.test(options.type[0]), `type必须以大写字母开头：${ options.type }`);

    if(options.required) this.options.required.add(name);

    this.options._params[name] = options;
    this.options[place][name] = options;
  }

  /**
   * Body 参数
   *
   * @param {Array<Object>} obj
   *   - {String} type 参数类型
   *   - {Boolean} format 是否格式化，默认true
   *   - {Mixed} default 默认值，默认无
   *   - {String} comment 备注信息（用于文档生成）
   * @return {Object}
   */
  body(obj) {
    for(const key of Object.keys(obj)) {
      const o = obj[key];
      this._params(key, o, 'body');
    }
    return this;
  }

  /**
   * Query 参数
   *
   * @param {Array<Object>} obj
   *   - {String} type 参数类型
   *   - {Boolean} format 是否格式化，默认true
   *   - {Mixed} default 默认值，默认无
   *   - {String} comment 备注信息（用于文档生成）
   * @return {Object}
   */
  query(obj) {
    for(const key of Object.keys(obj)) {
      const o = obj[key];
      this._params(key, o, 'query');
    }
    return this;
  }

  /**
   * Param 参数
   *
   * @param {Array<Object>} obj
   *   - {String} type 参数类型
   *   - {Boolean} format 是否格式化，默认true
   *   - {Mixed} default 默认值，默认无
   *   - {String} comment 备注信息（用于文档生成）
   * @return {Object}
   */
  param(obj) {
    for(const key of Object.keys(obj)) {
      const o = obj[key];
      this._params(key, o, 'params');
    }
    return this;
  }

  /**
   * 必填参数
   *
   * @param {Array} list 参数名列表
   * @return {Object}
   */
  required(list) {
    this._checkInited();
    for (const item of list) {
      assert(typeof item === 'string', '`name`必须是字符串类型');
      this.options.required.add(item);
    }
    return this;
  }

  /**
   * 多选一必填参数
   *
   * @param {Array} list 参数名列表
   * @return {Object}
   */
  requiredOneOf(list) {
    this._checkInited();
    for (const item of list) {
      assert(typeof item === 'string', '`name`必须是字符串类型');
    }
    this.options.requiredOneOf.add(list);
    return this;
  }

  /**
   * 中间件
   *
   * @param {Function} middleware
   * @return {Object}
   */
  middlewares(...list) {
    this._checkInited();
    for(const mid of list) {
      assert(typeof mid === 'function', '中间件必须是Function类型');
      this.options.middlewares.push(mid);
    }
    return this;
  }

  /**
   * 注册执行之前的钩子
   *
   * @param {String} name
   * @return {Object}
   */
  before(...list) {
    this._checkInited();
    for (const name of list) {
      assert(typeof name === 'string', '钩子名称必须是字符串类型');
      this.options.beforeHooks.push(name);
    }
    return this;
  }

  /**
   * 注册执行之后的钩子
   *
   * @param {String} name
   * @return {Object}
   */
  after(...list) {
    this._checkInited();
    for (const name of list) {
      assert(typeof name === 'string', '钩子名称必须是字符串类型');
      this.options.afterHooks.push(name);
    }
    return this;
  }

  /**
   * 注册处理函数
   *
   * @param {Function} fn 函数格式：`async function (params) {}`
   * @return {Object}
   */
  register(fn) {
    this._checkInited();
    assert(typeof fn === 'function', '处理函数必须是一个函数类型');
    this.options.handler = fn;
    return this;
  }

  init(parent) {
    this._checkInited();

    if (!this.options.env) {
      assert(this.options.handler, `请为 API ${ this.key } 注册一个处理函数`);
    }

    assert(this.options.group, `请为 API ${ this.key } 选择一个分组`);
    assert(this.options.group in parent.groups, `请先配置 ${ this.options.group } 类型`);

    // 初始化时参数类型检查
    for (const name in this.options._params) {
      const options = this.options._params[name];
      const typeName = options.type;
      const type = parent.type.get(typeName);
      assert(type && type.checker, `please register type ${ typeName }`);
      if (type.isParamsRequire && options.params === undefined) throw new Error(`${ typeName } is require a params`);
      if (options.params) {
        assert(type.paramsChecker(options.params), `test type params failed`);
        try {
          options._paramsJSON = JSON.stringify(options.params);
        } catch (err) {
          throw new Error(`cannot JSON.stringify(options.params) for param ${ name }`);
        }
      }
    }

    // 初始化时检查before钩子是否正确
    for (const name of this.options.beforeHooks) {
      assert(parent.hook.get(name), `初始化${ this.key }时出错：钩子"${ name }"不存在`);
    }

    // 初始化时检查after钩子是否正确
    for (const name of this.options.afterHooks) {
      assert(parent.hook.get(name), `初始化${ this.key }时出错：钩子"${ name }"不存在`);
    }

    this.inited = true;
  }

};

/* 支持的HTTP请求方法 */
Schema.SUPPORT_METHOD = SUPPORT_METHOD;
