/**
 * @file API Scheme
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import * as assert from "assert";
import { core as debug } from "./debug";
import { defaultErrors, defaultTypes } from "./default";
import IAPIDoc, { IDocData } from "./extend/docs";
import IAPITest from "./extend/test";
import { IKVObject, ISupportMethds } from "./interfaces";
import { ErrorManager, IError, IType, TypeManager } from "./manager";
import { apiCheckParams, ISchemaType, paramsChecker, schemaChecker } from "./params";
import { IHandler, ISchemaDefine, ISchemaOption, Schema } from "./schema";
import * as utils from "./utils";
const { camelCase2underscore, getCallerSourceLine } = utils;

const missingParameter = (msg: string) => new Error(`missing required parameter ${msg}`);
const invalidParameter = (msg: string) => new Error(`incorrect parameter ${msg}`);
const internalError = (msg: string) => new Error(`internal error ${msg}`);

/** Schema方法 */
export type genSchema<T, U> = Readonly<ISupportMethds<(path: string) => Schema<T, U>>>;

/** 组方法 */
export interface IGruop<T, U> extends IKVObject, genSchema<T, U> {
  define: (opt: ISchemaDefine<T, U>) => Schema<T, U>;
}

/** API接口定义 */
export interface IApiInfo<T, U> extends IKVObject, genSchema<T, U> {
  readonly $schemas: Map<string, Schema<T, U>>;
  define: (opt: ISchemaDefine<T, U>) => Schema<T, U>;
  beforeHooks: Set<IHandler<T, U>>;
  afterHooks: Set<IHandler<T, U>>;
  docs?: IAPIDoc;
  formatOutputReverse?: (out: any) => [Error | null, any];
  docOutputForamt?: (out: any) => any;
}

/** API基础信息 */
export interface IApiOptionInfo {
  /** 项目标题 */
  title?: string;
  /** 项目描述（可以为 markdown 字符串） */
  description?: string;
  /** 项目版本 */
  version?: Date;
  /** 服务器host地址 */
  host?: string;
  /** API默认位置 */
  basePath?: string;
}

/** API配置 */
interface IAPIConfig {
  path: string;
}

/** API定义 */
export interface IApiOption {
  info?: IApiOptionInfo;
  path?: string;
  missingParameterError?: (msg: string) => Error;
  invalidParameterError?: (msg: string) => Error;
  internalError?: (msg: string) => Error;
  groups?: IKVObject<string>;
  forceGroup?: boolean;
  docs?: IDocOptions;
}

/** 文档生成信息 */
export interface IDocOptions extends IKVObject {
  /** 生成wiki */
  wiki?: string | boolean;
  /** 生成 Index.md */
  index?: string | boolean;
  /** 生成 Home.md */
  home?: string | boolean;
  /** 生成 swagger.json */
  swagger?: string | boolean;
  /** 生成 docs.json */
  json?: string | boolean;
  /** 生成 all-in-one.md */
  all?: string | boolean;
}

/**
 * Easy rest api helper
 */
export default class API<T = any, U = any> {
  public shareTestData?: any;
  private apiInfo: IApiInfo<T, U>;
  private testAgent: IAPITest = {} as IAPITest;
  private app: any;
  private info: IApiOptionInfo;
  private config: IAPIConfig;
  private error: {
    missingParameter: (msg: string) => Error;
    invalidParameter: (msg: string) => Error;
    internalError: (msg: string) => Error;
  };
  private typeManage: TypeManager;
  private errorManage: ErrorManager;
  private schemas: any;
  private docsOptions: IDocOptions;
  private groups: IKVObject<string>;
  private forceGroup: boolean;
  private registAPI: (method: string, path: string, group?: string | undefined) => Schema<T, U>;
  private defineAPI: (options: ISchemaDefine<T, U>, group?: string | undefined) => Schema<T, U>;

  /**
   * 获取私有变量信息
   */
  get privateInfo() {
    return {
      app: this.app,
      info: this.info,
      groups: this.groups,
      docsOptions: this.docsOptions,
      error: this.error,
    };
  }

  /**
   * API实例
   */
  get api() {
    return this.apiInfo;
  }

  /**
   * 测试实例
   */
  get test() {
    return this.testAgent;
  }

  /**
   * 错误列表
   */
  get errors() {
    return this.errorManage;
  }

  /**
   * 类型列表
   */
  get type() {
    return this.typeManage;
  }

  /**
   * 工具类
   */
  get utils() {
    return utils;
  }

  constructor(options: IApiOption) {
    this.info = options.info || {};
    this.forceGroup = options.forceGroup || false;
    // 设置内部错误报错信息
    this.error = {
      missingParameter: options.missingParameterError || missingParameter,
      invalidParameter: options.invalidParameterError || invalidParameter,
      internalError: options.internalError || internalError,
    };
    this.config = {
      path: options.path || process.cwd(),
    };
    this.groups = options.groups || {};

    // API注册方法
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
        }）失败，因为该API已在文件${s2 && s2.options.sourceFile.absolute}中注册过`
      );

      this.apiInfo.$schemas.set(s.key, s);
      debug("register: (%s)[%s] - %s ", group, method, path);
      return s;
    };
    // define注册方法
    this.defineAPI = (opt: ISchemaDefine<T, U>, group?: string) => {
      const s = Schema.define(opt, getCallerSourceLine(this.config.path), group);
      const s2 = this.apiInfo.$schemas.get(s.key);
      assert(
        !s2,
        `尝试注册API：${s.key}（所在文件：${
          s.options.sourceFile.absolute
        }）失败，因为该API已在文件${s2 && s2.options.sourceFile.absolute}中注册过`
      );

      this.apiInfo.$schemas.set(s.key, s);
      debug("define: (%s)[%s] - %s ", group, opt.method, opt.path);
      return s;
    };
    // 初始化API
    this.apiInfo = {
      $schemas: new Map(),
      beforeHooks: new Set(),
      afterHooks: new Set(),
      define: (opt: ISchemaDefine<T, U>) => this.defineAPI(opt),
      get: (path: string) => this.registAPI("get", path),
      post: (path: string) => this.registAPI("post", path),
      put: (path: string) => this.registAPI("put", path),
      delete: (path: string) => this.registAPI("delete", path),
      patch: (path: string) => this.registAPI("patch", path),
    };

    // 初始化文档生成
    const getDocOpt = (key: string, def: string | boolean): string | boolean => {
      return options.docs && options.docs[key] !== undefined ? options.docs[key] : def;
    };
    this.docsOptions = {
      wiki: getDocOpt("wiki", "./"),
      index: getDocOpt("index", false),
      home: getDocOpt("home", true),
      swagger: getDocOpt("swagger", false),
      json: getDocOpt("json", false),
      all: getDocOpt("all", false),
    };

    // 参数类型管理
    this.typeManage = new TypeManager();
    defaultTypes.call(this, this.typeManage);
    // 错误管理
    this.errorManage = new ErrorManager();
    defaultErrors.call(this, this.errorManage);
  }

  /**
   * 初始化测试系统
   * @param app APP或者serve实例，用于init supertest
   * @param testPath 测试文件路径
   * @param docPath 输出文件路径
   */
  public initTest(app: any, testPath = process.cwd(), docPath = "/docs/") {
    if (this.app && this.testAgent) {
      return;
    }
    debug("initTest");
    this.app = app;
    this.testAgent = new IAPITest(this, testPath);
    if (!this.api.docs) {
      this.api.docs = new IAPIDoc(this);
    }
    this.apiInfo.docs!.saveOnExit(process.cwd() + docPath);
  }

  /**
   * 设置测试格式化函数
   */
  public setFormatOutput(fn: (out: any) => [Error | null, any]) {
    this.apiInfo.formatOutputReverse = fn;
  }

  /**
   * 设置文档格式化函数
   */
  public setDocOutputForamt(fn: (out: any) => any) {
    this.apiInfo.docOutputForamt = fn;
  }

  /**
   * 设置全局 Before Hook
   */
  public beforeHooks(fn: IHandler<T, U>) {
    assert(typeof fn === "function", "钩子名称必须是Function类型");
    this.apiInfo.beforeHooks.add(fn);
  }

  /**
   * 设置全局 After Hook
   */
  public afterHooks(fn: IHandler<T, U>) {
    assert(typeof fn === "function", "钩子名称必须是Function类型");
    this.apiInfo.afterHooks.add(fn);
  }

  /**
   * 获取参数检查实例
   */
  public paramsChecker() {
    return (name: string, value: any, schema: ISchemaType) =>
      paramsChecker(this, name, value, schema);
  }

  /**
   * 获取Schema检查实例
   */
  public schemaChecker() {
    return (data: IKVObject, schema: IKVObject<ISchemaType>, requiredOneOf: string[] = []) =>
      schemaChecker(this, data, schema, requiredOneOf);
  }

  /**
   * 获取分组API实例
   */
  public group(name: string): IGruop<T, U> {
    debug("using group: %s", name);
    const group = {
      get: (path: string) => this.registAPI("get", path, name),
      post: (path: string) => this.registAPI("post", path, name),
      put: (path: string) => this.registAPI("put", path, name),
      delete: (path: string) => this.registAPI("delete", path, name),
      patch: (path: string) => this.registAPI("patch", path, name),
      define: (opt: ISchemaDefine<T, U>) => this.defineAPI(opt, name),
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
      debug("bind router: %s", key);
      schema.init(this);
      router[schema.options.method].bind(router)(
        schema.options.path,
        ...this.apiInfo.beforeHooks,
        ...schema.options.beforeHooks,
        apiCheckParams(this, schema),
        ...schema.options.middlewares,
        schema.options.handler,
        ...schema.options.afterHooks,
        ...this.apiInfo.afterHooks
      );
    }
  }

  /**
   * 绑定路由到Express
   *
   * @param {Object} app Express App 实例
   * @param {Object} express Express 对象
   */
  public bindGroupToApp(app: any, express: any) {
    if (!this.forceGroup) {
      throw this.error.internalError("没有开启 forceGroup，请使用bindRouter");
    }
    const routes = new Map();
    for (const [key, schema] of this.apiInfo.$schemas.entries()) {
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
        ...this.apiInfo.afterHooks
      );
    }
    for (const [key, value] of routes.entries()) {
      debug("bindGroupToApp - %s", key);
      app.use("/" + key, value);
    }
  }

  /**
   * 生成文档
   * @param savePath 文档保存路径
   * @param onExit 是否等待程序退出再保存
   */
  public genDocs(savePath = process.cwd() + "/docs/", onExit = true) {
    if (!this.api.docs) {
      this.api.docs = new IAPIDoc(this);
    }
    const docs = this.api.docs;
    docs.genDocs();
    if (onExit) {
      docs.saveOnExit(savePath);
    } else {
      docs.save(savePath);
    }
  }
}
