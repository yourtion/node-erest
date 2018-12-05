/**
 * @file API Scheme
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import assert from "assert";
import SchemaManage, { ValueTypeManager, SchemaType } from "@tuzhanai/schema-manager";
import { core as debug } from "./debug";
import { defaultErrors } from "./default";
import { ErrorManager } from "./manager";
import API, { APIDefine, DEFAULT_HANDLER, SUPPORT_METHODS } from "./api";
import { apiParamsCheck, paramsChecker, schemaChecker, ISchemaType, responseChecker } from "./params";
import { camelCase2underscore, getCallerSourceLine, ISupportMethds } from "./utils";
import * as utils from "./utils";
import IAPITest from "./extend/test";
import IAPIDoc, { IDocWritter } from "./extend/docs";

export * from "@tuzhanai/schema-manager";
export * from "./api";

const missingParameter = (msg: string) => new Error(`missing required parameter ${msg}`);
const invalidParameter = (msg: string) => new Error(`incorrect parameter ${msg}`);
const internalError = (msg: string) => new Error(`internal error ${msg}`);

/** Schema方法 */
export type genSchema<T> = Readonly<ISupportMethds<(path: string) => API<T>>>;

/** 组方法 */
export interface IGruop<T> extends Record<string, any>, genSchema<T> {
  define: (opt: APIDefine<T>) => API<T>;
}

/** API接口定义 */
export interface IApiInfo<T> extends Record<string, any>, genSchema<T> {
  readonly $apis: Map<string, API<T>>;
  define: (opt: APIDefine<T>) => API<T>;
  beforeHooks: Set<T>;
  afterHooks: Set<T>;
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
  groups?: Record<string, string | IGruopInfoOpt>;
  forceGroup?: boolean;
  docs?: IDocOptions;
}

/** 文档生成信息 */
export interface IDocOptions extends Record<string, any> {
  /** 生成wiki */
  wiki?: string | boolean;
  /** 生成 Index.md */
  index?: string | boolean;
  /** 生成 Home.md */
  home?: string | boolean;
  /** 生成 swagger.json */
  swagger?: string | boolean;
  /** 生成 postman.json */
  postman?: string | boolean;
  /** 生成 docs.json */
  json?: string | boolean;
  /** 生成 jssdk.js 基于（axios） */
  axios?: string | boolean;
  /** 生成 all-in-one.md */
  all?: string | boolean;
}

export interface IGruopInfoOpt {
  name: string;
  prefix?: string;
}

interface IGruopInfo<T> extends IGruopInfoOpt {
  middleware: T[];
  before: T[];
}

/**
 * Easy rest api helper
 */
export default class ERest<T = DEFAULT_HANDLER> {
  public shareTestData?: any;
  public utils = utils;

  private apiInfo: IApiInfo<T>;
  private testAgent: IAPITest = {} as IAPITest;
  private app: any;
  private info: IApiOptionInfo;
  private config: IAPIConfig;
  private error: {
    missingParameter: (msg: string) => Error;
    invalidParameter: (msg: string) => Error;
    internalError: (msg: string) => Error;
  };
  private schemaManage: SchemaManage = new SchemaManage();
  private typeManage: ValueTypeManager = this.schemaManage.type;
  private errorManage: ErrorManager;
  private docsOptions: IDocOptions;
  private groups: Record<string, string>;
  private groupInfo: Record<string, IGruopInfo<T>>;
  private forceGroup: boolean;
  private registAPI: (
    method: SUPPORT_METHODS,
    path: string,
    group?: string | undefined,
    prefix?: string | undefined
  ) => API<T>;
  private defineAPI: (options: APIDefine<T>, group?: string | undefined, prefix?: string | undefined) => API<T>;
  private mockHandler?: (data: any) => T;

  /**
   * 获取私有变量信息
   */
  get privateInfo() {
    return {
      app: this.app,
      info: this.info,
      groups: this.groups,
      groupInfo: this.groupInfo,
      docsOptions: this.docsOptions,
      error: this.error,
      mockHandler: this.mockHandler,
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
   * 类型列表
   */
  get schema() {
    return this.schemaManage;
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
    this.groups = {};
    this.groupInfo = {};
    for (const g of Object.keys(options.groups || {})) {
      const gInfo = options.groups![g];
      this.groups[g] = typeof gInfo === "string" ? gInfo : gInfo.name;
      const gI = typeof gInfo === "string" ? { name: gInfo } : gInfo;
      this.groupInfo[g] = Object.assign({ middleware: [], before: [] }, gI);
    }

    // API注册方法
    this.registAPI = (method: SUPPORT_METHODS, path: string, group?: string, prefix?: string) => {
      if (this.forceGroup) {
        assert(group, "使用 forceGroup 但是没有通过 group 注册");
        assert(group! in this.groups, `请先配置 ${group} 类型`);
      } else {
        assert(!group, "请开启 forceGroup 再使用 group 功能");
      }
      const s = new API<T>(method, path, getCallerSourceLine(this.config.path), group, prefix);
      const s2 = this.apiInfo.$apis.get(s.key);
      assert(
        !s2,
        `尝试注册API：${s.key}（所在文件：${s.options.sourceFile.absolute}）失败，因为该API已在文件${s2 &&
          s2.options.sourceFile.absolute}中注册过`
      );

      this.apiInfo.$apis.set(s.key, s);
      debug("register: (%s)[%s] - %s ", group, method, path);
      return s;
    };
    // define注册方法
    this.defineAPI = (opt: APIDefine<T>, group?: string, prefix?: string) => {
      const s = API.define(opt, getCallerSourceLine(this.config.path), group, prefix);
      const s2 = this.apiInfo.$apis.get(s.key);
      assert(
        !s2,
        `尝试注册API：${s.key}（所在文件：${s.options.sourceFile.absolute}）失败，因为该API已在文件${s2 &&
          s2.options.sourceFile.absolute}中注册过`
      );

      this.apiInfo.$apis.set(s.key, s);
      debug("define: (%s)[%s] - %s ", group, opt.method, opt.path);
      return s;
    };
    // 初始化API
    this.apiInfo = {
      $apis: new Map(),
      beforeHooks: new Set(),
      afterHooks: new Set(),
      define: (opt: APIDefine<T>) => this.defineAPI(opt),
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
      postman: getDocOpt("postman", false),
      json: getDocOpt("json", false),
      axios: getDocOpt("axios", false),
      all: getDocOpt("all", false),
    };
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
  public initTest(app: any, testPath = process.cwd(), docPath = process.cwd() + "/docs/") {
    if (this.app && this.testAgent) {
      return;
    }
    debug("initTest: %s %s", testPath, docPath);
    this.app = app;
    this.testAgent = new IAPITest(this, testPath);
    if (!this.api.docs) {
      this.api.docs = new IAPIDoc(this);
    }
    this.genDocs(docPath);
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
   * 设置文档格式化函数
   */
  public setDocWritter(fn: IDocWritter) {
    this.apiInfo.docs!.setWritter(fn);
  }

  public setMockHandler(fn: (data: any) => T) {
    this.mockHandler = fn;
  }

  /**
   * 设置全局 Before Hook
   */
  public beforeHooks(fn: T) {
    assert(typeof fn === "function", "钩子名称必须是Function类型");
    this.apiInfo.beforeHooks.add(fn);
  }

  /**
   * 设置全局 After Hook
   */
  public afterHooks(fn: T) {
    assert(typeof fn === "function", "钩子名称必须是Function类型");
    this.apiInfo.afterHooks.add(fn);
  }

  /**
   * 获取参数检查实例
   */
  public paramsChecker() {
    return (name: string, value: any, schema: ISchemaType) => paramsChecker(this, name, value, schema);
  }

  /**
   * 获取Schema检查实例
   */
  public schemaChecker() {
    return (data: any, schema: Record<string, ISchemaType>, requiredOneOf: string[] = []) =>
      schemaChecker(this, data, schema, requiredOneOf);
  }

  /** 返回结果检查 */
  public responseChecker() {
    return (data: any, schema: ISchemaType | SchemaType | Record<string, ISchemaType>) =>
      responseChecker(this, data, schema);
  }

  /**
   * 获取Schema检查实例
   */
  public apiChecker() {
    return (schema: API<any>, params?: Record<string, any>, query?: Record<string, any>, body?: Record<string, any>) =>
      apiParamsCheck(this, schema, params, query, body);
  }

  /**
   * 获取分组API实例
   */
  public group(name: string): IGruop<T> {
    debug("using group: %s", name);
    // assert(this.groupInfo[name], `请先配置 ${name} 分组`);
    const prefix = (this.groupInfo[name] || {}).prefix;
    const group = {
      get: (path: string) => this.registAPI("get", path, name, prefix),
      post: (path: string) => this.registAPI("post", path, name, prefix),
      put: (path: string) => this.registAPI("put", path, name, prefix),
      delete: (path: string) => this.registAPI("delete", path, name, prefix),
      patch: (path: string) => this.registAPI("patch", path, name, prefix),
      define: (opt: APIDefine<T>) => this.defineAPI(opt, name, prefix),
      before: (fn: T) => this.groupInfo[name].before.push(fn),
      middleware: (fn: T) => this.groupInfo[name].middleware.push(fn),
    };
    return group;
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

  public checkerLeiWeb<K>(ereat: ERest<T>, schema: API): (ctx: K) => void {
    return function apiParamsChecker(ctx: any) {
      ctx.request.$params = apiParamsCheck(ereat, schema, ctx.request.params, ctx.request.query, ctx.request.body);
      ctx.next();
    };
  }

  public checkerExpress<U, V, W>(ereat: ERest<T>, schema: API): (req: U, res: V, next: W) => void {
    return function apiParamsChecker(req: any, res: any, next: any) {
      req.$params = apiParamsCheck(ereat, schema, req.params, req.query, req.body);
      next();
    };
  }

  /**
   * 绑定路由
   * （加载顺序：beforeHooks -> apiCheckParams -> middlewares -> handler -> afterHooks ）
   *
   * @param {Object} router 路由
   */
  public bindRouter(router: any, checker: (ctx: ERest<T>, schema: API<T>) => T) {
    if (this.forceGroup) {
      throw this.error.internalError("使用了 forceGroup，请使用bindGroupToApp");
    }
    for (const [key, schema] of this.apiInfo.$apis.entries()) {
      debug("bind router: %s", key);
      schema.init(this);
      router[schema.options.method].bind(router)(
        schema.options.path,
        ...this.apiInfo.beforeHooks,
        ...schema.options.beforeHooks,
        checker(this, schema),
        ...schema.options.middlewares,
        schema.options.handler
      );
    }
  }

  /**
   * 绑定路由到Express
   *
   * @param {Object} app Express App 实例
   * @param {Object} Router Router 对象
   */
  public bindRouterToApp(app: any, Router: any, checker: (ctx: ERest<T>, schema: API<T>) => T) {
    if (!this.forceGroup) {
      throw this.error.internalError("没有开启 forceGroup，请使用bindRouter");
    }
    const routes = new Map();
    for (const [key, schema] of this.apiInfo.$apis.entries()) {
      schema.init(this);
      const group = camelCase2underscore(schema.options.group || "");
      const groupInfo = this.groupInfo[schema.options.group];
      debug("bindGroupToApp: %s - %s", key, group);
      let route = routes.get(group) && routes.get(group).route;
      if (!route) {
        route = new Router();
        routes.set(group, { route, info: groupInfo || {} });
      }

      route[schema.options.method].bind(route)(
        schema.options.path,
        ...this.apiInfo.beforeHooks,
        ...groupInfo.before,
        ...schema.options.beforeHooks,
        checker(this, schema),
        ...groupInfo.middleware,
        ...schema.options.middlewares,
        schema.options.handler
      );
    }
    for (const [key, value] of routes.entries()) {
      debug("bindGroupToApp - %s", key);
      const groupInfo = value.info;
      const p = groupInfo.prefix || "";
      app.use(p + "/" + key, value.route);
    }
  }
}
