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
import { TypeManager } from "./manager/type";
import { apiCheckParams, paramsChecker, schemaChecker } from "./params";
import { IHandler, ISchemaOption, Schema } from "./schema";
import { camelCase2underscore, getCallerSourceLine } from "./utils";

const missingParameter = (msg: string) => new Error(`missing required parameter ${msg}`);
const invalidParameter = (msg: string) => new Error(`incorrect parameter ${msg}`);
const internalError = (msg: string) => new Error(`internal error ${msg}`);

export interface IApiFlag {
  saveApiInputOutput: boolean;
}

export type genSchema<T, U> = Readonly<ISupportMethds<(path: string) => Schema<T, U>>>;

export interface IApiInfo<T, U> extends IKVObject, genSchema<T, U> {
  readonly $schemas: Map<string, Schema<T, U>>;
  beforeHooks: Set<IHandler<T, U>>;
  afterHooks: Set<IHandler<T, U>>;
  docs?: any;
  test?: any;
  formatOutputReverse?: (out: any) => [Error | null, any];
  docOutputForamt?: (out: any) => any;
  $flag: IApiFlag;
}

export interface IApiOption {
  info?: any;
  path?: any;
  missingParameterError?: any;
  invalidParameterError?: any;
  internalError?: any;
  errors?: any;
  groups?: any;
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
  public type: any;
  public errors: any;
  public groups: any;
  public test: ITest = {} as ITest;
  public docsOptions: IDocOptions;
  public shareTestData?: any;

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
    const register = (method: string, path: string) => {
      const s = new Schema<T, U>(method, path, getCallerSourceLine(this.config.path));
      const s2 = this.api.$schemas.get(s.key);
      assert(
        !s2,
        `尝试注册API：${s.key}（所在文件：${
          s.options.sourceFile.absolute
        }）失败，因为该API已在文件${s2 && s2.options.sourceFile.absolute}中注册过`,
      );

      this.api.$schemas.set(s.key, s);
      return s;
    };
    this.api = {
      $schemas: new Map(),
      beforeHooks: new Set(),
      afterHooks: new Set(),
      $flag: {
        saveApiInputOutput: false,
      },
      get: (path: string) => {
        return register("get", path);
      },
      post: (path: string) => {
        return register("post", path);
      },
      put: (path: string) => {
        return register("put", path);
      },
      delete: (path: string) => {
        return register("delete", path);
      },
      patch: (path: string) => {
        return register("patch", path);
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
    this.groups = options.groups || {};
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

  /**
   * 绑定路由
   * （加载顺序：beforeHooks -> apiCheckParams -> middlewares -> handler -> afterHooks ）
   *
   * @param {Object} router 路由
   */
  public bindRouter(router: any) {
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
  public bindRouterToApp(app: any, express: any, prefix: string) {
    const routes = new Map();
    for (const key of Object.keys(this.api.$schemas)) {
      const schema = this.api.$schemas.get(key);
      if (!schema) {
        continue;
      }
      schema.init(this);
      const group = camelCase2underscore(schema.options.group || "");
      debug("bindRouterToApp" + key + group);
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
    Object.keys(routes).forEach((value, key) => {
      debug("bindRouterToApp - " + key);
      app.use(prefix ? `/${prefix}/${key}` : "/" + key, value);
    });
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
