/**
 * @file API Scheme
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import { strict as assert } from "node:assert";
import { ZodRawShape, ZodType, z } from "zod";
import {
  buildHandlerChain,
  type CheckerFunction,
  ExpressAdapter,
  type FrameworkAdapter,
  type FrameworkType,
  type IAdapterGroupInfo,
  KoaAdapter,
  LeizmWebAdapter,
} from "./adapters/index.js";
import API, { type APIDefine, type DEFAULT_HANDLER, type SUPPORT_METHODS } from "./api.js";
import { core as debug } from "./debug.js";
import { defaultErrors } from "./default/index.js";
import IAPIDoc, { type IDocGeneratePlugin, type IDocWritter } from "./extend/docs.js";
import IAPITest from "./extend/test.js";
import { ErrorManager } from "./manager/index.js";
import { zodTypeMap } from "./params.js";
import * as utils from "./utils.js";
import { camelCase2underscore, getCallerSourceLine, type ISupportMethds, type SourceResult } from "./utils.js";

export * from "./adapters/index.js";
export * from "./api.js";
export * from "./error.js";
export * from "./params.js";
export { z, ZodRawShape, ZodType };

import { ERestError } from "./error.js";

const missingParameter = (msg: string) =>
  new ERestError("MISSING_PARAM", `missing required parameter ${msg}`, { field: msg.replace(/'/g, "") });
const invalidParameter = (msg: string) =>
  new ERestError("INVALID_PARAM", `incorrect parameter ${msg}`, { field: msg.replace(/'/g, "").split(" ")[0] });
const internalError = (msg: string) => new ERestError("INTERNAL_ERROR", `internal error ${msg}`, undefined, 500);

/** Schema方法 */
export type genSchema<T> = Readonly<ISupportMethds<(path: string) => API<T>>>;

/** 组方法 */
export interface IGroup<T> extends Record<string, unknown>, genSchema<T> {
  define: (opt: APIDefine<T>) => API<T>;
  before: (...fn: T[]) => IGroup<T>;
  middleware: (...fn: T[]) => IGroup<T>;
}

/** API接口定义 */
export interface IApiInfo<T> extends Record<string, unknown>, genSchema<T> {
  readonly $apis: Map<string, API<T>>;
  define: (opt: APIDefine<T>) => API<T>;
  beforeHooks: Set<T>;
  afterHooks: Set<T>;
  docs?: IAPIDoc;
  formatOutputReverse?: (out: unknown) => [Error | null, unknown];
  docOutputFormat?: (out: unknown) => unknown;
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
export interface IDocOptions extends Record<string, unknown> {
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
  public shareTestData?: unknown;
  public utils = utils;

  private apiInfo: IApiInfo<T>;
  private testAgent: IAPITest = {} as IAPITest;
  private app: unknown;
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
  private mockHandler?: (data: unknown) => T;

  /** Framework adapters */
  private readonly adapters: {
    express: FrameworkAdapter<T>;
    koa: FrameworkAdapter<T>;
    leizmweb: FrameworkAdapter<T>;
  };

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
    value: (
      type: string,
      input: unknown,
      params?: unknown,
      format?: boolean
    ) => { ok: boolean; message: string; value: unknown };
  } {
    return {
      register: (name: string, schema: ZodType) => {
        this.typeRegistry.set(name, schema);
        this.apiInfo.docs?.invalidateCache();
        return this;
      },
      get: (name: string) => this.typeRegistry.get(name),
      has: (name: string) => this.typeRegistry.has(name),
      value: (type: string, input: unknown, _params?: unknown, _format?: boolean) => {
        const schema = this.typeRegistry.get(type) || zodTypeMap[type as keyof typeof zodTypeMap];
        if (!schema) {
          return { ok: false, message: `Unknown type: ${type}`, value: input };
        }
        try {
          const result = schema.parse(input);
          return { ok: true, message: "", value: result };
        } catch (error: unknown) {
          return { ok: false, message: error instanceof Error ? error.message : String(error), value: input };
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
    check: (name: string, value: unknown) => boolean;
  } {
    return {
      register: (name: string, schema: ZodType) => {
        this.schemaRegistry.set(name, schema);
        this.apiInfo.docs?.invalidateCache();
        return this;
      },
      get: (name: string) => {
        return this.schemaRegistry.get(name);
      },
      has: (name: string) => {
        return this.schemaRegistry.has(name);
      },
      check: (name: string, value: unknown) => {
        const schema = this.schemaRegistry.get(name);
        if (!schema) return false;
        try {
          schema.parse(value);
          return true;
        } catch {
          return false;
        }
      },
    };
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
      const gInfo = options.groups?.[g];
      this.groups[g] = typeof gInfo === "string" ? gInfo : gInfo?.name || "";
      const gI = typeof gInfo === "string" ? { name: gInfo } : gInfo;
      this.groupInfo[g] = Object.assign({ middleware: [], before: [] }, gI);
    }

    // API注册方法
    this.registAPI = (method: SUPPORT_METHODS, path: string, group?: string, prefix?: string) => {
      if (this.forceGroup) {
        assert(group, "使用 forceGroup 但是没有通过 group 注册");
        assert(group && group in this.groups, `请先配置 ${group} 类型`);
      } else {
        assert(!group, "请开启 forceGroup 再使用 group 功能");
      }
      const s = new API<T>(method, path, getCallerSourceLine(this.config.path), group, prefix);
      const s2 = this.apiInfo.$apis.get(s.key);
      assert(
        !s2,
        `尝试注册API：${s.key}（所在文件：${(s.options.sourceFile as SourceResult)?.absolute}）失败，因为该API已在文件${
          (s2?.options.sourceFile as SourceResult)?.absolute
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
        `尝试注册API：${s.key}（所在文件：${(s.options.sourceFile as SourceResult)?.absolute}）失败，因为该API已在文件${
          (s2?.options.sourceFile as SourceResult)?.absolute
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
      return options.docs && options.docs[key] !== undefined ? (options.docs[key] as string | boolean) : def;
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

    // 初始化框架适配器
    this.adapters = {
      express: new ExpressAdapter<T>(),
      koa: new KoaAdapter<T>(),
      leizmweb: new LeizmWebAdapter<T>(),
    };
  }

  /**
   * 初始化测试系统
   * @param app APP或者serve实例，用于初始化测试 HTTP 服务
   * @param testPath 测试文件路径
   * @param docPath 输出文件路径
   */
  public initTest(app: unknown, testPath = process.cwd(), docPath = `${process.cwd()}/docs/`) {
    if (this.app && this.testAgent) {
      return;
    }
    debug("initTest: %s %s", testPath, docPath);
    this.app = app;
    this.testAgent = new IAPITest(this as ERest<unknown>, testPath);
    if (!this.api.docs) {
      this.api.docs = new IAPIDoc(this as ERest<unknown>);
    }
    this.genDocs(docPath);
  }

  /**
   * 设置测试格式化函数
   */
  public setFormatOutput(fn: (out: unknown) => [Error | null, unknown]) {
    this.apiInfo.formatOutputReverse = fn;
  }

  /**
   * 设置文档格式化函数
   */
  public setDocOutputFormat(fn: (out: unknown) => unknown) {
    this.apiInfo.docOutputFormat = fn;
  }

  /**
   * 设置文档格式化函数
   */
  public setDocWritter(fn: IDocWritter) {
    this.apiInfo.docs?.setWritter(fn);
  }

  public setMockHandler(fn: (data: unknown) => T) {
    this.mockHandler = fn;
  }

  /**
   * 注册文档生成组件
   */
  public addDocPlugin(name: string, plugin: IDocGeneratePlugin) {
    this.apiInfo.docs?.registerPlugin(name, plugin);
  }

  /**
   * 获取Swagger信息
   */
  public buildSwagger() {
    if (!this.api.docs) {
      this.api.docs = new IAPIDoc(this as ERest<unknown>);
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
  public group(name: string, info?: IGroupInfoOpt): IGroup<T>;
  public group(name: string, desc?: string): IGroup<T>;
  public group(name: string, infoOrDesc?: IGroupInfoOpt | string): IGroup<T> {
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
  public genDocs(savePath = `${process.cwd()}/docs/`, onExit = true) {
    if (!this.api.docs) {
      this.api.docs = new IAPIDoc(this as ERest<unknown>);
    }
    const docs = this.api.docs;
    docs.genDocs();
    if (onExit) {
      docs.saveOnExit(savePath);
    } else {
      docs.save(savePath);
    }
  }

  /**
   * 创建 @leizm/web 框架的参数检查中间件
   * 注意：此方法应通过 bindRouter 等方法传入，会自动绑定 this 上下文
   * @deprecated 推荐使用 bind() 方法
   */
  public checkerLeiWeb: CheckerFunction<T> = (_erest: ERest<T>, schema: API<T>) => {
    return this.adapters.leizmweb.makeParamsChecker(this, schema);
  };

  /**
   * 创建 Express 框架的参数检查中间件
   * 注意：此方法应通过 bindRouter 等方法传入，会自动绑定 this 上下文
   * @deprecated 推荐使用 bind() 方法
   */
  public checkerExpress: CheckerFunction<T> = (_erest: ERest<T>, schema: API<T>) => {
    return this.adapters.express.makeParamsChecker(this, schema);
  };

  /**
   * 创建 Koa 框架的参数检查中间件
   * 注意：此方法应通过 bindRouter 等方法传入，会自动绑定 this 上下文
   * @deprecated 推荐使用 bind() 方法
   */
  public checkerKoa: CheckerFunction<T> = (_erest: ERest<T>, schema: API<T>) => {
    return this.adapters.koa.makeParamsChecker(this, schema);
  };

  /**
   * 绑定路由（非 forceGroup 模式）
   * 加载顺序：beforeHooks -> apiCheckParams -> middlewares -> handler
   *
   * @param router 路由实例
   * @param checker 参数检查函数
   * @deprecated 推荐使用 bind() 方法
   */
  public bindRouter(router: unknown, checker: CheckerFunction<T>) {
    if (this.forceGroup) {
      throw this.error.internalError("使用了 forceGroup，请使用bindGroupToApp");
    }
    // 标准化后 handler 链需经 adapter.bindRoute 的 compose 包装（直接展开会导致
    // 标准化 Middleware 收到框架原生 ctx 而挂起）。根据传入的 checker 推断框架 adapter。
    const adapter =
      checker === this.checkerKoa
        ? this.adapters.koa
        : checker === this.checkerLeiWeb
          ? this.adapters.leizmweb
          : this.adapters.express;
    for (const [key, schema] of this.apiInfo.$apis.entries()) {
      debug("bind router: %s", key);
      schema.init(this as ERest<unknown>);

      if (typeof schema.options.handler !== "function") {
        throw this.error.internalError(`API ${key} 没有注册处理函数`);
      }

      const handlers = buildHandlerChain({
        beforeHooks: this.apiInfo.beforeHooks,
        api: schema,
        checker: checker(this, schema),
      });

      adapter.bindRoute(router, schema, handlers);
    }
  }

  /**
   * 绑定路由到 Koa 应用（forceGroup 模式）
   *
   * @param app Koa 应用实例
   * @param KoaRouter koa-router 构造函数
   * @param checker 参数检查函数
   * @deprecated 推荐使用 bind() 方法
   */
  public bindKoaRouterToApp(app: unknown, KoaRouter: unknown, checker: CheckerFunction<T>) {
    if (!this.forceGroup) {
      throw this.error.internalError("没有开启 forceGroup，请使用 bindRouterToKoa");
    }

    const adapter = this.adapters.koa;
    const routes = new Map<string, unknown>();

    for (const [key, schema] of this.apiInfo.$apis.entries()) {
      schema.init(this as ERest<unknown>);

      if (typeof schema.options.handler !== "function") {
        throw this.error.internalError(`API ${key} 没有注册处理函数`);
      }

      const groupInfo = this.groupInfo[schema.options.group] || { before: [], middleware: [] };
      const prefix = groupInfo.prefix || camelCase2underscore(schema.options.group || "");
      debug("bindGroupToKoaApp (api): %s - %s", key, prefix);

      let route = routes.get(prefix);
      if (!route) {
        route = adapter.createGroupRouter(KoaRouter, prefix);
        routes.set(prefix, route);
      }

      const handlers = buildHandlerChain({
        beforeHooks: this.apiInfo.beforeHooks,
        api: schema,
        checker: checker(this, schema),
        groupInfo: groupInfo as IAdapterGroupInfo<T>,
      });

      adapter.bindRoute(route, schema, handlers);
    }

    for (const [key, groupRouter] of routes.entries()) {
      debug("bindGroupToKoaApp - applying router for prefix: %s", key);
      adapter.attachGroupRouter(app, groupRouter, key);
    }
  }

  /**
   * 绑定路由到 Express 应用（forceGroup 模式）
   *
   * @param app Express 应用实例
   * @param Router express.Router 构造函数
   * @param checker 参数检查函数
   * @deprecated 推荐使用 bind() 方法
   */
  public bindRouterToApp(app: unknown, Router: unknown, checker: CheckerFunction<T>) {
    if (!this.forceGroup) {
      throw this.error.internalError("没有开启 forceGroup，请使用bindRouter");
    }

    const adapter =
      checker === this.checkerKoa
        ? this.adapters.koa
        : checker === this.checkerLeiWeb
          ? this.adapters.leizmweb
          : this.adapters.express;
    const routes = new Map<string, unknown>();

    for (const [key, schema] of this.apiInfo.$apis.entries()) {
      schema.init(this as ERest<unknown>);

      if (typeof schema.options.handler !== "function") {
        throw this.error.internalError(`API ${key} 没有注册处理函数`);
      }

      const groupInfo = this.groupInfo[schema.options.group] || { before: [], middleware: [] };
      const prefix = groupInfo.prefix || camelCase2underscore(schema.options.group || "");
      debug("bindGroupToApp: %s - %s", key, prefix);

      let route = routes.get(prefix);
      if (!route) {
        route = adapter.createGroupRouter(Router, prefix);
        routes.set(prefix, route);
      }

      const handlers = buildHandlerChain({
        beforeHooks: this.apiInfo.beforeHooks,
        api: schema,
        checker: checker(this, schema),
        groupInfo: groupInfo as IAdapterGroupInfo<T>,
      });

      adapter.bindRoute(route, schema, handlers);
    }

    for (const [key, groupRouter] of routes.entries()) {
      debug("bindGroupToApp - %s", key);
      adapter.attachGroupRouter(app, groupRouter, key);
    }
  }

  /**
   * 统一绑定 API 到应用（推荐使用）
   * 支持 Express、Koa 和 @leizm/web 框架
   *
   * @param options 绑定选项
   */
  public bind(options: {
    /** 框架类型 */
    framework: FrameworkType;
    /** 应用实例 */
    app?: unknown;
    /** 路由实例（非 forceGroup 模式）或路由构造函数（forceGroup 模式） */
    router?: unknown;
  }) {
    const { framework, app, router } = options;
    const adapter = this.adapters[framework];

    if (this.forceGroup) {
      if (!app || !router) {
        throw this.error.internalError("forceGroup 模式需要提供 app 和 router");
      }

      const routes = new Map<string, unknown>();

      for (const [key, schema] of this.apiInfo.$apis.entries()) {
        schema.init(this as ERest<unknown>);

        if (typeof schema.options.handler !== "function") {
          throw this.error.internalError(`API ${key} 没有注册处理函数`);
        }

        const groupInfo = this.groupInfo[schema.options.group] || { before: [], middleware: [] };
        const prefix = groupInfo.prefix || camelCase2underscore(schema.options.group || "");
        debug("bind (%s): %s - %s", framework, key, prefix);

        let route = routes.get(prefix);
        if (!route) {
          route = adapter.createGroupRouter(router, prefix);
          routes.set(prefix, route);
        }

        const checker = adapter.makeParamsChecker(this, schema);
        const handlers = buildHandlerChain({
          beforeHooks: this.apiInfo.beforeHooks,
          api: schema,
          checker,
          groupInfo: groupInfo as IAdapterGroupInfo<T>,
        });

        adapter.bindRoute(route, schema, handlers);
      }

      for (const [key, groupRouter] of routes.entries()) {
        debug("bind (%s) - applying router for prefix: %s", framework, key);
        adapter.attachGroupRouter(app, groupRouter, key);
      }
    } else {
      if (!router) {
        throw this.error.internalError("非 forceGroup 模式需要提供 router");
      }

      for (const [key, schema] of this.apiInfo.$apis.entries()) {
        debug("bind (%s): %s", framework, key);
        schema.init(this as ERest<unknown>);

        if (typeof schema.options.handler !== "function") {
          throw this.error.internalError(`API ${key} 没有注册处理函数`);
        }

        const checker = adapter.makeParamsChecker(this, schema);
        const handlers = buildHandlerChain({
          beforeHooks: this.apiInfo.beforeHooks,
          api: schema,
          checker,
        });

        adapter.bindRoute(router, schema, handlers);
      }
    }
  }
}
