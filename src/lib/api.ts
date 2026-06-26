/**
 * @file API Scheme
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import { strict as assert } from "node:assert";
import { pathToRegexp } from "path-to-regexp";
import { type ZodTypeAny, z } from "zod";
import type { Context, Middleware, Reply } from "./adapters/types.js";
import { api as debug } from "./debug.js";
import type ERest from "./index.js";
import type { ISchemaType, SchemaType } from "./params.js";
import { buildZodObjectFromSchemaType, isISchemaTypeRecord, isZodSchema, zodTypeMap } from "./params.js";
import { getRealPath, getSchemaKey, type SourceResult } from "./utils.js";

export type TYPE_RESPONSE = string | SchemaType | ISchemaType | Record<string, ISchemaType>;

export interface IExample {
  name?: string | undefined;
  path?: string;
  headers?: Record<string, unknown>;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
}

export type DEFAULT_HANDLER = (...args: unknown[]) => unknown;
export const SUPPORT_METHOD = ["get", "post", "put", "delete", "patch"] as const;
export type SUPPORT_METHODS = (typeof SUPPORT_METHOD)[number];

export interface APICommon<T = DEFAULT_HANDLER> {
  method: SUPPORT_METHODS;
  path: string;
  title: string;
  description?: string;
  handler?: T;
  response?: TYPE_RESPONSE;
}

export interface APIDefine<T> extends APICommon<T> {
  group?: string;
  headers?: Record<string, ISchemaType>;
  query?: Record<string, ISchemaType>;
  body?: Record<string, ISchemaType>;
  params?: Record<string, ISchemaType>;
  required?: string[];
  requiredOneOf?: string[];
  before?: Array<T>;
  middlewares?: Array<T>;
  handler?: T;
  mock?: Record<string, unknown>;
}

export interface APIOption<T> extends Record<string, unknown> {
  group: string;
  realPath: string;
  examples: IExample[];
  beforeHooks: Set<T>;
  middlewares: Set<T>;
  required: Set<string>;
  requiredOneOf: string[][];
  _allParams: Map<string, ISchemaType>;
  mock?: Record<string, unknown>;
  tested: boolean;
  response?: TYPE_RESPONSE;
  responseSchema?: SchemaType | ISchemaType;
  // Zod schema 支持
  querySchema?: z.ZodObject<z.ZodRawShape>;
  bodySchema?: z.ZodObject<z.ZodRawShape>;
  paramsSchema?: z.ZodObject<z.ZodRawShape>;
  headersSchema?: z.ZodObject<z.ZodRawShape>;
}

export default class API<T = DEFAULT_HANDLER> {
  public key: string;
  public pathTestRegExp: RegExp;
  public inited: boolean;
  public options: APIOption<T>;

  /**
   * 构造函数
   */
  constructor(method: SUPPORT_METHODS, path: string, sourceFile: SourceResult, group?: string, prefix?: string) {
    assert(typeof method === "string", "`method`必须是字符串类型");
    assert(
      SUPPORT_METHOD.indexOf(method.toLowerCase() as SUPPORT_METHODS) !== -1,
      `\`method\`必须是以下请求方法中的一个：${SUPPORT_METHOD}`
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
      query: {} as Record<string, ISchemaType>,
      body: {} as Record<string, ISchemaType>,
      params: {} as Record<string, ISchemaType>,
      headers: {} as Record<string, ISchemaType>,
      _allParams: new Map<string, ISchemaType>(),
      group: group || "",
      tested: false,
    };

    this.pathTestRegExp = pathToRegexp(this.options.realPath);
    this.inited = false;

    debug("new: %s %s from %s", method, path, sourceFile.absolute);
  }

  public static define<T>(options: APIDefine<T>, sourceFile: SourceResult, group?: string, prefix?: string) {
    const schema = new API<T>(options.method, options.path, sourceFile, group, prefix);
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
    if (options.body) {
      schema.body(options.body);
    }
    if (options.query) {
      schema.query(options.query);
    }
    if (options.params) {
      schema.params(options.params);
    }
    if (options.headers) {
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
  private setParam(name: string, options: ISchemaType, place: string) {
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
    (this.options[place] as Record<string, ISchemaType>)[name] = options;
  }

  /**
   * 输入参数
   */
  private setParams(place: string, obj: Record<string, ISchemaType>) {
    for (const [key, o] of Object.entries(obj)) {
      this.setParam(key, o, place);
    }
  }

  /**
   * 检测混合使用并设置 Zod Schema
   */
  private setZodSchema(place: string, schema: z.ZodTypeAny) {
    this.checkInited();

    // 检查是否已经有 ISchemaType 参数
    const hasISchemaType = Object.keys(this.options[place] as Record<string, ISchemaType>).length > 0;
    if (hasISchemaType) {
      throw new Error(
        `Cannot mix ISchemaType and Zod schema in ${place}. Please use either ISchemaType or Zod schema, not both.`
      );
    }

    // 设置对应的 Zod Schema
    const schemaKey = `${place}Schema` as keyof typeof this.options;
    this.options[schemaKey] = schema;
  }

  /**
   * 检测混合使用并设置 ISchemaType 参数
   */
  private checkMixedUsage(place: string) {
    const schemaKey = `${place}Schema` as keyof typeof this.options;
    if (this.options[schemaKey]) {
      throw new Error(
        `Cannot mix ISchemaType and Zod schema in ${place}. Please use either ISchemaType or Zod schema, not both.`
      );
    }
  }

  /**
   * Body 参数 - 支持 ISchemaType 和原生 Zod Schema
   */
  public body(obj: Record<string, ISchemaType> | ZodTypeAny) {
    if (isZodSchema(obj)) {
      this.setZodSchema("body", obj);
    } else if (isISchemaTypeRecord(obj)) {
      this.checkMixedUsage("body");
      this.setParams("body", obj);
    } else {
      throw new Error("Body parameter must be either ISchemaType record or Zod schema");
    }
    return this;
  }

  /**
   * Query 参数 - 支持 ISchemaType 和原生 Zod Schema
   */
  public query(obj: Record<string, ISchemaType> | ZodTypeAny) {
    if (isZodSchema(obj)) {
      this.setZodSchema("query", obj);
    } else if (isISchemaTypeRecord(obj)) {
      this.checkMixedUsage("query");
      this.setParams("query", obj);
    } else {
      throw new Error("Query parameter must be either ISchemaType record or Zod schema");
    }
    return this;
  }

  /**
   * Param 参数 - 支持 ISchemaType 和原生 Zod Schema
   */
  public params(obj: Record<string, ISchemaType> | ZodTypeAny) {
    if (isZodSchema(obj)) {
      this.setZodSchema("params", obj);
    } else if (isISchemaTypeRecord(obj)) {
      this.checkMixedUsage("params");
      this.setParams("params", obj);
    } else {
      throw new Error("Params parameter must be either ISchemaType record or Zod schema");
    }
    return this;
  }

  /**
   * Headers 参数 - 支持 ISchemaType 和原生 Zod Schema
   */
  public headers(obj: Record<string, ISchemaType> | ZodTypeAny) {
    if (isZodSchema(obj)) {
      this.setZodSchema("headers", obj);
    } else if (isISchemaTypeRecord(obj)) {
      this.checkMixedUsage("headers");
      this.setParams("headers", obj);
    } else {
      throw new Error("Headers parameter must be either ISchemaType record or Zod schema");
    }
    return this;
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
  public middlewares(...list: Array<T>) {
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
  public before(...list: Array<T>) {
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
  public register(fn: T) {
    this.checkInited();
    assert(typeof fn === "function", "处理函数必须是一个函数类型");
    this.options.handler = fn;
    return this;
  }

  /**
   * 注册强类型处理函数 (基于 zod schema)。
   *
   * handler 签名为 `(req, reply)`，与框架无关：
   * - req.params / req.query / req.body / req.headers：分层校验后的参数，类型由 Zod schema 推导
   * - reply：框架无关的响应接口（{ status, json, send }），由各 adapter 注入
   *
   * 同一份 handler 可被 Express / Koa / @leizm/web 三个框架复用，无需关心 ctx/res 差异。
   * 校验由 adapter 的 checker 统一完成（注入到 req/ctx.$validated + $reply），handler 内不重复 parse。
   *
   * 若提供 response schema 且 handler 有返回值，返回值会经 schema 校验（适合只读/纯计算型 handler）。
   */
  public registerTyped<
    TQuery extends z.ZodRawShape = Record<string, never>,
    TBody extends z.ZodRawShape = Record<string, never>,
    TParams extends z.ZodRawShape = Record<string, never>,
    THeaders extends z.ZodRawShape = Record<string, never>,
    TResponse extends z.ZodTypeAny = z.ZodAny,
  >(
    schemas: {
      query?: z.ZodObject<TQuery>;
      body?: z.ZodObject<TBody>;
      params?: z.ZodObject<TParams>;
      headers?: z.ZodObject<THeaders>;
      response?: TResponse;
    },
    handler: (
      req: {
        query: z.infer<z.ZodObject<TQuery>>;
        body: z.infer<z.ZodObject<TBody>>;
        params: z.infer<z.ZodObject<TParams>>;
        headers: z.infer<z.ZodObject<THeaders>>;
      },
      reply: Reply
    ) => z.infer<TResponse> | Promise<z.infer<TResponse>> | void | Promise<void>
  ) {
    this.checkInited();

    // 设置 zod schemas（供 checker 校验 + 文档生成使用）
    if (schemas.query) {
      this.options.querySchema = schemas.query;
    }
    if (schemas.body) {
      this.options.bodySchema = schemas.body;
    }
    if (schemas.params) {
      this.options.paramsSchema = schemas.params;
    }
    if (schemas.headers) {
      this.options.headersSchema = schemas.headers;
    }
    if (schemas.response) {
      this.options.responseSchema = schemas.response;
    }

    // 包装处理函数：标准化签名 (ctx, next)。
    // 校验已由 checker 完成（填入 ctx.$validated），wrapper 从中读取分层校验参数，
    // 组装类型安全的 req 调用用户 handler。响应经 ctx.reply 写入。
    const wrappedHandler: Middleware = async (ctx) => {
      const validated = ctx.$validated ?? { params: {}, query: {}, body: {}, headers: {} };

      // 组装类型安全的 req：缺失的层级补空对象，保证 handler 内字段访问安全。
      // 此处运行时值已由 checker 校验，仅做拼装；类型断言对齐 handler 期望的推导类型。
      const typedReq = {
        params: (validated.params ?? {}) as z.infer<z.ZodObject<TParams>>,
        query: (validated.query ?? {}) as z.infer<z.ZodObject<TQuery>>,
        body: (validated.body ?? {}) as z.infer<z.ZodObject<TBody>>,
        headers: (validated.headers ?? {}) as z.infer<z.ZodObject<THeaders>>,
      } as {
        query: z.infer<z.ZodObject<TQuery>>;
        body: z.infer<z.ZodObject<TBody>>;
        params: z.infer<z.ZodObject<TParams>>;
        headers: z.infer<z.ZodObject<THeaders>>;
      };

      const result = handler(typedReq, ctx.reply);

      // 若 handler 返回了值且定义了 response schema，则校验返回值（纯计算型 handler 场景）
      if (schemas.response && result !== undefined) {
        const resolved = result;
        if (resolved instanceof Promise) {
          await resolved.then((v) => schemas.response!.parse(v));
        } else {
          schemas.response.parse(resolved);
        }
      }
    };

    this.options.handler = wrappedHandler as unknown as T;
    return this;
  }

  public mock(data?: Record<string, unknown>) {
    this.checkInited();
    this.options.mock = data || {};
    return this;
  }

  public init(parent: ERest<unknown>) {
    this.checkInited();

    assert(this.options.group, `请为 API ${this.key} 选择一个分组`);
    assert(
      this.options.group && this.options.group in parent.privateInfo.groups,
      `请先配置 ${this.options.group} 分组`
    );

    // 初始化时参数类型检查
    for (const [name, options] of this.options._allParams.entries()) {
      const typeName = options.type;

      // 特殊类型验证
      if (typeName === "ENUM") {
        if (!options.params || !Array.isArray(options.params)) {
          throw new Error("ENUM is require a params");
        }
      }

      // 检查是否为基础类型或已注册的自定义类型
      // 处理数组类型，如 'JsonSchema[]'
      const baseTypeName = typeName.endsWith("[]") ? typeName.slice(0, -2) : typeName;

      if (!parent.type.has(baseTypeName) && !parent.schema.has(baseTypeName)) {
        // 检查是否为内置的 zod 类型（从 zodTypeMap 派生，避免硬编码重复）
        const builtinTypes = new Set([
          ...Object.keys(zodTypeMap),
          // 兼容小写别名
          "integer",
        ]);
        if (!builtinTypes.has(baseTypeName)) {
          throw new Error(`Unknown type: ${baseTypeName}. Please register this type first.`);
        }
      }

      if (options.required) {
        this.options.required.add(name);
      }
    }

    if (this.options.response) {
      if (typeof this.options.response === "string") {
        this.options.responseSchema = parent.schema.get(this.options.response);
      } else if (this.options.response instanceof z.ZodType) {
        this.options.responseSchema = this.options.response;
      } else if (typeof (this.options.response as ISchemaType).type === "string") {
        this.options.responseSchema = this.options.response as ISchemaType;
      } else {
        this.options.responseSchema = parent.schema.createZodSchema(this.options.response as ISchemaType);
      }
    }

    // 预编译 ISchemaType Record 为 ZodObject，提升运行时性能
    this.precompileSchemas();

    if (this.options.mock && parent.privateInfo.mockHandler && !this.options.handler) {
      this.options.handler = parent.privateInfo.mockHandler(this.options.mock);
    }

    this.inited = true;
  }

  /**
   * 预编译 ISchemaType Record 为 ZodObject
   * 在 init 阶段执行，避免每次请求时重复创建 Zod schema
   */
  private precompileSchemas() {
    // 预编译 query schema
    if (!this.options.querySchema && this.options.query && Object.keys(this.options.query).length > 0) {
      debug("precompile query schema for %s", this.key);
      this.options.querySchema = buildZodObjectFromSchemaType(this.options.query as Record<string, ISchemaType>);
    }

    // 预编译 body schema
    if (!this.options.bodySchema && this.options.body && Object.keys(this.options.body).length > 0) {
      debug("precompile body schema for %s", this.key);
      this.options.bodySchema = buildZodObjectFromSchemaType(this.options.body as Record<string, ISchemaType>);
    }

    // 预编译 params schema
    if (!this.options.paramsSchema && this.options.params && Object.keys(this.options.params).length > 0) {
      debug("precompile params schema for %s", this.key);
      this.options.paramsSchema = buildZodObjectFromSchemaType(this.options.params as Record<string, ISchemaType>);
    }

    // 预编译 headers schema
    if (!this.options.headersSchema && this.options.headers && Object.keys(this.options.headers).length > 0) {
      debug("precompile headers schema for %s", this.key);
      this.options.headersSchema = buildZodObjectFromSchemaType(this.options.headers as Record<string, ISchemaType>);
    }
  }
}
