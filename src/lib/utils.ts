"use strict";

/**
 * @file API Utils
 * @author Yourtion Guo <yourtion@gmail.com>
 */
import { resolve as pathResolve } from "path";

export interface ISourceResult {
  relative?: string;
  absolute?: string;
}

/**
 * 获取调用当前函数的源码地址
 *
 * @param {String} dir 项目所在目录
 * @return {Object} 返回调用堆栈中第一个项目所在目录的文件
 */
export function getCallerSourceLine(dir: string): ISourceResult {
  const resolvedDir = pathResolve(dir);
  const err = (new Error()).stack;
  const stack = err ? err.split("\n").slice(1) : "";
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

/**
 * 返回安全的JSON字符串
 *
 * @param {Object} data
 * @param {String|Number} space 缩进
 * @return {String}
 */
export function jsonStringify(data, space) {
  const seen: any[] = [];
  return JSON.stringify(data, (key, val) => {
    if (!val || typeof val !== "object") {
      return val;
    }
    if (seen.indexOf(val) !== -1) {
      return "[Circular]";
    }
    seen.push(val);
    return val;
  }, space);
}

/**
 * 生成自定义Error类型
 *
 * @param {String} name
 * @param {Object} info
 * @return {Function}
 */
export function customError(name, info) {
  name = name || "CustomError";
  info = info || {};
  const code = "" +
"function " + name + "(message, info2) {\n" +
"  Error.captureStackTrace(this, " + name + ");\n" +
'  this.name = "' + name + '";\n' +
'  this.message = (message || "");\n' +
"  info2 = info2 || {};\n" +
"  for (var i in info) this[i] = info[i];\n" +
"  for (var i in info2) this[i] = info2[i];\n" +
"}\n" +
name + ".prototype = Error.prototype;" + name;
  // tslint:disable-next-line no-eval
  return eval(code);
}

/**
 * 带 Promise 的回调函数
 */
export interface IPromiseCallback<T> {
  (err: Error | null, ret?: T): void;
  reject?: any;
  resolve?: any;
  promise?: Promise<T>;
}

/**
 * 创建一个带 promise 的回调函数
 *
 * @return {Function}
 */
export function createPromiseCallback<T>(): IPromiseCallback<T> {
  const callback: IPromiseCallback<T> = (err, ret) => {
    if (err) {
      callback.reject(err);
    } else {
      callback.resolve(ret);
    }
  };
  callback.promise = new Promise((resolve, reject) => {
    callback.resolve = resolve;
    callback.reject = reject;
  });
  return callback;
}

/**
 * 合并对象
 *
 * @param {Object} a
 * @param {Object} b
 * @return {Object}
 */
export function merge(...args) {
  const ret = {};
  for (const obj of args) {
    Object.keys(obj).forEach((k) => {
      ret[k] = obj[k];
    });
  }
  return ret;
}
