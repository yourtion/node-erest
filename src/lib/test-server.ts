/**
 * @file 测试用 HTTP 服务归一化（替代 supertest 的无端口内存 HTTP）
 *
 * native fetch 必须向真实监听端口的 http.Server 发请求，不能像 supertest 那样
 * 直接吃 express app 做内存级 HTTP。本模块把 initTest 接收的多种 app 形态统一
 * 归一化为「随机端口的 http.Server + baseUrl」，并在测试进程退出时自动关闭。
 *
 * 支持的 app 形态：
 *   - Express 应用（有 .listen）：内部 listen(0)
 *   - Express router / 普通 function（请求处理函数）：用 node:http 直接 createServer
 *   - Koa app.callback()（function）：createServer(callback)
 *   - http.Server（koa/leizmweb 已 listen）：直接取 address
 *
 * 延迟 listen：只有真正发请求时才启动 server，避免 initTest(mockObject) 时空对象炸掉。
 */

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/** 归一化后的测试目标 */
export interface TestTarget {
  /** 请求基址，如 http://127.0.0.1:34567 */
  baseUrl: string;
  /** 底层 server（供测试结束关闭；若由调用方传入已 listen 的 server 则不负责关闭） */
  server?: Server;
}

/** 是否为 http.Server（已具备 listen/address） */
function isHttpServer(obj: unknown): obj is Server {
  return (
    typeof obj === "object" &&
    obj !== null &&
    typeof (obj as Server).listen === "function" &&
    typeof (obj as Server).address === "function"
  );
}

/** 是否为 Express 应用（有 listen + handle/dispatch，且非原生 http.Server） */
function isExpressApp(obj: unknown): boolean {
  return (
    typeof obj === "object" &&
    obj !== null &&
    typeof (obj as { listen?: unknown }).listen === "function" &&
    typeof (obj as { handle?: unknown }).handle === "function"
  );
}

/**
 * 把任意 app 形态归一化为测试目标。延迟调用：只在真正需要 baseUrl 时执行。
 * 返回的 server 若为新启动的，会被 unref 以免阻塞测试进程退出。
 */
export function normalizeTestTarget(app: unknown): TestTarget {
  // 已是 http.Server（koa/leizmweb 已 .listen()）：直接取地址
  if (isHttpServer(app)) {
    const addr = app.address();
    // 未 listen 的 server（如 leizmweb 的 app.server 但未 listen）需要 listen(0)
    if (!addr) {
      return startServer(app as Server);
    }
    return { baseUrl: addressToUrl(addr), server: undefined };
  }

  // Express 应用：listen(0) 拿随机端口
  if (isExpressApp(app)) {
    const server = (app as unknown as { listen: (port: number) => Server }).listen(0);
    server.unref?.();
    return startServer(server);
  }

  // 普通函数（Express router 或 Koa app.callback()）：包装成 http.Server
  if (typeof app === "function") {
    const server = createServer(app as (req: unknown, res: unknown) => void);
    return startServer(server);
  }

  throw new Error(`initTest 接收到了不支持的 app 形态：${typeof app}`);
}

/** 启动一个未 listen 的 server 到随机端口，返回 baseUrl */
function startServer(server: Server): TestTarget {
  // 同步 listen 后立即取地址（Node 的 listen(0) 在 'listening' 前 address() 返回 null，
  // 但用 listen(0, cb) 不可同步；改用 0 端口 + 同步读取需等到下个 tick。
  // 这里返回一个 lazy baseUrl getter，由调用方 await 保证已 listening。）
  server.unref?.();
  server.listen(0);
  // listen 是异步的，但在本进程内 listen(0) 几乎立即完成；
  // 为稳健起见，暴露一个 ready() Promise，由 TestAgent 在 fetch 前 await。
  return {
    get baseUrl() {
      const addr = server.address();
      return addressToUrl(addr as AddressInfo | string | null);
    },
    server,
    ready: () =>
      new Promise<void>((resolve) => {
        if (server.listening) return resolve();
        server.once("listening", () => resolve());
      }),
  } as TestTarget & { ready: () => Promise<void> };
}

/** address 转可访问的地址对象（把通配地址归一化为 localhost） */
function addressToObj(addr: AddressInfo | string | null): AddressInfo {
  if (typeof addr === "string") {
    // unix socket，测试场景不期望出现
    return { address: "127.0.0.1", port: 0, family: "IPv4" };
  }
  if (!addr) {
    throw new Error("server 尚未 listening，无法获取 baseUrl");
  }
  // IPv6/IPv4 通配地址（:: / 0.0.0.0）归一化为 localhost
  if (addr.address === "::" || addr.address === "0.0.0.0") {
    return { address: "127.0.0.1", port: addr.port, family: "IPv4" };
  }
  return addr;
}

function addressToUrl(addr: AddressInfo | string | null): string {
  const a = addressToObj(addr);
  // IPv6 loopback 需要方括号
  const host = a.address.includes(":") ? `[${a.address}]` : a.address;
  return `http://${host}:${a.port}`;
}
