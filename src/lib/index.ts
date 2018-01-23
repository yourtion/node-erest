"use strict";

/**
 * @file API Scheme
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import * as assert from "assert";
import {core as debug } from "./debug";
import { defaultTypes } from "./default/types";
import { extendDocs } from "./extend/docs";
import { extendTest } from "./extend/test";
import { IKVObject } from "./interfaces";
import { TypeManager  } from "./manager/type";
import { apiCheckParams, paramsChecker, schemaChecker } from "./params";
import { ISchemaOption, Schema } from "./schema";
import { getCallerSourceLine } from "./utils";

const missingParameter = (msg: string) => new Error(`missing required parameter ${ msg }`);
const invalidParameter = (msg: string) => new Error(`incorrect parameter ${ msg }`);
const internalError = (msg: string) => new Error(`internal error ${ msg }`);

export interface IApiFlag {
  saveApiInputOutput: boolean;
}

export interface IApiInfo extends IKVObject {
  $schemas: Map<string, Schema>;
  beforeHooks: any[];
  afterHooks: any[];
  docs?: any;
  test?: any;
  formatOutputReverse?: any;
  docOutputForamt?: any;
  $flag: IApiFlag;
}

export interface IApiOption {
  info?: any;
  path?: any;
  missingParameterError?: any;
  invalidParameterError?: any;
  internalError?: any;
  router?: any;
  errors?: any;
  groups?: any;
  docs?: IDocOptions;
}

export interface IDocOptions {
  wiki?: string|boolean;
  index?: string|boolean;
  home?: string|boolean;
  swagger?: string|boolean;
  json?: string|boolean;
  all?: string|boolean;
}

export default class API {

  public app: any;
  public api: IApiInfo;
  public utils: any;
  public info: any;
  public config: any;
  public error: any;
  public router: any;
  public type: any;
  public errors: any;
  public groups: any;
  public test: any;
  public docsOptions: IDocOptions;

  /**
   * Creates an instance of API.
   * @param {IApiOption} [options={}]
   *   - {Object} info 信息
   *   - {Object} groups 分组
   *   - {String} path 路由文件所在路径
   *   - {Object} router 路由
   *   - {Object} errors 错误信息
   *   - {Function} missingParameterError 缺少参数错误生成方法
   *   - {Function} invalidParameterError 参数错误生成方法
   *   - {Function} invalidParameterError 内部错误生成方法
   */
  constructor(options: IApiOption) {
    this.utils = require("./utils");
    this.info = options.info || {};
    this.api = {
      $schemas: new Map(),
      beforeHooks: [],
      afterHooks: [],
      $flag: {
        saveApiInputOutput: false,
      },
    };
    this.config = {
      path: options.path || process.cwd(),
    };
    this.error = {
      missingParameter: options.missingParameterError || missingParameter,
      invalidParameter: options.invalidParameterError || invalidParameter,
      internalError: options.internalError || internalError,
    };
    this.docsOptions = {
      wiki: options.docs && options.docs.wiki && options.docs.wiki !== undefined ? options.docs.wiki : true,
      index: options.docs && options.docs.index && options.docs.index !== undefined ? options.docs.index : false,
      home: options.docs && options.docs.home && options.docs.home !== undefined ? options.docs.home : true,
      swagger: options.docs && options.docs.swagger && options.docs.swagger !== undefined ? options.docs.swagger : false,
      json: options.docs && options.docs.json && options.docs.json !== undefined ? options.docs.json : false,
      all: options.docs && options.docs.all && options.docs.all !== undefined ? options.docs.all : false,
    };
    this.router = options.router;
    // 参数类型管理
    this.type = new TypeManager(this);
    this.errors = options.errors;
    defaultTypes.call(this, this.type);
    this.groups = options.groups || {};
    this._register();
  }

  public initTest(app: any) {
    if (this.app && this.test) { return; }
    debug("initTest");
    this.app = app;
    extendTest(this);
    extendDocs(this);
    this.api.docs.markdown();
    this.api.docs.saveOnExit(process.cwd() + "/docs/");
  }

  public setFormatOutput(fn: any) {
    this.api.formatOutputReverse = fn;
  }

  public setDocOutputForamt(fn: any) {
    this.api.docOutputForamt = fn;
  }

  public paramsChecker() {
    return (name: string, value: any, schema: ISchemaOption) => paramsChecker(this, name, value, schema);
  }

  public schemaChecker() {
    return (data: IKVObject, schema: ISchemaOption[], requiredOneOf: string[] = []) => schemaChecker(this, data, schema, requiredOneOf);
  }

  public _register() {
    /**
     * 注册API
     *
     * @param {String} method HTTP请求方法
     * @param {String} path 请求路径
     * @return {Object}
     */
    const register = (method: string, path: string) => {
      const s = new Schema(method, path, getCallerSourceLine(this.config.path));
      const s2 = this.api.$schemas.get(s.key);
      assert(!s2, `尝试注册API：${ s.key }（所在文件：${ s.options.sourceFile.absolute }）失败，因为该API已在文件${ s2 && s2.options.sourceFile.absolute }中注册过`);

      this.api.$schemas.set(s.key, s);
      return s;
    };

    for (const method of Schema.SUPPORT_METHOD) {
      this.api[method] = (path: string) => {
        return register(method, path);
      };
    }
  }

  /**
   * 绑定路由
   * （加载顺序：beforeHooks -> apiCheckParams -> middlewares -> handler -> afterHooks ）
   *
   * @param {Object} [router=this.router] 路由
   */
  public bindRouter(router = this.router) {
    for (const [key, schema] of this.api.$schemas.entries()) {
      debug("bind router" + key);
      if (!schema) { continue; }
      schema.init(this);
      router[schema.options.method].bind(router)(
        schema.options.path,
        ...this.api.beforeHooks,
        ...schema.options.beforeHooks,
        apiCheckParams(this, schema),
        ...schema.options.middlewares,
        schema.options.handler,
        ...schema.options.afterHooks,
        ...this.api.afterHooks,
      );
    }
  }

  public genDocs(path: string, onExit = true) {
    extendDocs(this);
    this.api.docs.genDocs();
    const savePath = path || process.cwd() + "/docs/";
    if (onExit) {
      this.api.docs.saveOnExit(savePath);
    } else {
      this.api.docs.save(savePath);
    }
  }

}
