/**
 * @file API Utils
 * @author Yourtion Guo <yourtion@gmail.com>
 */
import { resolve as pathResolve } from "node:path";

export interface ISupportMethds<T> {
  get: T;
  post: T;
  put: T;
  delete: T;
  patch: T;
}

export interface SourceResult {
  relative?: string;
  absolute?: string;
}

/** 获取调用当前函数的源码地址 */
export function getCallerSourceLine(dir: string): SourceResult {
  const resolvedDir = pathResolve(dir);
  const err = new Error().stack;
  const stack = err ? err.split("\n").slice(1) : "";
  for (let line of stack) {
    line = line.trim();
    if (line.replace(/\\/g, "/").indexOf(resolvedDir) !== -1) {
      const s = line.match(/\((.*)\)\s*$/);
      if (s) return { relative: s[1].slice(resolvedDir.length + 1), absolute: s[1] };
    }
  }
  return { relative: undefined, absolute: undefined };
}

/** 获取API的Key */
export function getSchemaKey(method: string, path: string, prefix?: string): string {
  const pf = prefix ? (prefix.indexOf("/") === 0 ? prefix : `/${camelCase2underscore(prefix)}`) : "/";
  return `${method.toUpperCase()}_${(pf + path).replace(/\/\//g, "/").replace(/\/$/, "") || "/"}`;
}

/** 返回安全的JSON字符串 */
export function jsonStringify(data: object, space: string | number) {
  // const seen: any[] = [];
  return JSON.stringify(
    data,
    (_, val) => {
      if (!val || typeof val !== "object") return val;
      // if (seen.indexOf(val) !== -1) return "[Circular]";
      // seen.push(val);
      return val;
    },
    space
  );
}

/** 获取路径 */
export function getPath(def: string, opt?: string | boolean): string {
  return typeof opt === "string" ? opt : def;
}

/** 通过 schema key 获取 path */
export function getRealPath(key: string) {
  return key.substring(key.indexOf("_") + 1);
}

/** 驼峰线转下划 */
export function camelCase2underscore(str: string): string {
  return str
    .replace(/^\S/, (s) => s.toLowerCase())
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase();
}
