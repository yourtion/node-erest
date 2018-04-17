"use strict";

/**
 * @file API Scheme
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import * as assert from "assert";
import { core as debug } from "./debug";
import { defaultTypes } from "./default/types";
import { extendDocs } from "./extend/docs";
import { extendTest, ITest } from "./extend/test";
import { IKVObject, ISupportMethds } from "./interfaces";
import { IType, TypeManager } from "./manager/type";
import { apiCheckParams, paramsChecker, schemaChecker } from "./params";
import { IHandler, ISchemaOption, Schema } from "./schema";
import * as utils from "./utils";
const { camelCase2underscore, getCallerSourceLine } = utils;

const missingParameter = (msg: string) => new Error(`missing required parameter ${msg}`);
const invalidParameter = (msg: string) => new Error(`incorrect parameter ${msg}`);
const internalError = (msg: string) => new Error(`internal error ${msg}`);

export type genSchema<T, U> = Readonly<ISupportMethds<(path: string) => Schema<T, U>>>;

export interface IApiInfo<T, U> extends IKVObject, genSchema<T, U> {
  readonly $schemas: Map<string, Schema<T, U>>;
  beforeHooks: Set<IHandler<T, U>>;
  afterHooks: Set<IHandler<T, U>>;
  docs?: any;
  test?: any;
  formatOutputReverse?: (out: any) => [Error | null, any];
  docOutputForamt?: (out: any) => any;
}

export interface IApiOption {
  info?: any;
  path?: any;
  missingParameterError?: any;
  invalidParameterError?: any;
  internalError?: any;
  errors?: any;
  groups?: IKVObject<string>;
  forceGroup: boolean;
  docs?: IDocOptions;
}

export interface IDocOptions extends IKVObject {
  wiki?: string | boolean;
  index?: string | boolean;
  home?: string | boolean;
  swagger?: string | boolean;
  json?: string | boolean;
  all?: string | boolean;
}

export default class API<T = any, U = any> {
  private apiInfo: IApiInfo<T, U>;
  private testAgent: ITest = {} as ITest;
  private app: any;
  private info: any;
  private config: any;
  private error: any;
  private typeManage: TypeManager;
  private errors: any;
  private schemas: any;
  private docsOptions: IDocOptions;
  private shareTestData?: any;
  private groups: IKVObject<string>;
  private forceGroup: boolean;
  private registAPI: (method: string, path: string, group?: string | undefined) => Schema<T, U>;

  get privateInfo() {
    return {
      app: this.app,
      config: this.config,
      info: this.info,
      errors: this.errors,
      groups: this.groups,
      docsOptions: this.docsOptions,
    };
  }

  get api() {
    return this.apiInfo;
  }

  get test() {
    return this.testAgent;
  }

  get type() {
    return this.typeManage;
  }

  get utils() {
    return utils;
  }

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
    this.info = options.info || {};
    this.forceGroup = options.forceGroup || false;
    this.error = {
      missingParameter: options.missingParameterError || missingParameter,
      invalidParameter: options.invalidParameterError || invalidParameter,
      internalError: options.internalError || internalError,
    };
    this.config = {
      path: options.path || process.cwd(),
    };
    this.groups = options.groups || {};
    this.registAPI = (method: string, path: string, group?: string) => {
      if (this.forceGroup) {
        assert(group, "使用 forceGroup 但是没有通过 group 注册");
        assert(group! in this.groups, `请先配置 ${group} 类型`);
      } else {
        assert(!group, "请开启 forceGroup 再使用 group 功能");
      }
      const s = new Schema<T, U>(method, path, getCallerSourceLine(this.config.path), group);
      const s2 = this.apiInfo.$schemas.get(s.key);
      assert(
        !s2,
        `尝试注册API：${s.key}（所在文件：${
          s.options.sourceFile.absolute
        }）失败，因为该API已在文件${s2 && s2.options.sourceFile.absolute}中注册过`,
      );

      this.apiInfo.$schemas.set(s.key, s);
      debug("register: (%s)[%s] - %s ", group, method, path);
      return s;
    };
    this.apiInfo = {
      $schemas: new Map(),
      beforeHooks: new Set(),
      afterHooks: new Set(),
      get: (path: string) => this.registAPI("get", path),
      post: (path: string) => this.registAPI("post", path),
      put: (path: string) => this.registAPI("put", path),
      delete: (path: string) => this.registAPI("delete", path),
      patch: (path: string) => this.registAPI("patch", path),
    };
    const getDocOpt = (key: string, def: boolean): string | boolean => {
      return options.docs && options.docs[key] !== undefined ? options.docs[key] : def;
    };
    this.docsOptions = {
      wiki: getDocOpt("wiki", true),
      index: getDocOpt("index", false),
      home: getDocOpt("home", true),
      swagger: getDocOpt("swagger", false),
      json: getDocOpt("json", false),
      all: getDocOpt("all", false),
    };
    // 参数类型管理
    this.typeManage = new TypeManager(this);
    this.errors = options.errors;
    defaultTypes.call(this, this.typeManage);
  }

  public initTest(app: any, path: string = "/docs/") {
    if (this.app && this.testAgent) {
      return;
    }
    debug("initTest");
    this.app = app;
    this.testAgent = extendTest(this);
    extendDocs(this);
    this.apiInfo.docs.markdown();
    this.apiInfo.docs.saveOnExit(process.cwd() + path);
  }

  public setFormatOutput(fn: (out: any) => [Error | null, any]) {
    this.apiInfo.formatOutputReverse = fn;
  }

  public setDocOutputForamt(fn: (out: any) => any) {
    this.apiInfo.docOutputForamt = fn;
  }

  public beforeHooks(fn: IHandler<T, U>) {
    assert(typeof fn === "function", "钩子名称必须是Function类型");
    this.apiInfo.beforeHooks.add(fn);
  }

  public afterHooks(fn: IHandler<T, U>) {
    assert(typeof fn === "function", "钩子名称必须是Function类型");
    this.apiInfo.afterHooks.add(fn);
  }

  public paramsChecker() {
    return (name: string, value: any, schema: IKVObject) =>
      paramsChecker(this, name, value, schema);
  }

  public schemaChecker() {
    return (data: IKVObject, schema: IKVObject<IKVObject>, requiredOneOf: string[] = []) =>
      schemaChecker(this, data, schema, requiredOneOf);
  }

  public group(name: string): ISupportMethds<(path: string) => Schema<T, U>> {
    debug("using group: %s", name);
    const group = {
      get: (path: string) => this.registAPI("get", path, name),
      post: (path: string) => this.registAPI("post", path, name),
      put: (path: string) => this.registAPI("put", path, name),
      delete: (path: string) => this.registAPI("delete", path, name),
      patch: (path: string) => this.registAPI("patch", path, name),
    };
    return group;
  }

  /**
   * 绑定路由
   * （加载顺序：beforeHooks -> apiCheckParams -> middlewares -> handler -> afterHooks ）
   *
   * @param {Object} router 路由
   */
  public bindRouter(router: any) {
    if (this.forceGroup) {
      throw this.error.internalError("使用了 forceGroup，请使用bindGroupToApp");
    }
    for (const [key, schema] of this.apiInfo.$schemas.entries()) {
      debug("bind router" + key);
      if (!schema) {
        continue;
      }
      schema.init(this);
      router[schema.options.method].bind(router)(
        schema.options.path,
        ...this.apiInfo.beforeHooks,
        ...schema.options.beforeHooks,
        apiCheckParams(this, schema),
        ...schema.options.middlewares,
        schema.options.handler,
        ...schema.options.afterHooks,
        ...this.apiInfo.afterHooks,
      );
    }
  }

  /**
   * 绑定路由到Express
   *
   * @param {Object} app Express App 实例
   * @param {Object} express Express 对象
   * @param {string} prefix 路由前缀
   */
  public bindGroupToApp(app: any, express: any, prefix?: string) {
    if (!this.forceGroup) {
      throw this.error.internalError("没有开启 forceGroup，请使用bindRouter");
    }
    const routes = new Map();
    for (const [key, schema] of this.apiInfo.$schemas.entries()) {
      if (!schema) {
        continue;
      }
      schema.init(this);
      const group = camelCase2underscore(schema.options.group || "");
      debug("bindGroupToApp: %s - %s", key, group);
      if (!routes.get(group)) {
        routes.set(group, new express.Router());
      }
      routes.get(group)[schema.options.method].bind(routes.get(group))(
        schema.options.path,
        ...this.apiInfo.beforeHooks,
        ...schema.options.beforeHooks,
        apiCheckParams(this, schema),
        ...schema.options.middlewares,
        schema.options.handler,
        ...schema.options.afterHooks,
        ...this.apiInfo.afterHooks,
      );
    }
    for (const [key, value] of routes.entries()) {
      debug("bindGroupToApp - " + key);
      app.use(prefix ? `/${prefix}/${key}` : "/" + key, value);
    }
  }

  public genDocs(savePath = process.cwd() + "/docs/", onExit = true) {
    extendDocs(this);
    this.apiInfo.docs.genDocs();
    if (onExit) {
      this.apiInfo.docs.saveOnExit(savePath);
    } else {
      this.apiInfo.docs.save(savePath);
    }
  }
}
