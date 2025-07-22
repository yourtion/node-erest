/**
 * @file API Scheme
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import { strict as assert } from "assert";
import { ZodRawShape, ZodType, z } from "zod";
import API, { type APIDefine, type DEFAULT_HANDLER, type SUPPORT_METHODS } from "./api";
import { core as debug } from "./debug";
import { defaultErrors } from "./default";
import IAPIDoc, { type IDocGeneratePlugin, type IDocWritter } from "./extend/docs";
import IAPITest from "./extend/test";
import { ErrorManager } from "./manager";
import {
  apiParamsCheck,
  createZodSchema,
  type ISchemaType,
  paramsChecker,
  responseChecker,
  schemaChecker,
  zodTypeMap,
} from "./params";
import * as utils from "./utils";
import { camelCase2underscore, getCallerSourceLine, type ISupportMethds } from "./utils";

export * from "./api";
export * from "./params";
export { z, ZodRawShape, ZodType };

const missingParameter = (msg: string) => new Error(`missing required parameter ${msg}`);
const invalidParameter = (msg: string) => new Error(`incorrect parameter ${msg}`);
const internalError = (msg: string) => new Error(`internal error ${msg}`);

/** Schema方法 */
export type genSchema<T> = Readonly<ISupportMethds<(path: string) => API<T>>>;

/** 组方法 */
export interface IGruop<T> extends Record<string, any>, genSchema<T> {
  define: (opt: APIDefine<T>) => API<T>;
  before: (...fn: T[]) => IGruop<T>;
  middleware: (...fn: T[]) => IGruop<T>;
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
  groups?: Record<string, string | IGroupInfoOpt>;
  forceGroup?: boolean;
  docs?: IDocOptions;
}

/** 文档生成信息 */
export interface IDocOptions extends Record<string, any> {
  /** 生成Markdown */
  markdown?: string | boolean;
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

export interface IGroupInfoOpt {
  name: string;
  prefix?: string;
}

interface IGroupInfo<T> extends IGroupInfoOpt {
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
  private schemaRegistry: Map<string, ZodType> = new Map();
  private typeRegistry: Map<string, ZodType> = new Map();
  private errorManage: ErrorManager;
  private docsOptions: IDocOptions;
  private groups: Record<string, string>;
  private groupInfo: Record<string, IGroupInfo<T>>;
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
   * 类型管理器
   */
  get type(): {
    register: (name: string, schema: ZodType) => ERest<T>;
    get: (name: string) => ZodType | undefined;
    has: (name: string) => boolean;
    value: (type: string, input: any, params?: any, format?: boolean) => { ok: boolean; message: string; value: any };
  } {
    return {
      register: (name: string, schema: ZodType) => {
        this.typeRegistry.set(name, schema);
        return this;
      },
      get: (name: string) => this.typeRegistry.get(name),
      has: (name: string) => this.typeRegistry.has(name),
      value: (type: string, input: any, params?: any, format?: boolean) => {
        const schema = this.typeRegistry.get(type) || zodTypeMap[type as keyof typeof zodTypeMap];
        if (!schema) {
          return { ok: false, message: `Unknown type: ${type}`, value: input };
        }
        try {
          const result = schema.parse(input);
          return { ok: true, message: "", value: result };
        } catch (error: any) {
          return { ok: false, message: error.message, value: input };
        }
      },
    };
  }

  /**
   * Schema 管理器
   */
  get schema(): {
    register: (name: string, schema: ZodType) => void;
    get: (name: string) => ZodType | undefined;
    has: (name: string) => boolean;
    check: (name: string, value: any) => boolean;
    createZodSchema: (schemaType: ISchemaType) => ZodType;
  } {
    return {
      register: (name: string, schema: ZodType) => {
        this.schemaRegistry.set(name, schema);
        return this;
      },
      get: (name: string) => {
        return this.schemaRegistry.get(name);
      },
      has: (name: string) => {
        return this.schemaRegistry.has(name);
      },
      check: (name: string, value: any) => {
        const schema = this.schemaRegistry.get(name);
        if (!schema) return false;
        try {
          schema.parse(value);
          return true;
        } catch {
          return false;
        }
      },
      createZodSchema: (schemaType: ISchemaType) => {
        return createZodSchema(schemaType);
      },
    };
  }

  /**
   * 创建 Schema 对象
   */
  createSchema(schemaObj: Record<string, ISchemaType>) {
    const schemaFields: Record<string, any> = {};
    for (const [key, typeInfo] of Object.entries(schemaObj)) {
      schemaFields[key] = createZodSchema(typeInfo);
    }
    return z.object(schemaFields);
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
        `尝试注册API：${s.key}（所在文件：${s.options.sourceFile.absolute}）失败，因为该API已在文件${
          s2 && s2.options.sourceFile.absolute
        }中注册过`
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
        `尝试注册API：${s.key}（所在文件：${s.options.sourceFile.absolute}）失败，因为该API已在文件${
          s2 && s2.options.sourceFile.absolute
        }中注册过`
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
      markdown: getDocOpt("markdown", true),
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

  public responseChecker() {
    return (data: any, schema: ISchemaType) => responseChecker(this, data, schema);
  }

  /**
   * 获取API参数检查实例
   */
  public apiParamsCheck() {
    return (data: any, schema: Record<string, ISchemaType>) => apiParamsCheck(this, data, schema);
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
   * 注册文档生成组件
   */
  public addDocPlugin(name: string, plugin: IDocGeneratePlugin) {
    this.apiInfo.docs!.registerPlugin(name, plugin);
  }

  /**
   * 获取Swagger信息
   */
  public buildSwagger() {
    if (!this.api.docs) {
      this.api.docs = new IAPIDoc(this);
    }
    return this.api.docs.getSwaggerInfo();
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
   * 获取分组API实例
   */
  public group(name: string, info?: IGroupInfoOpt): IGruop<T>;
  public group(name: string, desc?: string): IGruop<T>;
  public group(name: string, infoOrDesc?: IGroupInfoOpt | string): IGruop<T> {
    debug("using group: %s, desc: %j", name, infoOrDesc);
    // assert(this.groupInfo[name], `请先配置 ${name} 分组`);
    const info = !infoOrDesc || typeof infoOrDesc === "string" ? { name: infoOrDesc, prefix: "" } : infoOrDesc;
    this.groups[name] = this.groups[name] || info.name || "";
    this.groupInfo[name] = this.groupInfo[name] || { ...info, middleware: [], before: [] };
    const prefix = this.groupInfo[name].prefix;
    const group = {
      get: (path: string) => this.registAPI("get", path, name, prefix),
      post: (path: string) => this.registAPI("post", path, name, prefix),
      put: (path: string) => this.registAPI("put", path, name, prefix),
      delete: (path: string) => this.registAPI("delete", path, name, prefix),
      patch: (path: string) => this.registAPI("patch", path, name, prefix),
      define: (opt: APIDefine<T>) => this.defineAPI(opt, name, prefix),
      before: (...fn: Array<T>) => {
        this.groupInfo[name].before.push(...fn);
        return group;
      },
      middleware: (...fn: Array<T>) => {
        this.groupInfo[name].middleware.push(...fn);
        return group;
      },
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
      ctx.request.$params = apiParamsCheck(
        ereat,
        schema,
        ctx.request.params,
        ctx.request.query,
        ctx.request.body,
        ctx.request.headers
      );
      ctx.next();
    };
  }

  public checkerExpress<U, V, W>(ereat: ERest<T>, schema: API): (req: U, res: V, next: W) => void {
    return function apiParamsChecker(req: any, res: any, next: any) {
      req.$params = apiParamsCheck(ereat, schema, req.params, req.query, req.body, req.headers);
      next();
    };
  }

  public checkerKoa<U, V, W>(erest: ERest<T>, schema: API): (req: U, res: V, next: W) => void {
    return async function apiParamsCheckerKoa(ctx: any, next: any) {
      ctx.$params = apiParamsCheck(
        erest,
        schema,
        ctx.params, // For path parameters
        ctx.request.query, // For query parameters
        ctx.request.body, // For body parameters, ensure body parsing middleware is used
        ctx.request.headers // For headers
      );
      await next();
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

  public bindKoaRouterToApp(app: any, KoaRouter: any, checker: (erest: ERest<T>, schema: API<T>) => T) {
    if (!this.forceGroup) {
      throw this.error.internalError("没有开启 forceGroup，请使用 bindRouterToKoa");
    }
    const routes = new Map();

    for (const [key, schema] of this.apiInfo.$apis.entries()) {
      schema.init(this);
      const groupInfo = this.groupInfo[schema.options.group] || { before: [], middleware: [] };
      const prefix = groupInfo.prefix || camelCase2underscore(schema.options.group || "");
      debug("bindGroupToKoaApp (api): %s - %s", key, prefix);

      let route = routes.get(prefix);
      if (!route) {
        const routerPrefix = prefix ? (prefix[0] === "/" ? prefix : "/" + prefix) : undefined;
        route = new KoaRouter(routerPrefix ? { prefix: routerPrefix } : {});
        routes.set(prefix, route);
      }

      const handlers = [
        ...(this.apiInfo.beforeHooks as any),
        ...(groupInfo.before as any),
        ...(schema.options.beforeHooks as any),
        checker(this as unknown as ERest<T>, schema as API<T>),
        ...(groupInfo.middleware as any),
        ...(schema.options.middlewares as any),
        schema.options.handler,
      ].filter((h) => typeof h === "function");

      const routeMethod = schema.options.method.toLowerCase();
      if (typeof route[routeMethod] === "function") {
        route[routeMethod](schema.options.path, ...handlers);
      } else {
        // This case should ideally not be hit if SUPPORT_METHODS is respected
        console.error(`ERest: Invalid method ${routeMethod} for Koa group router for path ${schema.options.path}.`);
      }
    }

    for (const [key, groupRouter] of routes.entries()) {
      debug("bindGroupToKoaApp - applying router for prefix: %s", key);
      app.use(groupRouter.routes());
      app.use(groupRouter.allowedMethods());
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
      const groupInfo = this.groupInfo[schema.options.group] || {};
      const prefix = groupInfo.prefix || camelCase2underscore(schema.options.group || "");
      debug("bindGroupToApp: %s - %s", key, prefix);
      let route = routes.get(prefix);
      if (!route) {
        route = new Router();
        routes.set(prefix, route);
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
      const k = key[0] === "/" ? key : "/" + key;
      app.use(k, value);
    }
  }
}
