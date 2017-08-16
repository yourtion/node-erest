"use strict";

/**
 * @file API Debug
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import Debug from "debug";

/**
 * 创建一个调试输出函数
 *
 * @param {String} name
 * @return {Function}
 */
const create = (name) => {
  return Debug("erest:" + name);
};

const core = create("core");
const schema =  create("schema");
const params =  create("params");
const test =  create("test");
const docs =  create("docs");
const plugin =  create("plugin");

export { create, core, schema, params, test, docs, plugin };
