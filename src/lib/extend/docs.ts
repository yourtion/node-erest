/**
 * @file API Docs
 * 参考 hojs
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import type ERest from "..";
import type { IApiOptionInfo, IDocOptions } from "..";
import type { APIOption } from "../api";
import { docs as debug } from "../debug";
import type { ErrorManager } from "../manager";
import generateAsiox from "../plugin/generate_axios";
import generateMarkdown from "../plugin/generate_markdown";
import generatePostman from "../plugin/generate_postman";
import generateSwagger, { buildSwagger } from "../plugin/generate_swagger";
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
  apis: Record<string, APIOption<any>>;
  /** 文档Schema */
  schema: any;
  /** 类型管理器 */
  typeManager: any;
  /** 错误信息 */
  errorManager: ErrorManager;
  /** API统计信息 */
  apiInfo: {
    count: number;
    tested: number;
    untest: string[];
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
const docOutputFormat = (out: any) => out;
/** 默认文档输出函数（直接写文件） */
const docWriteSync: IDocWritter = (path: string, data: string) => fs.writeFileSync(path, data);

function generateJosn(data: IDocData, dir: string, options: IDocOptions, writer: IDocWritter) {
  const filename = getPath("doc.json", options.json);
  writer(path.resolve(dir, filename), jsonStringify(data, 2));
}

export default class IAPIDoc {
  private erest: ERest<any>;
  private info: IApiOptionInfo;
  private groups: Record<string, string>;
  private docsOptions: IDocOptions;
  private plugins: IDocGeneratePlugin[] = [];
  private writer: IDocWritter = docWriteSync;
  private docDataCache: IDocData | null = null;

  constructor(erestIns: ERest<any>) {
    this.erest = erestIns;
    const { info, groups, docsOptions } = this.erest.privateInfo;
    this.info = info;
    this.groups = groups;
    this.docsOptions = docsOptions;
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
      apis: {} as Record<string, APIOption<any>>,
      apiInfo: {
        count: 0,
        tested: 0,
        untest: [],
      },
    };
    const formatOutput = this.erest.api.docOutputForamt || docOutputFormat;

    // types - 暂时跳过类型遍历，因为新的实现不支持 forEach
    // TODO: 需要根据新的 Zod 实现重新设计类型文档生成
    // this.erest.type.forEach((item, key) => {
    //   const type = item.info;
    //   const t = Object.assign({}, JSON.parse(JSON.stringify(type))) as IDocTypes;
    //   t.name = key;
    //   t.parser = type.parser && type.parser.toString();
    //   t.checker = type.checker && type.checker.toString();
    //   t.formatter = type.formatter && type.formatter.toString();
    //   data.types[key] = t;
    // });

    for (const [k, schema] of this.erest.api.$apis.entries()) {
      const o = schema.options;
      data.apis[k] = {} as APIOption<any>;
      for (const key of DOC_FIELD) {
        data.apis[k][key] = o[key];
      }
      const examples = data.apis[k].examples;
      if (examples) {
        examples.forEach((item: any) => {
          item.output = formatOutput(item.output);
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
    return this;
  }

  public getSwaggerInfo() {
    return buildSwagger(this.buildDocData()) as any;
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
