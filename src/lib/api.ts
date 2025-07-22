/**
 * @file API Scheme
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import { strict as assert } from "assert";
import { pathToRegexp } from "path-to-regexp";
import { type ZodTypeAny, z } from "zod";
import type ERest from ".";
import { api as debug } from "./debug";
import type { ISchemaType, SchemaType } from "./params";
import { isISchemaTypeRecord, isZodSchema } from "./params";
import { getRealPath, getSchemaKey, type SourceResult } from "./utils";

export type TYPE_RESPONSE = string | SchemaType | ISchemaType | Record<string, ISchemaType>;

export interface IExample {
  name?: string | undefined;
  path?: string;
  headers?: Record<string, any>;
  input?: Record<string, any>;
  output?: Record<string, any>;
}

export type DEFAULT_HANDLER = (...args: any[]) => any;
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
  mock?: Record<string, any>;
}

export interface APIOption<T> extends Record<string, any> {
  group: string;
  realPath: string;
  examples: IExample[];
  beforeHooks: Set<T>;
  middlewares: Set<T>;
  required: Set<string>;
  requiredOneOf: string[][];
  _allParams: Map<string, ISchemaType>;
  mock?: Record<string, any>;
  tested: boolean;
  response?: TYPE_RESPONSE;
  responseSchema?: SchemaType | ISchemaType;
  // Zod schema 支持
  querySchema?: z.ZodObject<any>;
  bodySchema?: z.ZodObject<any>;
  paramsSchema?: z.ZodObject<any>;
  headersSchema?: z.ZodObject<any>;
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
    this.options[place][name] = options;
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
    const hasISchemaType = Object.keys(this.options[place]).length > 0;
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
   * 注册强类型处理函数 (基于 zod schema)
   */
  public registerTyped<
    TQuery extends z.ZodRawShape = {},
    TBody extends z.ZodRawShape = {},
    TParams extends z.ZodRawShape = {},
    THeaders extends z.ZodRawShape = {},
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
      res: any
    ) => z.infer<TResponse> | Promise<z.infer<TResponse>>
  ) {
    this.checkInited();

    // 设置 zod schemas
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

    // 包装处理函数，添加类型验证
    const wrappedHandler = async (req: any, res: any) => {
      try {
        const validatedReq = {
          query: schemas.query ? schemas.query.parse(req.query || {}) : ({} as any),
          body: schemas.body ? schemas.body.parse(req.body || {}) : ({} as any),
          params: schemas.params ? schemas.params.parse(req.params || {}) : ({} as any),
          headers: schemas.headers ? schemas.headers.parse(req.headers || {}) : ({} as any),
        };

        const result = await handler(validatedReq as any, res);

        // 验证响应
        if (schemas.response) {
          return schemas.response.parse(result);
        }

        return result;
      } catch (error: any) {
        if (error.name === "ZodError") {
          throw new Error(
            `Validation failed: ${error.errors.map((e: any) => `${e.path.join(".")}: ${e.message}`).join(", ")}`
          );
        }
        throw error;
      }
    };

    this.options.handler = wrappedHandler as T;
    return this;
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
        // 检查是否为内置的 zod 类型
        const builtinTypes = [
          "string",
          "number",
          "integer",
          "boolean",
          "date",
          "email",
          "url",
          "uuid",
          "array",
          "object",
          "any",
          "JSON",
          "ENUM",
          "IntArray",
          "Date",
          "Array",
          "Number",
          "String",
          "Boolean",
          "Integer",
        ];
        if (!builtinTypes.includes(baseTypeName)) {
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
        this.options.responseSchema = parent.schema.createZodSchema(this.options.response as any);
      }
    }

    if (this.options.mock && parent.privateInfo.mockHandler && !this.options.handler) {
      this.options.handler = parent.privateInfo.mockHandler(this.options.mock);
    }

    this.inited = true;
  }
}
