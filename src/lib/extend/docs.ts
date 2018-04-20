/**
 * @file API Docs
 * 参考 hojs
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { docs as debug} from "../debug";
import API from "../index";
import { IDocOptions } from "../index";
import { IDocGeneratePlugin, IKVObject } from "../interfaces";
import { ErrorManager, TypeManager } from "../manager";
import generateMarkdown from "../plugin/generate_markdown";
import generateSwagger from "../plugin/generate_swagger";

const DOC = [ "method", "path", "examples", "middlewares", "required", "requiredOneOf", "query", "body", "params", "group", "title", "description", "schema", "tested" ];

export interface IDocData {
  info: any;
  errors: ErrorManager;
  group: IKVObject<string>;
  types: IKVObject;
  schemas: IKVObject;
}

export function extendDocs(apiService: API) {

  apiService.api.docs = {};
  const { info, groups, docsOptions } = apiService.privateInfo;
  const plugins: IDocGeneratePlugin[] = [];

  const docOutputForamt = (out: any) => out;

  /**
   * 获取文档数据
   *
   * @return {Object}
   */
  apiService.api.docs.data = () => {

    const data: IDocData = {
      info,
      errors: apiService.errors,
      group: groups,
      types: {} as IKVObject,
      schemas: {} as IKVObject,
    };
    const formatOutput = apiService.api.docOutputForamt || docOutputForamt;

    // types
    apiService.type.forEach((item: any) => {
      const t = apiService.utils.merge(item) as any;
      t.parser = t.parser && t.parser.toString();
      t.checker = t.checker && t.checker.toString();
      t.formatter = t.formatter && t.formatter.toString();
      data.types[t.name] = t;
    });

    for (const [k, schema] of apiService.api.$schemas.entries()) {
      const o = schema.options;
      data.schemas[k] = {};
      for (const key of DOC) {
        data.schemas[k][key] = o[key];
      }
      const examples = data.schemas[k].examples;
      if (examples) {
        examples.forEach((item: any) => {
          const v = item;
          v.output = formatOutput(v.output);
        });
      }
    }

    return data;
  };

  /**
   * 生成文档
   *
   * @return {Object}
   */
  apiService.api.docs.genDocs = () => {
    apiService.api.docs.markdown();
    if (docsOptions.swagger) {
      apiService.api.docs.swagger();
    }
    if (docsOptions.json) {
      apiService.api.docs.json();
    }
    return apiService.api.docs;
  };

  /**
   * 生成 Markdown 文档
   *
   * @return {Object}
   */
  apiService.api.docs.markdown = () => {
    plugins.push(generateMarkdown);
    return apiService.api.docs;
  };

  /**
   * 生成 Swagger 文档
   *
   * @return {Object}
   */
  apiService.api.docs.swagger = () => {
    plugins.push(generateSwagger);
    return apiService.api.docs;
  };

  const generateJson: IDocGeneratePlugin = (data: any, dir: string, options: IDocOptions) => {
    const filename = apiService.utils.getPath("doc.json", options.json);
    fs.writeFileSync(path.resolve(dir, filename), apiService.utils.jsonStringify(data, 2));
  };

  /**
   * 生成 JSON 文档
   *
   * @return {Object}
   */
  apiService.api.docs.json = () => {
    plugins.push(generateJson);
    return apiService.api.docs;
  };

  /**
   * 存储文档
   *
   * @param {String} dir 存储目录
   * @return {Object}
   */
  apiService.api.docs.save = (dir: string) => {

    assert(typeof dir === "string" && dir.length > 0, `文档存储目录"${ dir }"格式不正确：必须是字符串类型`);

    // 保存 all.json
    const data = apiService.api.docs.data();
    data.apiInfo = {
      count: 0,
      tested: 0,
      untest: [],
    };

    for (const key of Object.keys(data.schemas)) {
      data.apiInfo.count += 1;
      if (data.schemas[key].examples && data.schemas[key].examples.length > 0) {
        data.apiInfo.tested += 1;
      } else {
        data.apiInfo.untest.push(key);
      }
    }

    debug(dir);

    // 根据插件生成文档
    for (const fn of plugins) {
      fn(data, dir, docsOptions);
    }

    return apiService.api.docs;
  };

  /**
   * 当进程退出时存储文档
   *
   * @param {String} dir 存储目录
   * @return {Object}
   */
  apiService.api.docs.saveOnExit = (dir: string) => {
    process.on("exit", () => {
      apiService.api.docs.save(dir);
    });
    return apiService.api.docs;
  };

}
