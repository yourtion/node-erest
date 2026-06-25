/**
 * @file CJS/ESM 兼容的延迟 require
 * @author Yourtion Guo <yourtion@gmail.com>
 *
 * 同一份源码会被编译两次：CJS（dist/lib）与 ESM（dist/esm）。
 * - CJS 下可直接用 require()，但 import.meta 不可用（tsc module:commonjs 报错）。
 * - ESM 下 require 不存在，需 createRequire。
 *
 * 解法：createRequire 只用于解析裸模块名（如 'supertest'），
 * 此类解析走 node_modules 向上查找，与传入的 baseURL 无关。
 * 故用文件协议的 cwd URL 作为基准即可，两种模块系统都能编译通过。
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

/** 延迟 require：CJS/ESM 通用（基准用 cwd，不影响裸模块名解析） */
export const lazyRequire = createRequire(pathToFileURL(process.cwd() + "/").href);
