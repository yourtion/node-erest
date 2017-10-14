"use strict";

/**
 * @file API Utils
 * @author Yourtion Guo <yourtion@gmail.com>
 */
import { resolve } from "path";

interface ISourceResult {
  relative: string;
  absolute: string;
}

/**
 * 获取调用当前函数的源码地址
 *
 * @param {String} dir 项目所在目录
 * @return {Object} 返回调用堆栈中第一个项目所在目录的文件
 */
export function getCallerSourceLine(dir: string): ISourceResult {
  const resolvedDir = resolve(dir);
  const stack = (new Error()).stack.split("\n").slice(1);
  for (let line of stack) {
    line = line.trim();
    if (line.replace(/\\/g, "/").indexOf(resolvedDir) !== -1) {
      const s = line.match(/\((.*)\)\s*$/);
      if (s) {
        return {
          relative: s[1].slice(resolvedDir.length + 1),
          absolute: s[1],
        };
      }
    }
  }
  return { relative: undefined, absolute: undefined };
}

/**
 * 获取API的Key
 *
 * @param {String} method
 * @param {String} path
 * @return {String}
 */
export function getSchemaKey(method, path): string {
  return `${ method.toUpperCase() }_${ path }`;
}
