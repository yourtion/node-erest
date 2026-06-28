/**
 * @file API Test
 * @author Yourtion Guo <yourtion@gmail.com>
 *
 * v3：测试引擎改用 Node 18+ 内置 fetch，不再依赖 supertest。
 * initTest 接收的 app 形态由 test-server 归一化为随机端口的 http.Server。
 * 对外 API（test.get/post/.../session、$agent）保持兼容。
 */

import { strict as assert } from "node:assert";
import { TestAgent } from "../agent.js";
import { normalizeTestTarget, type TestTarget } from "../test-server.js";
import type { SUPPORT_METHODS } from "../api.js";
import { test as debug } from "../debug.js";
import type ERest from "../index.js";
import type { IApiOptionInfo } from "../index.js";
import { getCallerSourceLine, getSchemaKey, type ISupportMethds, type SourceResult } from "../utils.js";

/** 测试Agent */
export type IAgent = Readonly<ISupportMethds<(path: string) => TestAgent>>;

/** fetch 会话：持有 cookie jar，$agent 暴露 cookie 读写（替代 supertest agent） */
export interface IFetchSession {
  /** 读取当前 cookie header（供 TestAgent 注入请求） */
  getCookieHeader: () => string | undefined;
  /** 从响应更新 cookie jar */
  updateCookies: (headers: Record<string, string>) => void;
}

export interface ITestSession extends IAgent {
  /** 原始 fetch 会话（cookie jar） */
  readonly $agent: IFetchSession;
}

export default class IAPITest {
  private erest: ERest<unknown>;
  private info: IApiOptionInfo;
  private testPath: string;
  /** 归一化后的测试目标（首次请求时 lazy 初始化） */
  private target?: TestTarget;
  /** session 级 cookie jar：name -> value */
  private cookies: Map<string, string> = new Map();

  constructor(erestIns: ERest<unknown>, path: string) {
    this.erest = erestIns;
    const { info } = this.erest.getTestView();
    this.info = info;
    this.testPath = path;
  }

  /** 归一化 app 为测试目标（lazy，首次请求时触发） */
  private getTarget(): TestTarget {
    if (this.target) return this.target;
    const app = this.erest.getTestView().app;
    assert(app, "请先调用 initTest(app) 设置 app 实例");
    this.target = normalizeTestTarget(app);
    return this.target;
  }

  /** 注入给 TestAgent 的 baseUrl 提供者 */
  private getBaseUrl = async (): Promise<string> => {
    const t = this.getTarget();
    const ready = (t as { ready?: () => Promise<void> }).ready;
    if (ready) await ready();
    return t.baseUrl;
  };

  /** 注入给 TestAgent 的就绪等待 */
  private ready = async (): Promise<void> => {
    const t = this.getTarget();
    const ready = (t as { ready?: () => Promise<void> }).ready;
    if (ready) await ready();
  };

  /** session 模式：读取 cookie header */
  private getCookieHeader = (): string | undefined => {
    if (this.cookies.size === 0) return undefined;
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  };

  get get() {
    return this.buildTest("get");
  }

  get post() {
    return this.buildTest("post");
  }

  get put() {
    return this.buildTest("put");
  }

  get delete() {
    return this.buildTest("delete");
  }

  get patch() {
    return this.buildTest("patch");
  }

  /** 创建测试会话（cookie 持久化，复用同一个 TestAgent 上下文） */
  public session(): ITestSession {
    assert(this.erest.getTestView().app, "请先调用 initTest(app) 设置 app 实例");

    const cookieSession: IFetchSession = {
      getCookieHeader: this.getCookieHeader,
      updateCookies: (headers) => {
        const setCookie = headers["set-cookie"];
        if (setCookie) {
          // 简化解析：name=value（取分号前的第一段）
          for (const c of setCookie.split(/,(?=\s*[a-zA-Z_-]+=)/)) {
            const m = c.trim().match(/^([^=;]+)=([^;]*)/);
            if (m) this.cookies.set(m[1].trim(), m[2].trim());
          }
        }
      },
    };

    const buildSession = (method: SUPPORT_METHODS) => {
      return (path: string) => {
        const s = this.findApi(method, path);
        if (!s || !s.key) throw new Error(`尝试请求未注册的API：${method} ${path}`);
        const a = new TestAgent(method, path, s.key, s.options.sourceFile as SourceResult, this.erest);
        a.bindRequest(this.getBaseUrl, this.ready, this.getCookieHeader, cookieSession.updateCookies);
        return a.agent();
      };
    };

    return {
      $agent: cookieSession,
      get: buildSession("get"),
      post: buildSession("post"),
      put: buildSession("put"),
      delete: buildSession("delete"),
      patch: buildSession("patch"),
    };
  }

  /** 根据请求方法和请求路径查找对应的API */
  private findApi(method: SUPPORT_METHODS, path: string) {
    const routerPath = this.info.basePath ? path.replace(this.info.basePath, "") : path;
    const key = getSchemaKey(method, routerPath);
    debug(method, path, key);
    if (this.erest.api.$apis.get(key)) {
      return this.erest.api.$apis.get(key);
    }
    for (const s of this.erest.api.$apis.values()) {
      if (s.pathTest(method, routerPath)) return s;
    }
    return;
  }

  /** 生成测试方法 */
  private buildTest(method: SUPPORT_METHODS) {
    return (path: string) => {
      const s = this.findApi(method, path);
      if (!s || !s.key) {
        throw new Error(`尝试请求未注册的API：${method} ${path}`);
      }
      const a = new TestAgent(method, path, s.key, getCallerSourceLine(this.testPath), this.erest);
      assert(this.erest.getTestView().app, "请先调用 initTest(app) 设置 app 实例");
      a.bindRequest(this.getBaseUrl, this.ready);
      return a.agent();
    };
  }
}
