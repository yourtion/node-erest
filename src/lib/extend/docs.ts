/**
 * @file API Docs
 * 参考 hojs
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import assert from "assert";
import fs from "fs";
import path from "path";
import { docs as debug } from "../debug";
import ERest, { IApiOptionInfo } from "../index";
import { IDocOptions } from "../index";
import { ErrorManager } from "../manager";
import generateMarkdown from "../plugin/generate_markdown";
import generateSwagger from "../plugin/generate_swagger";
import { getPath, jsonStringify } from "../utils"
import { APIOption } from "../api";

export type IDocGeneratePlugin = (data: IDocData, dir: string, options: IDocOptions) => void;

const DOC = [
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
];

export interface IDocData {
  info: IApiOptionInfo;
  errors: ErrorManager;
  group: Record<string, string>;
  types: Record<string, IDocTypes>;
  schemas: Record<string, APIOption<any>>;
  apiInfo: {
    count: number;
    tested: number;
    untest: string[];
  };
}

export interface IDocTypes {
  name: string;
  checker: string;
  formatter?: string;
  parser?: string;
  paramsChecker?: string;
  description: string;
  isDefault: boolean;
  isDefaultFormat?: boolean;
  isParamsRequire: boolean;
}

const docOutputForamt = (out: any) => out;

export default class IAPIDoc {
  private parent: ERest<any>;
  private info: IApiOptionInfo;
  private groups: Record<string, string>;
  private docsOptions: IDocOptions;
  private plugins: IDocGeneratePlugin[] = [];

  constructor(apiService: ERest<any>) {
    this.parent = apiService;
    const { info, groups, docsOptions } = this.parent.privateInfo;
    this.info = info;
    this.groups = groups;
    this.docsOptions = docsOptions;
  }

  /**
   * 获取文档数据
   */
  public data() {
    debug("data");
    const data: IDocData = {
      info: this.info,
      errors: this.parent.errors,
      group: this.groups,
      types: {} as Record<string, any>,
      schemas: {} as Record<string, any>,
      apiInfo: {
        count: 0,
        tested: 0,
        untest: [],
      },
    };
    const formatOutput = this.parent.api.docOutputForamt || docOutputForamt;

    for (const [k, schema] of this.parent.api.$apis.entries()) {
      const o = schema.options;
      data.schemas[k] = {} as APIOption<any>;
      for (const key of DOC) {
        data.schemas[k][key] = o[key];
      }
      const examples = data.schemas[k].examples;
      if (examples) {
        examples.forEach((item: any) => {
          item.output = formatOutput(item.output);
        });
      }
    }

    return data;
  }

  /**
   * 生成文档
   */
  public genDocs() {
    debug("genDocs");
    this.markdown();
    if (this.docsOptions.swagger) {
      this.swagger();
    }
    if (this.docsOptions.json) {
      this.json();
    }
    return this;
  }

  /**
   * 生成 Markdown 文档
   */
  public markdown() {
    debug("markdown");
    this.plugins.push(generateMarkdown);
    return this;
  }

  /**
   * 生成 Swagger 文档
   */
  public swagger() {
    debug("swagger");
    this.plugins.push(generateSwagger);
    return this;
  }

  /**
   * 生成 JSON 文档
   */
  public json() {
    debug("json");
    const generateJson = (data: any, dir: string, options: IDocOptions) => {
      const filename = getPath("doc.json", options.json);
      fs.writeFileSync(path.resolve(dir, filename), jsonStringify(data, 2));
    };
    this.plugins.push(generateJson);
    return this;
  }

  /**
   * 存储文档
   */
  public save(dir: string) {
    assert(
      typeof dir === "string" && dir.length > 0,
      `文档存储目录"${dir}"格式不正确：必须是字符串类型`,
    );

    // 保存 all.json
    const data = this.data();

    for (const key of Object.keys(data.schemas)) {
      data.apiInfo.count += 1;
      if (data.schemas[key].examples && data.schemas[key].examples.length > 0) {
        data.apiInfo.tested += 1;
      } else {
        data.apiInfo.untest.push(key);
      }
    }

    debug("save: %s", dir);

    // 根据插件生成文档
    for (const fn of this.plugins) {
      fn(data, dir, this.docsOptions);
    }

    return this;
  }

  /**
   * 当进程退出时存储文档
   */
  public saveOnExit(dir: string) {
    debug("saveOnExit: %s", dir);
    process.on("exit", () => {
      this.save(dir);
    });
    return this;
  }
}
