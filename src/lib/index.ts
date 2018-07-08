/**
 * @file API Scheme
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import assert from "assert";
import { core as debug } from "./debug";
import { defaultErrors, defaultTypes } from "./default";
import { ErrorManager, TypeManager } from "./manager";
import API, { APIDefine, DEFAULT_HANDLER, SUPPORT_METHODS } from "./api";
import { apiParamsCheck, paramsChecker, schemaChecker, ISchemaType } from "./params";
import { camelCase2underscore, getCallerSourceLine, ISupportMethds } from "./utils";
import IAPITest from "./extend/test";
import IAPIDoc from "./extend/docs";

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
  // docs?: IAPIDoc;
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
  groups?: Record<string, string>;
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
  /** 生成 docs.json */
  json?: string | boolean;
  /** 生成 all-in-one.md */
  all?: string | boolean;
}

/**
 * Easy rest api helper
 */
export default class ERest<T = DEFAULT_HANDLER> {
  public shareTestData?: any;
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
  private typeManage: TypeManager;
  private errorManage: ErrorManager;
  private docsOptions: IDocOptions;
  private groups: Record<string, string>;
  private forceGroup: boolean;
  private registAPI: (method: SUPPORT_METHODS, path: string, group?: string | undefined) => API<T>;
  private defineAPI: (options: APIDefine<T>, group?: string | undefined) => API<T>;

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
    this.registAPI = (method: SUPPORT_METHODS, path: string, group?: string) => {
      if (this.forceGroup) {
        assert(group, "使用 forceGroup 但是没有通过 group 注册");
        assert(group! in this.groups, `请先配置 ${group} 类型`);
      } else {
        assert(!group, "请开启 forceGroup 再使用 group 功能");
      }
      const s = new API<T>(method, path, getCallerSourceLine(this.config.path), group);
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
    this.defineAPI = (opt: APIDefine<T>, group?: string) => {
      const s = API.define(opt, getCallerSourceLine(this.config.path), group);
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
    const group = {
      get: (path: string) => this.registAPI("get", path, name),
      post: (path: string) => this.registAPI("post", path, name),
      put: (path: string) => this.registAPI("put", path, name),
      delete: (path: string) => this.registAPI("delete", path, name),
      patch: (path: string) => this.registAPI("patch", path, name),
      define: (opt: APIDefine<T>) => this.defineAPI(opt, name),
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
      debug("bindGroupToApp: %s - %s", key, group);
      if (!routes.get(group)) {
        routes.set(group, new Router());
      }
      routes.get(group)[schema.options.method].bind(routes.get(group))(
        schema.options.path,
        ...this.apiInfo.beforeHooks,
        ...schema.options.beforeHooks,
        checker(this, schema),
        ...schema.options.middlewares,
        schema.options.handler
      );
    }
    for (const [key, value] of routes.entries()) {
      debug("bindGroupToApp - %s", key);
      app.use("/" + key, value);
    }
  }
}
