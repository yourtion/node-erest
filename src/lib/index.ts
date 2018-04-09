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
import { camelCase2underscore, getCallerSourceLine } from "./utils";

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
  public app: any;
  public api: IApiInfo<T, U>;
  public utils: any;
  public info: any;
  public config: any;
  public error: any;
  public type: TypeManager;
  public errors: any;
  public test: ITest = {} as ITest;
  public docsOptions: IDocOptions;
  public shareTestData?: any;
  public groups: IKVObject<string>;
  private forceGroup: boolean;
  private register: (method: string, path: string, group?: string | undefined) => Schema<T, U>;

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
    this.register = (method: string, path: string, group?: string) => {
      if (this.forceGroup) {
        assert(group, "使用 forceGroup 但是没有通过 group 注册");
        assert(group! in this.groups, `请先配置 ${group} 类型`);
      } else {
        assert(!group, "请开启 forceGroup 再使用 group 功能");
      }
      const s = new Schema<T, U>(method, path, getCallerSourceLine(this.config.path), group);
      const s2 = this.api.$schemas.get(s.key);
      assert(
        !s2,
        `尝试注册API：${s.key}（所在文件：${
          s.options.sourceFile.absolute
        }）失败，因为该API已在文件${s2 && s2.options.sourceFile.absolute}中注册过`,
      );

      this.api.$schemas.set(s.key, s);
      debug("register: (%s)[%s] - %s ", group, method, path);
      return s;
    };
    this.api = {
      $schemas: new Map(),
      beforeHooks: new Set(),
      afterHooks: new Set(),
      get: (path: string) => this.register("get", path),
      post: (path: string) => this.register("post", path),
      put: (path: string) => this.register("put", path),
      delete: (path: string) => this.register("delete", path),
      patch: (path: string) => this.register("patch", path),
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
    this.type = new TypeManager(this);
    this.errors = options.errors;
    defaultTypes.call(this, this.type);
  }

  public initTest(app: any, path: string = "/docs/") {
    if (this.app && this.test) {
      return;
    }
    debug("initTest");
    this.app = app;
    extendTest(this);
    extendDocs(this);
    this.api.docs.markdown();
    this.api.docs.saveOnExit(process.cwd() + path);
  }

  public setFormatOutput(fn: (out: any) => [Error | null, any]) {
    this.api.formatOutputReverse = fn;
  }

  public setDocOutputForamt(fn: (out: any) => any) {
    this.api.docOutputForamt = fn;
  }

  public beforeHooks(fn: IHandler<T, U>) {
    assert(typeof fn === "function", "钩子名称必须是Function类型");
    this.api.beforeHooks.add(fn);
  }

  public afterHooks(fn: IHandler<T, U>) {
    assert(typeof fn === "function", "钩子名称必须是Function类型");
    this.api.afterHooks.add(fn);
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
      get: (path: string) => this.register("get", path, name),
      post: (path: string) => this.register("post", path, name),
      put: (path: string) => this.register("put", path, name),
      delete: (path: string) => this.register("delete", path, name),
      patch: (path: string) => this.register("patch", path, name),
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
    for (const [key, schema] of this.api.$schemas.entries()) {
      debug("bind router" + key);
      if (!schema) {
        continue;
      }
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
    for (const [key, schema] of this.api.$schemas.entries()) {
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
        ...this.api.beforeHooks,
        ...schema.options.beforeHooks,
        apiCheckParams(this, schema),
        ...schema.options.middlewares,
        schema.options.handler,
        ...schema.options.afterHooks,
        ...this.api.afterHooks,
      );
    }
    for (const [key, value] of routes.entries()) {
      debug("bindGroupToApp - " + key);
      app.use(prefix ? `/${prefix}/${key}` : "/" + key, value);
    }
  }

  public genDocs(savePath = process.cwd() + "/docs/", onExit = true) {
    extendDocs(this);
    this.api.docs.genDocs();
    if (onExit) {
      this.api.docs.saveOnExit(savePath);
    } else {
      this.api.docs.save(savePath);
    }
  }
}
