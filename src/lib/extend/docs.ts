"use strict";

/**
 * @file API Docs
 * 参考 hojs
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { docs as debug} from "../debug";
import { API } from "../index";
import * as generateMarkdown from "../plugin/generate_markdown";
import { generateSwagger } from "../plugin/generate_swagger";

const DOC = [ "method", "path", "examples", "middlewares", "required", "requiredOneOf", "query", "body", "params", "group", "title", "description" ];

export function extendDocs(apiService: API) {

  apiService.api.docs = {};
  const plugins: any[] = [];

  const docOutputForamt = (out) => out;

  /**
   * 获取文档数据
   *
   * @return {Object}
   */
  apiService.api.docs.data = () => {

    const data = {
      info: apiService.info,
      types: {},
      errors: apiService.errors,
      schemas: {},
      group: apiService.groups,
    };
    const formatOutput = apiService.api.docOutputForamt || docOutputForamt;

    // types
    apiService.type.forEach((item) => {
      const t = apiService.utils.merge(item);
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
        examples.forEach((item) => {
          const v = item;
          v.output = formatOutput(v.output);
        });
      }
    }

    return data;
  };

  /**
   * 开始采集输入输出样例
   *
   * @return {Object}
   */
  apiService.api.docs.takeSample = () => {
    apiService.api.$flag.saveApiInputOutput = true;
    return apiService.api.docs;
  };

  /**
   * 生成Markdown文档
   *
   * @return {Object}
   */
  apiService.api.docs.markdown = () => {
    plugins.push(generateMarkdown);
    plugins.push(generateSwagger);
    return apiService.api.docs;
  };

  /**
   * 存储文档
   *
   * @param {String} dir 存储目录
   * @return {Object}
   */
  apiService.api.docs.save = (dir) => {

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
    fs.writeFileSync(path.resolve(dir, "doc.json"), apiService.utils.jsonStringify(data, 2));

    // 根据插件生成文档
    for (const fn of plugins) {
      fn(data, dir);
    }

    return apiService.api.docs;
  };

  /**
   * 当进程退出时存储文档
   *
   * @param {String} dir 存储目录
   * @return {Object}
   */
  apiService.api.docs.saveOnExit = (dir) => {
    process.on("exit", () => {
      apiService.api.docs.save(dir);
    });
    return apiService.api.docs;
  };

}
