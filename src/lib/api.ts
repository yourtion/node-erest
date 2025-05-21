/**
 * @file API Scheme
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import assert from "assert";
import { pathToRegexp } from "path-to-regexp";
import * as z from 'zod';
import { api as debug } from "./debug";
import { getSchemaKey, SourceResult, getRealPath } from "./utils";
import type ERest from ".";

export type TYPE_RESPONSE = string | z.ZodTypeAny;

export interface IExample {
  name?: string | undefined;
  path?: string;
  headers?: Record<string, any>;
  input?: Record<string, any>;
  output?: Record<string, any>;
}

// Helper type for validated parameters
export type ValidatedParams<
  TQuery extends z.AnyZodObject | undefined,
  TParams extends z.AnyZodObject | undefined,
  TBody extends z.AnyZodObject | undefined,
  THeaders extends z.AnyZodObject | undefined,
> = (THeaders extends z.AnyZodObject ? z.infer<THeaders> : {}) &
  (TQuery extends z.AnyZodObject ? z.infer<TQuery> : {}) &
  (TParams extends z.AnyZodObject ? z.infer<TParams> : {}) &
  (TBody extends z.AnyZodObject ? z.infer<TBody> : {});

// Generic handler type
export type ERestHandler<
  TQuery extends z.AnyZodObject | undefined,
  TParams extends z.AnyZodObject | undefined,
  TBody extends z.AnyZodObject | undefined,
  THeaders extends z.AnyZodObject | undefined,
  TResponse = any, // Default response type
> = (validatedData: ValidatedParams<TQuery, TParams, TBody, THeaders>) => TResponse;

export type DEFAULT_HANDLER = ERestHandler<undefined, undefined, undefined, undefined, any>;

export const SUPPORT_METHOD = ["get", "post", "put", "delete", "patch"] as const;
export type SUPPORT_METHODS = typeof SUPPORT_METHOD[number];

export interface APICommon<THandlerType = DEFAULT_HANDLER> {
  method: SUPPORT_METHODS;
  path: string;
  title: string;
  description?: string;
  handler?: THandlerType;
  response?: TYPE_RESPONSE;
}

export interface APIDefine<
  THandler = DEFAULT_HANDLER, // This will become ERestHandler via API class default
  TQuery extends z.AnyZodObject | undefined = undefined,
  TParams extends z.AnyZodObject | undefined = undefined,
  TBody extends z.AnyZodObject | undefined = undefined,
  THeaders extends z.AnyZodObject | undefined = undefined,
> extends APICommon<THandler> { // THandler here will be the specific ERestHandler
  group?: string;
  headers?: THeaders;
  query?: TQuery;
  body?: TBody;
  params?: TParams;
  required?: string[];
  requiredOneOf?: string[];
  before?: Array<THandler>; // Use THandler for hooks as well
  middlewares?: Array<THandler>; // Use THandler for middlewares
  // handler?: THandler; // Already in APICommon
  mock?: Record<string, any>;
}

export interface APIOption<
  THandler,
  TQuery extends z.AnyZodObject | undefined,
  TParams extends z.AnyZodObject | undefined,
  TBody extends z.AnyZodObject | undefined,
  THeaders extends z.AnyZodObject | undefined,
> extends Record<string, any> {
  group: string;
  realPath: string;
  examples: IExample[];
  beforeHooks: Set<THandler>;
  middlewares: Set<THandler>;
  required: Set<string>;
  requiredOneOf: string[][];
  headers?: THeaders;
  query?: TQuery;
  body?: TBody;
  params?: TParams;
  _allParams: Map<string, z.ZodTypeAny>;
  mock?: Record<string, any>;
  tested: boolean;
  response?: TYPE_RESPONSE;
  responseSchema?: z.ZodTypeAny;
  handler?: THandler; // Add handler to APIOption
}

export default class API<
  TQuery extends z.AnyZodObject | undefined = undefined,
  TParams extends z.AnyZodObject | undefined = undefined,
  TBody extends z.AnyZodObject | undefined = undefined,
  THeaders extends z.AnyZodObject | undefined = undefined,
  THandler extends ERestHandler<TQuery, TParams, TBody, THeaders, any> = ERestHandler<TQuery, TParams, TBody, THeaders, any>,
> {
  public key: string;
  public pathTestRegExp: RegExp;
  public inited: boolean;
  public options: APIOption<THandler, TQuery, TParams, TBody, THeaders>;

  /**
   * 构造函数
   */
  constructor(method: SUPPORT_METHODS, path: string, sourceFile: SourceResult, group?: string, prefix?: string) {
    assert(typeof method === "string", "`method`必须是字符串类型");
    assert(
      SUPPORT_METHOD.indexOf(method.toLowerCase() as SUPPORT_METHODS) !== -1,
      "`method`必须是以下请求方法中的一个：" + SUPPORT_METHOD
    );
    assert(typeof path === "string", "`path`必须是字符串类型");
    assert(path[0] === "/", '`path`必须以"/"开头');
    if (prefix) assert(prefix[0] === "/", '`prefix`必须以"/"开头');

    this.key = getSchemaKey(method, path, prefix || group);

    this.options = {
      sourceFile,
      method: method.toLowerCase() as SUPPORT_METHODS,
      path,
      realPath: getRealPath(this.key),
      examples: [],
      required: new Set(),
      requiredOneOf: [],
      beforeHooks: new Set(),
      middlewares: new Set(),
      query: undefined as TQuery,
      body: undefined as TBody,
      params: undefined as TParams,
      headers: undefined as THeaders,
      handler: undefined as THandler | undefined, // Initialize handler
      _allParams: new Map<string, z.ZodTypeAny>(),
      group: group || "",
      tested: false,
    };

    this.pathTestRegExp = pathToRegexp(this.options.realPath);
    this.inited = false;

    debug("new: %s %s from %s", method, path, sourceFile.absolute);
  }

  public static define<
    TQ extends z.AnyZodObject | undefined,
    TP extends z.AnyZodObject | undefined,
    TB extends z.AnyZodObject | undefined,
    TH extends z.AnyZodObject | undefined,
    TResp = any, // Response type for the handler
    THandlerFn extends ERestHandler<TQ, TP, TB, TH, TResp> = ERestHandler<TQ, TP, TB, TH, TResp>,
  >(options: APIDefine<THandlerFn, TQ, TP, TB, TH>, sourceFile: SourceResult, group?: string, prefix?: string) {
    const schema = new API<TQ, TP, TB, TH, THandlerFn>(options.method, options.path, sourceFile, group, prefix);
    schema.title(options.title);
    const g = group || options.group;
    if (g) {
      schema.group(g);
    }
    if (options.description) {
      schema.description(options.description);
    }
    if (options.response) {
      schema.response(options.response);
    }
    if (options.body) { // options.body will be TBody
      schema.body(options.body);
    }
    if (options.query) { // options.query will be TQuery
      schema.query(options.query);
    }
    if (options.params) { // options.params will be TParams
      schema.params(options.params);
    }
    if (options.headers) { // options.headers will be THeaders
      schema.headers(options.headers);
    }
    if (options.required) {
      schema.required(options.required);
    }
    if (options.requiredOneOf) {
      schema.requiredOneOf(options.requiredOneOf);
    }
    if (options.middlewares && options.middlewares.length > 0) {
      schema.middlewares(...options.middlewares);
    }
    if (options.before && options.before.length > 0) {
      schema.before(...options.before);
    }
    if (options.handler) {
      schema.register(options.handler);
    }
    if (options.mock) {
      schema.mock(options.mock);
    }
    return schema;
  }

  /**
   * 检查是否已经完成初始化，如果是则报错
   */
  private checkInited() {
    if (this.inited) {
      throw new Error(`${this.key}已经完成初始化，不能再进行更改`);
    }
  }

  /**
   * 检查URL是否符合API规则
   */
  public pathTest(method: SUPPORT_METHODS, path: string) {
    return this.options.method === method.toLowerCase() && this.pathTestRegExp.test(path);
  }

  /**
   * API标题
   */
  public title(title: string) {
    this.checkInited();
    assert(typeof title === "string", "`title`必须是字符串类型");
    this.options.title = title;
    return this;
  }

  /**
   * API描述
   */
  public description(description: string) {
    this.checkInited();
    assert(typeof description === "string", "`description`必须是字符串类型");
    this.options.description = description;
    return this;
  }

  /**
   * API分组
   */
  public group(group: string) {
    this.checkInited();
    assert(typeof group === "string", "`group`必须是字符串类型");
    this.options.group = group;
    return this;
  }

  private addExample(example: IExample) {
    this.options.examples.push(example);
  }

  /**
   * API使用例子
   */
  public example(example: IExample) {
    // this.checkInited();
    assert(example.input && typeof example.input === "object", "`input`必须是一个对象");
    assert(example.output && typeof example.output === "object", "`output`必须是一个对象");
    this.addExample(example);
    return this;
  }

  /**
   * 输出结果对象
   */
  public response(response: TYPE_RESPONSE) {
    // assert(typeof response === "object", "`schema`必须是一个对象");
    this.options.response = response;
    return this;
  }

  /**
   * 输入参数
   */
  private setParam(name: string, options: z.ZodTypeAny, place: string) {
    this.checkInited();

    assert(typeof name === "string", "`name`必须是字符串类型");
    assert(
      place && ["query", "body", "params", "headers"].indexOf(place) > -1,
      '`place` 必须是 "query" "body", "params", "headers"'
    );
    assert(name.indexOf(" ") === -1, "`name`不能包含空格");
    assert(name[0] !== "$", '`name`不能以"$"开头');
    assert(!(name in this.options._allParams), `参数 ${name} 已存在`);

    assert(options && (typeof options === "string" || typeof options === "object"));

    this.options._allParams.set(name, options);
    this.options[place][name] = options;
  }

  /**
   * 输入参数
   */
  private setParams(place: string, obj: z.AnyZodObject) {
    // This method might need rethinking with fluent generics.
    // For now, it's used by API.define, so keep its basic shape
    // but the fluent methods below will directly set options.
    this.options[place] = obj; // This is a simplification
    for (const [key, o] of Object.entries(obj.shape)) {
      this.options._allParams.set(key, o as z.ZodTypeAny);
    }
  }

  /**
   * Body 参数
   */
  public body<B extends z.AnyZodObject>(schema: B): API<TQuery, TParams, B, THeaders, ERestHandler<TQuery, TParams, B, THeaders, any>> {
    this.checkInited();
    this.options.body = schema;
    for (const [key, o] of Object.entries(schema.shape)) {
      this.options._allParams.set(key, o as z.ZodTypeAny);
    }
    return this as unknown as API<TQuery, TParams, B, THeaders, ERestHandler<TQuery, TParams, B, THeaders, any>>;
  }

  /**
   * Query 参数
   */
  public query<Q extends z.AnyZodObject>(schema: Q): API<Q, TParams, TBody, THeaders, ERestHandler<Q, TParams, TBody, THeaders, any>> {
    this.checkInited();
    this.options.query = schema;
    for (const [key, o] of Object.entries(schema.shape)) {
      this.options._allParams.set(key, o as z.ZodTypeAny);
    }
    return this as unknown as API<Q, TParams, TBody, THeaders, ERestHandler<Q, TParams, TBody, THeaders, any>>;
  }

  /**
   * Param 参数
   */
  public params<P extends z.AnyZodObject>(schema: P): API<TQuery, P, TBody, THeaders, ERestHandler<TQuery, P, TBody, THeaders, any>> {
    this.checkInited();
    this.options.params = schema;
    for (const [key, o] of Object.entries(schema.shape)) {
      this.options._allParams.set(key, o as z.ZodTypeAny);
    }
    return this as unknown as API<TQuery, P, TBody, THeaders, ERestHandler<TQuery, P, TBody, THeaders, any>>;
  }

  public headers<H extends z.AnyZodObject>(schema: H): API<TQuery, TParams, TBody, H, ERestHandler<TQuery, TParams, TBody, H, any>> {
    this.checkInited();
    this.options.headers = schema;
    for (const [key, o] of Object.entries(schema.shape)) {
      this.options._allParams.set(key, o as z.ZodTypeAny);
    }
    return this as unknown as API<TQuery, TParams, TBody, H, ERestHandler<TQuery, TParams, TBody, H, any>>;
  }

  /**
   * 必填参数
   */
  public required(list: string[]) {
    this.checkInited();
    for (const item of list) {
      assert(typeof item === "string", "`name`必须是字符串类型");
      this.options.required.add(item);
    }
    return this;
  }

  /**
   * 多选一必填参数
   */
  public requiredOneOf(list: string[]) {
    this.checkInited();
    if (list.length > 0) {
      for (const item of list) {
        assert(typeof item === "string", "`name`必须是字符串类型");
      }
      this.options.requiredOneOf.push(list);
    }
    return this;
  }

  /**
   * 中间件
   */
  public middlewares(...list: Array<THandler>) {
    this.checkInited();
    for (const mid of list) {
      assert(typeof mid === "function", "中间件必须是Function类型");
      this.options.middlewares.add(mid);
    }
    return this;
  }

  /**
   * 注册执行之前的钩子
   */
  public before(...list: Array<THandler>) {
    this.checkInited();
    for (const hook of list) {
      assert(typeof hook === "function", "钩子名称必须是Function类型");
      this.options.beforeHooks.add(hook);
    }
    return this;
  }

  /**
   * 注册处理函数
   */
  public register(fn: THandler): API<TQuery, TParams, TBody, THeaders, THandler> {
    this.checkInited();
    assert(typeof fn === "function", "处理函数必须是一个函数类型");
    this.options.handler = fn;
    return this as unknown as API<TQuery, TParams, TBody, THeaders, THandler>;
  }

  public mock(data?: Record<string, any>) {
    this.checkInited();
    this.options.mock = data || {};
  }

  public init(parent: ERest<any>) {
    this.checkInited();

    assert(this.options.group, `请为 API ${this.key} 选择一个分组`);
    assert(
      this.options.group && this.options.group in parent.privateInfo.groups,
      `请先配置 ${this.options.group} 分组`
    );

    // 初始化时参数类型检查
    for (const [name, options] of this.options._allParams.entries()) {
      const typeName = options.type;
      const type = parent.type.has(typeName) && parent.type.get(typeName).info;
      // TODO: Re-implement logic with Zod
      // const typeName = options.type;
      // const type = parent.type.has(typeName) && parent.type.get(typeName).info;
      // if (type) {
      //   // 基础类型
      //   if (options.required) this.options.required.add(name);
      //   if (type.isParamsRequired && options.params === undefined) {
      //     throw new Error(`${typeName} is require a params`);
      //   }
      //   if (options.params && type.paramsChecker) {
      //     assert(type.paramsChecker(options.params), `test type params failed`);
      //   }
      // } else {
      //   // schema 类型
      //   const schemaName = parseTypeName(typeName);
      //   assert(parent.schema.has(schemaName.name), `please register schema ${schemaName}`);
      // }
    }

    if (this.options.response) {
      if (typeof this.options.response === "string") {
        // TODO: Handle named schemas if this feature is kept
        // this.options.responseSchema = parent.schema.get(this.options.response);
      } else {
        // Assumes response is a Zod schema
        this.options.responseSchema = this.options.response;
      }
      // else if (this.options.response instanceof SchemaType) {
      //   this.options.responseSchema = this.options.response;
      // } else if (typeof this.options.response.type === "string") {
      //   this.options.responseSchema = this.options.response as ISchemaType;
      // } else {
      //   this.options.responseSchema = parent.schema.create(this.options.response as any);
      // }
    }

    if (this.options.mock && parent.privateInfo.mockHandler && !this.options.handler) {
      this.options.handler = parent.privateInfo.mockHandler(this.options.mock);
    }

    this.inited = true;
  }
}
