/**
 * @file API Agent
 * @author Yourtion Guo <yourtion@gmail.com>
 *
 * v3：测试引擎从 supertest 改为 Node 18+ 内置 fetch。
 * TestAgent 持有请求状态（method/path/headers/query/body），由 IAPITest 注入 baseUrl，
 * 实际发请求在 output() 中执行。对外链式 API（get/post/headers/input/success/error/raw）不变。
 */

import { strict as assert } from "node:assert";
import * as stream from "node:stream";
import * as util from "node:util";
import type { IDebugger } from "debug";
import { SUPPORT_METHOD, type SUPPORT_METHODS } from "./api.js";
import { create as createDebug, test as debug } from "./debug.js";
import type ERest from "./index.js";
import type { SourceResult } from "./utils.js";

const defaultFormatOutput = (data: unknown) => [null, data];

/** 返回对象结构字符串 */
function inspect(obj: unknown) {
  return util.inspect(obj, { depth: 5, colors: true });
}

/** 请求状态：替代 supertest 的 Test 对象 */
interface AgentState {
  method: SUPPORT_METHODS;
  path: string;
  headers: Record<string, string>;
  query: Record<string, unknown>;
  body: unknown;
  form?: FormData;
  /** 最终请求 URL 的 path（供 saveExample 记录） */
  reqPath: string;
}

/** fetch 响应的兼容视图（对齐原 supertest res 的常用字段） */
interface RawResponse {
  status: number;
  text: string;
  body: unknown;
  headers: Record<string, string>;
}

export interface ITestAgentOption {
  erest: ERest<unknown>;
  sourceFile: SourceResult;
  method: SUPPORT_METHODS;
  path: string;
  /** 由 IAPITest 注入：构造最终 URL 的基址 */
  getBaseUrl: () => Promise<string>;
  /** 由 IAPITest 注入：发起请求前的就绪等待（确保 server listening） */
  ready: () => Promise<void>;
  /** 由 IAPITest 注入：请求前合并的额外 header（如 cookie） */
  cookieHeader?: () => string | undefined;
  /** 由 IAPITest 注入：响应回调，用于把 set-cookie 写回 session 的 cookie jar */
  onResponse?: (headers: Record<string, string>) => void;
  takeExample: boolean;
  agentTestName?: string;
  headers?: Record<string, string>;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  agentHeader?: Record<string, string>;
  agentInput: Record<string, unknown>;
  agentOutput?: Record<string, unknown>;
}

/**
 * 测试代理类
 */
export class TestAgent {
  public options: ITestAgentOption;
  public key: string;
  public debug: IDebugger;
  /** 内部请求状态（延迟构造，首次设置参数时建立） */
  private state: AgentState;

  /**
   * 构造函数
   */
  constructor(method: SUPPORT_METHODS, path: string, key: string, sourceFile: SourceResult, erestIns: ERest<unknown>) {
    assert(typeof method === "string", "`method` must be string");
    assert(
      SUPPORT_METHOD.indexOf(method.toLowerCase() as SUPPORT_METHODS) !== -1,
      `\`method\` must be one of ${SUPPORT_METHOD}`
    );
    assert(typeof path === "string", "`path` must be string");
    assert(path[0] === "/", '`path` must be start with "/"');
    this.options = {
      erest: erestIns,
      sourceFile,
      method: method.toLowerCase() as SUPPORT_METHODS,
      path,
      getBaseUrl: async () => "",
      ready: async () => {},
      takeExample: false,
      agentInput: {} as Record<string, unknown>,
    };
    this.key = key;
    this.debug = createDebug(`agent:${this.key}`);
    this.debug("new: %s %s from %s", method, path, sourceFile.absolute);
    this.state = {
      method: method.toLowerCase() as SUPPORT_METHODS,
      path,
      headers: {},
      query: {},
      body: undefined,
      reqPath: path,
    };
  }

  /** 注入 baseUrl 提供者与就绪回调（由 IAPITest 调用） */
  public bindRequest(
    getBaseUrl: () => Promise<string>,
    ready: () => Promise<void>,
    cookieHeader?: () => string | undefined,
    onResponse?: (headers: Record<string, string>) => void
  ) {
    this.options.getBaseUrl = getBaseUrl;
    this.options.ready = ready;
    this.options.cookieHeader = cookieHeader;
    this.options.onResponse = onResponse;
  }

  /** 获取测试代理（链式调用起点） */
  public agent(): TestAgent {
    debug("agent");
    return this;
  }

  /** 对测试结果加入文档 */
  public takeExample(name: string) {
    this.debug("takeExample: %s", name);
    this.options.agentTestName = name;
    this.options.takeExample = true;
    return this;
  }

  /** 设置请求header */
  public headers(data: Record<string, string>) {
    this.debug("headers: %j", data);
    this.options.agentHeader = data;
    Object.assign(this.state.headers, data);
    return this;
  }

  /** 添加 query 参数 */
  public query(data: Record<string, unknown>) {
    this.debug("query: %j", data);
    Object.assign(this.state.query, data);
    return this;
  }

  /** 添加输入参数 */
  public input(data: Record<string, unknown>) {
    this.debug("input: %j", data);
    Object.assign(this.options.agentInput, data);
    if (this.state.method === "get" || this.state.method === "delete") {
      Object.assign(this.state.query, data);
    } else {
      this.state.body = data;
    }
    return this;
  }

  /** 添加 multipart 字段/文件（attach） */
  public attach(data: Record<string, unknown>) {
    this.debug("attach: %j", data);
    const form = this.state.form ?? new FormData();
    for (const i in data) {
      if (data[i] instanceof stream.Readable) {
        form.append(i, data[i] as never);
        delete data[i];
      } else {
        form.append(i, String(data[i]));
      }
    }
    this.state.form = form;
    Object.assign(this.options.agentInput, data);
    return this;
  }

  /** 保存输出结果到 Example */
  private saveExample() {
    this.debug("Save Example: %o", this.options.takeExample);
    if (this.options.takeExample) {
      this.options.erest.api.$apis.get(this.key)?.example({
        name: this.options.agentTestName,
        path: this.state.reqPath,
        headers: this.options.agentHeader,
        input: this.options.agentInput || {},
        output: this.options.agentOutput,
      });
    }
  }

  /** 构造并执行请求，返回原始响应 */
  private async request(): Promise<RawResponse> {
    await this.options.ready();
    const baseUrl = await this.options.getBaseUrl();

    // 拼接 query string
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(this.state.query)) {
      if (v === undefined || v === null) continue;
      qs.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
    const search = qs.toString();
    const url = baseUrl + this.state.path + (search ? `?${search}` : "");
    this.state.reqPath = this.state.path + (search ? `?${search}` : "");

    // 合并 header（含 cookie）
    const headers: Record<string, string> = { ...this.state.headers };
    const cookie = this.options.cookieHeader?.();
    if (cookie) headers["cookie"] = cookie;

    let body: string | FormData | undefined;
    if (this.state.form) {
      body = this.state.form;
      // FormData 的 boundary 由 fetch 自动设置，不要手动 Content-Type
    } else if (this.state.body !== undefined && this.state.method !== "get" && this.state.method !== "delete") {
      headers["content-type"] = "application/json";
      body = JSON.stringify(this.state.body);
    }

    const res = await fetch(url, { method: this.state.method.toUpperCase(), headers, body });
    const text = await res.text();
    // 对齐 supertest 行为：JSON 响应解析为对象，非 JSON 响应 body 为 {}（text 单独保留）
    let parsed: unknown = {};
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json") && text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = {};
      }
    }
    const respHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      respHeaders[k] = v;
    });
    return { status: res.status, text, body: parsed, headers: respHeaders };
  }

  /** 获取输出结果 */
  private async output(raw = false, save = false): Promise<unknown> {
    const api = this.options.erest.api.$apis.get(this.key);
    if (api) {
      api.options.tested = true;
    }
    const res = await this.request();
    this.options.agentOutput = res.body as Record<string, unknown>;
    // session 模式：把 set-cookie 写回 cookie jar（供后续请求复用）
    if (this.options.onResponse) this.options.onResponse(res.headers);
    if (raw) return res;
    const formatOutputReverse = this.options.erest.api.formatOutputReverse || defaultFormatOutput;
    const [err2, ret] = formatOutputReverse(res.body);
    if (err2) throw err2;
    if (save) this.saveExample();
    return ret;
  }

  /**
   * 期望输出成功结果。
   *
   * 返回类型 T 可由调用方显式传入（如 `.success<UserVO>()`），便于从 response schema 推导；
   * 未传 T 时退回 unknown（向后兼容）。
   */
  public success<T = unknown>(): Promise<T> {
    this.debug("success");
    return this.output(false, true).catch((err) => {
      throw new Error(`${this.key} 期望API输出成功结果，但实际输出失败结果：${inspect(err)}`);
    }) as Promise<T>;
  }

  /** 期望输出失败结果 */
  public async error(): Promise<unknown> {
    this.debug("error");
    try {
      const ret = await this.output();
      throw new Error(`${this.key} 期望API输出失败结果，但实际输出成功结果：${inspect(ret)}`);
    } catch (err) {
      this.saveExample();
      return err;
    }
  }

  /** 获取原始输出 */
  public raw(): Promise<RawResponse> {
    this.debug("raw");
    return this.output(true, true) as Promise<RawResponse>;
  }
}
