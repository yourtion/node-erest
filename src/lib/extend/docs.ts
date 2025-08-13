/**
 * @file API Docs
 * 参考 hojs
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ZodType } from "zod";
import type ERest from "..";
import type { IApiOptionInfo, IDocOptions } from "..";
import type { APIOption, IExample } from "../api";
import { docs as debug } from "../debug";
import type { ErrorManager } from "../manager";
import generateAsiox from "../plugin/generate_axios";
import generateMarkdown from "../plugin/generate_markdown";
import generatePostman from "../plugin/generate_postman";
import generateSwagger, { buildSwagger } from "../plugin/generate_swagger";

// Generate all.json function
function generateAll(data: IDocData, dir: string, options: IDocOptions, writer: IDocWritter) {
  const filename = getPath("all.json", options.all);
  // 创建一个没有循环引用的数据副本
  const cleanData = {
    ...data,
    erest: undefined, // 移除循环引用
  };
  writer(path.resolve(dir, filename), jsonStringify(cleanData, 2));
}

import { getPath, jsonStringify } from "../utils";

/** 文档输出写入方法 */
export type IDocWritter = (path: string, data: string) => void;
/** 文档生成器插件 */
export type IDocGeneratePlugin = (data: IDocData, dir: string, options: IDocOptions, writter: IDocWritter) => void;

/** 从文档获取的字段 */
const DOC_FIELD = [
  "method",
  "path",
  "realPath",
  "examples",
  "middlewares",
  "query",
  "body",
  "params",
  "group",
  "title",
  "description",
  "response",
  "required",
  "requiredOneOf",
  "tested",
  "responseSchema",
  "headers",
];

/** 文档数据 */
export interface IDocData {
  /** API信息 */
  info: IApiOptionInfo;
  /** 生成时间 */
  genTime: string;
  /** 分组信息 */
  group: Record<string, string>;
  /** 基础数据类型 */
  types: Record<string, IDocTypes>;
  /** API */
  apis: Record<string, APIOption<unknown>>;
  /** 文档Schema */
  schema: unknown;
  /** 类型管理器 */
  typeManager: unknown;
  /** 错误信息 */
  errorManager: ErrorManager;
  /** API统计信息 */
  apiInfo: {
    count: number;
    tested: number;
    untest: string[];
  };
  /** ERest实例引用（用于访问内部属性） */
  erest?: ERest<unknown> & {
    typeRegistry?: Map<string, ZodType>;
    schemaRegistry?: Map<string, ZodType>;
  };
}

export interface IDocTypes {
  /** 数据类型名称 */
  name: string;
  /** 检查方法 */
  checker?: string;
  /** 格式化方法 */
  formatter?: string;
  /** 解析方法 */
  parser?: string;
  /** 类型动态参数检查器 */
  paramsChecker?: string;
  /** 说明信息 */
  description: string;
  /** 是否为系统内置的类型 */
  isBuiltin?: boolean;
  /** 对应的TypeScript类型 */
  tsType?: string;
  /** 是否默认自动格式化 */
  isDefaultFormat?: boolean;
  /** 类型动态参数是否必须 */
  isParamsRequired: boolean;
}

/** 默认文档输出格式化 */
const docOutputFormat = (out: unknown) => out;
/** 默认文档输出函数（直接写文件） */
const docWriteSync: IDocWritter = (path: string, data: string) => fs.writeFileSync(path, data);

function generateJosn(data: IDocData, dir: string, options: IDocOptions, writer: IDocWritter) {
  const filename = getPath("doc.json", options.json);
  // 创建一个没有循环引用的数据副本
  const cleanData = {
    ...data,
    erest: undefined, // 移除循环引用
  };
  writer(path.resolve(dir, filename), jsonStringify(cleanData, 2));
}

export default class IAPIDoc {
  private erest: ERest<unknown>;
  private info: IApiOptionInfo;
  private groups: Record<string, string>;
  private docsOptions: IDocOptions;
  private plugins: IDocGeneratePlugin[] = [];
  private writer: IDocWritter = docWriteSync;
  private docDataCache: IDocData | null = null;

  constructor(erestIns: ERest<unknown>) {
    this.erest = erestIns;
    const { info, groups, docsOptions } = this.erest.privateInfo;
    this.info = info;
    this.groups = groups;
    this.docsOptions = docsOptions;
  }

  /** 生成类型文档 - 支持新的 Zod 实现 */
  private generateTypeDocumentation(data: IDocData) {
    // 从类型注册表中获取所有注册的类型
    const typeRegistry = (this.erest as unknown as { typeRegistry?: Map<string, ZodType> }).typeRegistry;
    if (typeRegistry && typeRegistry.size > 0) {
      for (const [typeName, zodSchema] of typeRegistry.entries()) {
        const typeDoc: IDocTypes = {
          name: typeName,
          description: this.extractZodSchemaDescription(zodSchema),
          isBuiltin: false,
          tsType: this.extractTypeScriptType(zodSchema),
          isDefaultFormat: true,
          isParamsRequired: false,
        };
        data.types[typeName] = typeDoc;
      }
    }

    // 从schema注册表中获取所有注册的schema
    const schemaRegistry = (this.erest as unknown as { schemaRegistry?: Map<string, ZodType> }).schemaRegistry;
    if (schemaRegistry && schemaRegistry.size > 0) {
      for (const [schemaName, zodSchema] of schemaRegistry.entries()) {
        const schemaDoc: IDocTypes = {
          name: schemaName,
          description: this.extractZodSchemaDescription(zodSchema),
          isBuiltin: false,
          tsType: this.extractTypeScriptType(zodSchema),
          isDefaultFormat: true,
          isParamsRequired: false,
        };
        data.types[schemaName] = schemaDoc;
      }
    }
  }

  /** 从Zod Schema中提取描述信息 */
  private extractZodSchemaDescription(zodSchema: ZodType): string {
    if (!zodSchema || !zodSchema._def) {
      return "未知类型";
    }

    const typeName =
      (zodSchema._def as { typeName?: string; type?: string }).typeName ||
      (zodSchema._def as { typeName?: string; type?: string }).type;
    switch (typeName) {
      case "ZodString":
      case "string":
        return "字符串类型";
      case "ZodNumber":
      case "number":
        return "数字类型";
      case "ZodBoolean":
      case "boolean":
        return "布尔类型";
      case "ZodDate":
      case "date":
        return "日期类型";
      case "ZodArray":
      case "array":
        return "数组类型";
      case "ZodObject":
      case "object":
        return "对象类型";
      case "ZodEnum":
      case "enum":
        return "枚举类型";
      case "ZodUnion":
      case "union":
        return "联合类型";
      case "ZodOptional":
      case "optional":
        return "可选类型";
      case "ZodNullable":
      case "nullable":
        return "可空类型";
      default:
        return `Zod ${typeName} 类型`;
    }
  }

  /** 从Zod Schema中提取TypeScript类型 */
  private extractTypeScriptType(zodSchema: ZodType): string {
    if (!zodSchema || !zodSchema._def) {
      return "unknown";
    }

    const typeName =
      (zodSchema._def as { typeName?: string; type?: string }).typeName ||
      (zodSchema._def as { typeName?: string; type?: string }).type;
    switch (typeName) {
      case "ZodString":
      case "string":
        return "string";
      case "ZodNumber":
      case "number":
        return "number";
      case "ZodBoolean":
      case "boolean":
        return "boolean";
      case "ZodDate":
      case "date":
        return "Date";
      case "ZodArray":
      case "array": {
        const defObj = zodSchema._def as unknown as { element?: ZodType; type?: ZodType; innerType?: ZodType };
        const elementType = defObj.element || defObj.type || defObj.innerType;
        const innerType = elementType ? this.extractTypeScriptType(elementType) : "unknown";
        return `${innerType}[]`;
      }
      case "ZodObject":
      case "object":
        return "object";
      case "ZodEnum":
      case "enum": {
        const enumValues =
          (zodSchema._def as { values?: unknown; entries?: unknown }).values ||
          (zodSchema._def as { values?: unknown; entries?: unknown }).entries;
        if (Array.isArray(enumValues)) {
          return enumValues.map((v) => (typeof v === "string" ? `"${v}"` : String(v))).join(" | ");
        } else if (enumValues && typeof enumValues === "object") {
          // 处理 { red: 'red', green: 'green', blue: 'blue' } 格式
          const values = Object.values(enumValues);
          return values.map((v) => (typeof v === "string" ? `"${v}"` : String(v))).join(" | ");
        }
        return "string";
      }
      case "ZodUnion":
      case "union": {
        const unionTypes = (zodSchema._def as { options?: ZodType[] }).options;
        if (Array.isArray(unionTypes)) {
          return unionTypes.map((t: ZodType) => this.extractTypeScriptType(t)).join(" | ");
        }
        return "unknown";
      }
      case "ZodOptional":
      case "optional":
        return `${this.extractTypeScriptType((zodSchema._def as unknown as { innerType: ZodType }).innerType)} | undefined`;
      case "ZodNullable":
      case "nullable":
        return `${this.extractTypeScriptType((zodSchema._def as unknown as { innerType: ZodType }).innerType)} | null`;
      default:
        return "unknown";
    }
  }

  /** 获取文档数据 */
  public buildDocData() {
    if (this.docDataCache) return this.docDataCache;
    debug("data");
    const now = new Date();
    const data: IDocData = {
      info: this.info,
      // FIXME: 对日期格式需要优化
      genTime: `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`,
      errorManager: this.erest.errors,
      schema: this.erest.schema,
      typeManager: this.erest.type,
      group: this.groups,
      types: {} as Record<string, IDocTypes>,
      apis: {} as Record<string, APIOption<unknown>>,
      apiInfo: {
        count: 0,
        tested: 0,
        untest: [],
      },
      erest: this.erest as ERest<unknown> & {
        typeRegistry?: Map<string, ZodType>;
        schemaRegistry?: Map<string, ZodType>;
      }, // 添加erest实例引用
    };
    const formatOutput = this.erest.api.docOutputForamt || docOutputFormat;

    // 生成类型文档 - 支持新的 Zod 实现
    this.generateTypeDocumentation(data);

    for (const [k, schema] of this.erest.api.$apis.entries()) {
      const o = schema.options;
      data.apis[k] = {} as APIOption<unknown>;
      for (const key of DOC_FIELD) {
        data.apis[k][key] = o[key];
      }
      const examples = data.apis[k].examples;
      if (examples) {
        examples.forEach((item: IExample) => {
          if (item && typeof item === "object") {
            item.output = formatOutput(item.output) as Record<string, unknown>;
          }
        });
      }
    }

    this.docDataCache = data;
    return data;
  }

  /** 设置文档输出函数 */
  public setWritter(writer: IDocWritter) {
    this.writer = writer;
  }

  /** 生成文档 */
  public genDocs() {
    debug("genDocs");
    if (this.docsOptions.markdown) {
      this.registerPlugin("markdown", generateMarkdown);
    }
    if (this.docsOptions.swagger) {
      this.registerPlugin("swagger", generateSwagger);
    }
    if (this.docsOptions.postman) {
      this.registerPlugin("postman", generatePostman);
    }
    if (this.docsOptions.json) {
      this.registerPlugin("json", generateJosn);
    }
    if (this.docsOptions.axios) {
      this.registerPlugin("axios", generateAsiox);
    }
    if (this.docsOptions.all) {
      this.registerPlugin("all", generateAll);
    }
    return this;
  }

  public getSwaggerInfo() {
    return buildSwagger(this.buildDocData()) as unknown;
  }

  public registerPlugin(name: string, plugin: IDocGeneratePlugin) {
    debug(name);
    this.plugins.push(plugin);
  }

  /** 保存文档 */
  public save(dir: string) {
    assert(typeof dir === "string" && dir.length > 0, `文档存储目录"${dir}"格式不正确：必须是字符串类型`);

    // 保存 all.json
    const data = this.buildDocData();

    for (const [key, api] of Object.entries(data.apis)) {
      data.apiInfo.count += 1;
      if (api.examples && api.examples.length > 0) {
        data.apiInfo.tested += 1;
      } else {
        data.apiInfo.untest.push(key);
      }
    }

    debug("save: %s", dir);

    // 根据插件生成文档
    for (const fn of this.plugins) {
      debug("build doc: %s", fn);
      // 防止文档生成插件报错
      try {
        fn(data, dir, this.docsOptions, this.writer);
      } catch (error) {
        console.error(error);
      }
    }

    return this;
  }

  /** 当进程退出时存储文档 */
  public saveOnExit(dir: string) {
    debug("saveOnExit: %s", dir);
    process.on("exit", () => this.save(dir));
    return this;
  }
}
