/**
 * @file API Debug
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import Debug from "debug";

/**
 * 创建一个调试输出函数
 *
 * @param {String} name
 * @return {Debug.IDebugger}
 */
export const create = (name: string) => {
  return Debug(`erest:${name}`);
};

export const core = create("core");
export const coreError = create("core:error");
export const coreType = create("core:types");
export const api = create("api");
export const params = create("params");
export const test = create("test");
export const docs = create("docs");
export const plugin = create("plugin");
