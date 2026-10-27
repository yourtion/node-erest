/**
 * @file API Utils
 * @author Yourtion Guo <yourtion@gmail.com>
 */
import { resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

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
      // CJS 风格栈帧：`at fn (/path/file.ts:1:1)`（取括号内）；
      // ESM 栈帧无括号：`at file:///path/file.ts:1:1`（取行尾 URL，去 file:// 前缀统一为纯路径）
      const s = line.match(/\((.*):\d+:\d+\)\s*$/) || line.match(/^(?:at\s+)?(\S+):\d+:\d+$/);
      if (s) {
        const absolute = s[1].startsWith("file://") ? fileURLToPath(s[1]) : s[1];
        return { relative: absolute.slice(resolvedDir.length + 1), absolute };
      }
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
  return JSON.stringify(data, undefined, space);
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

/** 从路由提取具名路径参数；SDK 与文档使用相同规则。 */
export function getPathParamNames(route: string): string[] {
  return [...new Set(Array.from(route.matchAll(/:([a-z_][a-z0-9_]*)/gi), (match) => match[1]))];
}
