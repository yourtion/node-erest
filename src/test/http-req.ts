/**
 * @file 轻量 HTTP 测试客户端（替代 supertest，基于 Node 18+ 内置 fetch）
 *
 * 供集成测试直接对框架 app/server 做纯 HTTP 断言（status/body）。
 * 与 erest 的 api.test.* 不同：本 helper 不经过 erest 测试引擎，纯粹验证
 * 框架接入后的真实 HTTP 行为。
 *
 * 用法对齐 supertest 习惯：
 *   const res = await httpReq(app).put("/path?x=1").send({ name: "Tom" });
 *   expect(res.status).toBe(200);
 *   expect(res.body).toEqual({ ... });
 *
 * app 形态：express app（自动 listen(0)）/ http.Server（已 listen）/ koa callback。
 */
import { normalizeTestTarget, type TestTarget } from "../lib/test-server.js";

export interface HttpResponse {
  status: number;
  body: unknown;
  text: string;
  /** 响应头（小写键名，支持读取 set-cookie 等原生头） */
  headers: Record<string, string | string[] | undefined>;
}

interface ReqState {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: unknown;
}

/** 创建针对某个 app 的请求构造器 */
export function httpReq(app: unknown) {
  let target: TestTarget | undefined;
  const getTarget = (): TestTarget => {
    if (!target) target = normalizeTestTarget(app);
    return target;
  };
  const ensureReady = async () => {
    const t = getTarget();
    const ready = (t as { ready?: () => Promise<void> }).ready;
    if (ready) await ready();
  };

  const builder = (method: string) => (path: string) => {
    const state: ReqState = { method: method.toUpperCase(), path, headers: {} };
    const chain = {
      /** 设置请求头 */
      set: (key: string, value: string) => {
        state.headers[key] = value;
        return chain;
      },
      /** 发送 JSON body */
      send: (data: unknown) => {
        state.body = data;
        return chain;
      },
      /** 执行请求（chain 对象作为 thenable，支持 await） */
      // eslint-disable-next-line unicorn/no-thenable -- 测试助手链式对象需实现 thenable 协议以支持 await
      then: async (onFulfilled: (res: HttpResponse) => unknown, onRejected?: (err: unknown) => unknown) => {
        try {
          await ensureReady();
          const t = getTarget();
          const headers = { ...state.headers };
          let body: string | undefined;
          if (state.body !== undefined) {
            headers["content-type"] = "application/json";
            body = JSON.stringify(state.body);
          }
          const res = await fetch(t.baseUrl + state.path, { method: state.method, headers, body });
          const text = await res.text();
          // 收集响应头为 plain object（小写键名）；set-cookie 保留为数组以支持多值
          const respHeaders: Record<string, string | string[] | undefined> = {};
          res.headers.forEach((value, key) => {
            respHeaders[key.toLowerCase()] = value;
          });
          const setCookie = res.headers.getSetCookie?.();
          if (setCookie && setCookie.length > 0) {
            respHeaders["set-cookie"] = setCookie.length === 1 ? setCookie[0] : setCookie;
          }
          let parsed: unknown = {};
          const ct = res.headers.get("content-type") || "";
          if ((ct.includes("json") || text.startsWith("{") || text.startsWith("[")) && text) {
            try {
              parsed = JSON.parse(text);
            } catch {
              parsed = {};
            }
          }
          return onFulfilled({ status: res.status, body: parsed, text, headers: respHeaders });
        } catch (err) {
          if (onRejected) return onRejected(err);
          throw err;
        }
      },
    };
    // 让 chain 可被 await（thenable）
    return chain;
  };

  return {
    get: builder("get"),
    post: builder("post"),
    put: builder("put"),
    delete: builder("delete"),
    patch: builder("patch"),
  };
}
