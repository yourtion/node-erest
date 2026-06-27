import express from "express";
import { describe, test, expect } from "vitest";
import { z } from "zod";
import lib from "./lib.js";

/** 启动 express 服务并发起请求的辅助 */
async function request(apiService: ReturnType<typeof lib>, method: string, path: string, body?: unknown) {
  const app = express();
  const router = express.Router();
  router.use(express.json());
  app.use("/api", router);
  apiService.bind({ framework: "express", router });
  const server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text };
  } finally {
    server.close();
  }
}

describe("Lifecycle Hooks", () => {
  test("无 hooks 时正常工作（零开销分支）", async () => {
    const apiService = lib();
    apiService.api
      .get("/no-hooks")
      .group("Index")
      .register((ctx) => ctx.reply.send("ok"));
    const ret = await request(apiService, "GET", "/no-hooks");
    expect(ret.status).toBe(200);
    expect(ret.body).toBe("ok");
  });

  test("hook 按 onRequest → onValidate → onResponse 顺序触发", async () => {
    const order: string[] = [];
    const apiService = lib({
      hooks: {
        onRequest: () => order.push("request"),
        onValidate: () => order.push("validate"),
        onError: () => order.push("error"),
        onResponse: () => order.push("response"),
      },
    });
    apiService.api
      .get("/hooks-order")
      .group("Index")
      .query(z.object({ name: z.string() }))
      .register((ctx) => ctx.reply.send("ok"));
    await request(apiService, "GET", "/hooks-order?name=hello");
    expect(order).toEqual(["request", "validate", "response"]);
  });

  test("onError 在校验失败时触发并保留 ERestError 上下文", async () => {
    let caught: Error | undefined;
    const apiService = lib({
      hooks: { onError: (_ctx, err) => (caught = err) },
    });
    apiService.api
      .get("/hooks-error")
      .group("Index")
      .query(z.object({ name: z.string() }))
      .register((ctx) => ctx.reply.send("ok"));
    // 不传 name，触发 missing required parameter
    await request(apiService, "GET", "/hooks-error");
    expect(caught).toBeDefined();
    expect(caught?.message).toMatch(/missing required parameter/);
  });

  test("hook 异常不影响主流程（观察者语义）", async () => {
    const apiService = lib({
      hooks: {
        onRequest: () => {
          throw new Error("hook boom");
        },
      },
    });
    apiService.api
      .get("/hook-throws")
      .group("Index")
      .register((ctx) => ctx.reply.send("ok"));
    const ret = await request(apiService, "GET", "/hook-throws");
    // hook 抛错被吞掉，请求正常完成
    expect(ret.status).toBe(200);
    expect(ret.body).toBe("ok");
  });
});
