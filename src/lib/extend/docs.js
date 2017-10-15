'use strict';

/**
 * @file API Docs
 * 参考 hojs
 * @author Yourtion Guo <yourtion@gmail.com>
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const debug = require('../debug').docs;
const generateMarkdown = require('../plugin/generate_markdown');
const generateSwagger = require('../plugin/generate_swagger');

const DOC = [ 'method', 'path', 'examples', 'middlewares', 'required', 'requiredOneOf', 'query', 'body', 'params', 'group', 'title', 'description' ];

module.exports = function extendDocs() {

  this.api.docs = {};
  const plugins = [];

  /**
   * 获取文档数据
   *
   * @return {Object}
   */
  this.api.docs.data = () => {

    const data = {
      info: this.info,
      types: {},
      errors: this.errors,
      schemas: {},
      group: this.groups,
    };
    const formatOutput = this.api.docOutputForamt || function (out) { return out; };
    
    Object.keys(this.api.$schemas).forEach(k => {
      const schema = this.api.$schemas[k];
      const o = schema.options;
      data.schemas[k] = {};
      for(const key of DOC) {
        data.schemas[k][key] = o[key];
      }
    });

    // types
    this.type.forEach(item => {
      const t = this.utils.merge(item);
      t.parser = t.parser && t.parser.toString();
      t.checker = t.checker && t.checker.toString();
      t.formatter = t.formatter && t.formatter.toString();
      data.types[t.name] = t;
    });

    for (const s in data.schemas) {
      // 格式化输出结果
      const examples = data.schemas[s].examples;
      if (examples) {
        examples.forEach(item => {
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
  this.api.docs.takeSample = () => {
    this.api.$flag.saveApiInputOutput = true;
    return this.api.docs;
  };

  /**
   * 生成Markdown文档
   *
   * @return {Object}
   */
  this.api.docs.markdown = () => {
    plugins.push(generateMarkdown);
    plugins.push(generateSwagger);
    return this.api.docs;
  };

  /**
   * 存储文档
   *
   * @param {String} dir 存储目录
   * @return {Object}
   */
  this.api.docs.save = (dir) => {

    assert(typeof dir === 'string' && dir.length > 0, `文档存储目录"${ dir }"格式不正确：必须是字符串类型`);

    // 保存 all.json
    const data = this.api.docs.data();
    data.apiInfo = {
      count: 0,
      tested: 0,
      untest: [],
    };

    for(const key of Object.keys(data.schemas)) {
      data.apiInfo.count += 1;
      if(data.schemas[key].examples && data.schemas[key].examples.length > 0) {
        data.apiInfo.tested += 1;
      } else {
        data.apiInfo.untest.push(key);
      }
    }

    debug(dir);
    fs.writeFileSync(path.resolve(dir, 'doc.json'), this.utils.jsonStringify(data, 2));

    // 根据插件生成文档
    for (const fn of plugins) {
      fn(data, dir);
    }

    return this.api.docs;
  };

  /**
   * 当进程退出时存储文档
   *
   * @param {String} dir 存储目录
   * @return {Object}
   */
  this.api.docs.saveOnExit = (dir) => {
    process.on('exit', () => {
      this.api.docs.save(dir);
    });
    return this.api.docs;
  };

};
