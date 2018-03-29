"use strict";

/**
 * @file API Scheme
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import * as assert from "assert";
import * as pathToRegExp from "path-to-regexp";
import { schema as debug } from "./debug";
import API from "./index";
import { IKVObject } from "./interfaces";
import { getSchemaKey, ISourceResult } from "./utils";

export interface IExample {
  input: object;
  output: object;
}

export interface IParamsOption {
  format?: any;
  type?: string;
  required?: boolean;
  params: string;
  _paramsJSON: string;
  enum?: string[];
}

export type IHandler<T, U> = (req: T, res: U, next?: any) => any;

export interface ISchemaOption<T, U> extends IKVObject {
  description?: string;
  group?: string;
  format?: boolean;
  title?: string;
  env?: boolean;
  handler?: IHandler<T, U>;
  sourceFile: ISourceResult;
  method: string;
  path: string;
  examples: IExample[];
  beforeHooks: Set<IHandler<T, U>>;
  afterHooks: Set<IHandler<T, U>>;
  middlewares: Set<IHandler<T, U>>;
  required: Set<string>;
  requiredOneOf: string[][];
  query: object;
  body: object;
  params: IKVObject;
  _params: Map<string, IParamsOption>;
  schema?: object;
}

export class Schema<T, U> {
  public static SUPPORT_METHOD = ["get", "post", "put", "delete", "patch"];
  public key: string;
  public pathTestRegExp: RegExp;
  public inited: boolean;
  public options: ISchemaOption<T, U>;
  /**
   * 构造函数
   *
   * @param {String} method 请求方法
   * @param {String} path 请求路径
   * @param {Object} sourceFile 源文件路径描述对象
   */
  constructor(method: string, path: any, sourceFile: ISourceResult) {
    assert(method && typeof method === "string", "`method`必须是字符串类型");
    assert(
      Schema.SUPPORT_METHOD.indexOf(method.toLowerCase()) !== -1,
      "`method`必须是以下请求方法中的一个：" + Schema.SUPPORT_METHOD,
    );
    assert(path && typeof path === "string", "`path`必须是字符串类型");
    assert(path[0] === "/", '`path`必须以"/"开头');

    this.options = {
      sourceFile,
      method: method.toLowerCase(),
      path,
      examples: [],
      beforeHooks: new Set(),
      afterHooks: new Set(),
      middlewares: new Set(),
      required: new Set(),
      requiredOneOf: [],
      query: {},
      body: {},
      params: {},
      _params: new Map(),
    };

    this.key = getSchemaKey(method, path);
    this.pathTestRegExp = pathToRegExp(path);
    this.inited = false;

    debug("new: %s %s from %s", method, path, sourceFile);
  }

  /**
   * 检查URL是否符合API规则
   *
   * @param {String} method
   * @param {String} path
   * @return {Boolean}
   */
  public pathTest(method: string, path: string) {
    return this.options.method === method.toLowerCase() && this.pathTestRegExp.test(path);
  }

  /**
   * API标题
   *
   * @param {String} title
   * @return {Object}
   */
  public title(title: string) {
    this._checkInited();
    assert(typeof title === "string", "`title`必须是字符串类型");
    this.options.title = title;
    return this;
  }

  /**
   * API描述
   *
   * @param {String} description
   * @return {Object}
   */
  public description(description: string) {
    this._checkInited();
    assert(typeof description === "string", "`description`必须是字符串类型");
    this.options.description = description;
    return this;
  }

  /**
   * API分组
   *
   * @param {String} group
   * @return {Object}
   */
  public group(group: string) {
    this._checkInited();
    assert(typeof group === "string", "`group`必须是字符串类型");
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
  public example(example: IExample) {
    // this._checkInited();
    assert(example.input && typeof example.input === "object", "`input`必须是一个对象");
    assert(example.output && typeof example.output === "object", "`output`必须是一个对象");
    this._addExample(example);
    return this;
  }

  /**
   * 输出结果对象
   *
   * @param {Object} schema 输出结果对象
   * @return {Object}
   */
  public schema(schema: object) {
    assert(typeof schema === "object", "`schema`必须是一个对象");
    this.options.schema = schema;
    return this;
  }

  /**
   * Body 参数
   *
   * @param {IKVObject} obj
   *   - {String} type 参数类型
   *   - {Boolean} format 是否格式化，默认true
   *   - {Mixed} default 默认值，默认无
   *   - {String} comment 备注信息（用于文档生成）
   * @return {Object}
   */
  public body(obj: IKVObject) {
    for (const key of Object.keys(obj)) {
      const o = obj[key];
      this._params(key, o, "body");
    }
    return this;
  }

  /**
   * Query 参数
   *
   * @param {IKVObject} obj
   *   - {String} type 参数类型
   *   - {Boolean} format 是否格式化，默认true
   *   - {Mixed} default 默认值，默认无
   *   - {String} comment 备注信息（用于文档生成）
   * @return {Object}
   */
  public query(obj: IKVObject) {
    for (const key of Object.keys(obj)) {
      const o = obj[key];
      this._params(key, o, "query");
    }
    return this;
  }

  /**
   * Param 参数
   *
   * @param {IKVObject} obj
   *   - {String} type 参数类型
   *   - {Boolean} format 是否格式化，默认true
   *   - {Mixed} default 默认值，默认无
   *   - {String} comment 备注信息（用于文档生成）
   * @return {Object}
   */
  public param(obj: IKVObject) {
    for (const key of Object.keys(obj)) {
      const o = obj[key];
      this._params(key, o, "params");
    }
    return this;
  }

  /**
   * 必填参数
   *
   * @param {Array} list 参数名列表
   * @return {Object}
   */
  public required(list: string[]) {
    this._checkInited();
    for (const item of list) {
      assert(typeof item === "string", "`name`必须是字符串类型");
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
  public requiredOneOf(list: string[]) {
    this._checkInited();
    for (const item of list) {
      assert(typeof item === "string", "`name`必须是字符串类型");
    }
    this.options.requiredOneOf.push(list);
    return this;
  }

  /**
   * 中间件
   *
   * @param {Function} middleware
   * @return {Object}
   */
  public middlewares(...list: Array<IHandler<T, U>>) {
    this._checkInited();
    for (const mid of list) {
      assert(typeof mid === "function", "中间件必须是Function类型");
      this.options.middlewares.add(mid);
    }
    return this;
  }

  /**
   * 注册执行之前的钩子
   *
   * @param {Function} name
   * @return {Object}
   */
  public before(...list: Array<IHandler<T, U>>) {
    this._checkInited();
    for (const name of list) {
      assert(typeof name === "function", "钩子名称必须是Function类型");
      this.options.beforeHooks.add(name);
    }
    return this;
  }

  /**
   * 注册执行之后的钩子
   *
   * @param {Function} name
   * @return {Object}
   */
  public after(...list: Array<IHandler<T, U>>) {
    this._checkInited();
    for (const name of list) {
      assert(typeof name === "function", "钩子名称必须是Function类型");
      this.options.afterHooks.add(name);
    }
    return this;
  }

  /**
   * 注册处理函数
   *
   * @param {Function} fn 函数格式：`async function (params) {}`
   * @return {Object}
   */
  public register(fn: IHandler<T, U>) {
    this._checkInited();
    assert(typeof fn === "function", "处理函数必须是一个函数类型");
    this.options.handler = fn;
    return this;
  }

  public init(parent: API) {
    this._checkInited();

    if (!this.options.env) {
      assert(this.options.handler, `请为 API ${this.key} 注册一个处理函数`);
    }

    assert(this.options.group, `请为 API ${this.key} 选择一个分组`);
    assert(
      this.options.group && this.options.group in parent.groups,
      `请先配置 ${this.options.group} 类型`,
    );

    // 初始化时参数类型检查
    for (const [name, options] of this.options._params) {
      const typeName = options.type;
      const type = parent.type.get(typeName!);
      assert(type && type.checker, `please register type ${typeName}`);
      if (type!.isParamsRequire && options.params === undefined) {
        throw new Error(`${typeName} is require a params`);
      }
      if (options.params) {
        assert(type!.paramsChecker!(options.params), `test type params failed`);
        try {
          options._paramsJSON = JSON.stringify(options.params);
        } catch (err) {
          throw new Error(`cannot JSON.stringify(options.params) for param ${name}`);
        }
      }
    }

    this.inited = true;
  }

  /**
   * 检查是否已经完成初始化，如果是则报错
   */
  private _checkInited() {
    if (this.inited) {
      throw new Error(`${this.key}已经完成初始化，不能再进行更改`);
    }
  }

  private _addExample(example: IExample) {
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
  private _params(name: string, options: IParamsOption, place: string) {
    this._checkInited();

    assert(name && typeof name === "string", "`name`必须是字符串类型");
    assert(
      place && ["query", "body", "params"].indexOf(place) > -1,
      '`place` 必须是 "query" "body", "param"',
    );
    assert(name.indexOf(" ") === -1, "`name`不能包含空格");
    assert(name[0] !== "$", '`name`不能以"$"开头');
    assert(!(name in this.options._params), `参数 ${name} 已存在`);

    assert(options && (typeof options === "string" || typeof options === "object"));
    // if (typeof options === 'string') options = { type: options, format: true };

    if (!("format" in options)) {
      options.format = true;
    }

    assert(options.type, `type必须存在：${place}:${name} -> ${options.type}`);
    assert(
      options.type && /^[A-Z]/.test(options.type[0]),
      `type必须以大写字母开头：${options.type}`,
    );

    if (options.required) {
      this.options.required.add(name);
    }

    this.options._params.set(name, options);
    this.options[place][name] = options;
  }
}
