/**
 * @file 全局 response envelope 集成测试
 * 验证 setResponseEnvelopers 后 registerTyped handler return data 被自动包装
 */
import { Application, component, Router } from "@leizm/web";
import express from "express";
import Koa from "koa";
import KoaRouter from "koa-router";
import { expressAdapter, koaAdapter, leizmwebAdapter } from "./adapters";
import { httpReq as request } from "./http-req";
import { afterAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { wrapWithEnvelope } from "../lib/adapters/utils.js";
import type { Context } from "../lib/adapters/types.js";
import lib from "./lib";

/** 构造最小 Context mock（state 可读写，reply 记录调用；__sent 模拟手动响应标记） */
function mockCtx(): Context & {
  __returned?: boolean;
  __returnValue?: unknown;
  reply: {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    markSent: ReturnType<typeof vi.fn>;
    raw: unknown;
    __sent?: boolean;
  };
} {
  const reply = {
    status: vi.fn(() => reply),
    json: vi.fn(() => {
      reply.__sent = true;
    }),
    send: vi.fn(() => {
      reply.__sent = true;
    }),
    markSent: vi.fn(() => {
      reply.__sent = true;
    }),
    raw: {},
    __sent: false,
  };
  return {
    method: "GET",
    path: "/",
    headers: {},
    params: {},
    query: {},
    body: {},
    state: {},
    reply,
  } as Context & { __returned?: boolean; __returnValue?: unknown; reply: typeof reply };
}

describe("全局 response envelope（registerTyped return 模式）", () => {
  const envelopers = {
    success: (data: unknown) => ({ success: true, data }),
    error: (err: unknown) => {
      const e = err as { statusCode?: number; code?: string; message?: string };
      return {
        body: { success: false, error: { code: e.code ?? "ERROR", message: e.message ?? "fail" } },
        status: e.statusCode ?? 500,
      };
    },
  };

  it("handler return data → success enveloper 自动包装", async () => {
    const app = express();
    app.use(express.json());
    const apiService = lib({ basePath: "" });
    apiService.setResponseEnvelopers(envelopers);

    apiService.api
      .get("/env-ok")
      .group("Index")
      .title("env-ok")
      .registerTyped({}, async () => {
        return { id: 1, name: "Tom" }; // return data，不调 reply
      });

    apiService.bind({ adapter: expressAdapter, router: app });
    const res = await request(app).get("/env-ok");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { id: 1, name: "Tom" } });
  });

  it("handler 抛错 → error enveloper 自动包装 + 状态码", async () => {
    const app = express();
    app.use(express.json());
    const apiService = lib({ basePath: "" });
    apiService.setResponseEnvelopers(envelopers);

    const boom = Object.assign(new Error("not found"), { statusCode: 404, code: "NOT_FOUND" });
    apiService.api
      .get("/env-err")
      .group("Index")
      .title("env-err")
      .registerTyped({}, async () => {
        throw boom;
      });

    apiService.bind({ adapter: expressAdapter, router: app });
    const res = await request(app).get("/env-err");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: { code: "NOT_FOUND", message: "not found" } });
  });

  it("handler 无 return → success enveloper 包 undefined", async () => {
    const app = express();
    app.use(express.json());
    const apiService = lib({ basePath: "" });
    apiService.setResponseEnvelopers(envelopers);

    apiService.api
      .post("/env-void")
      .group("Index")
      .title("env-void")
      .registerTyped({}, async () => {
        // 无 return
      });

    apiService.bind({ adapter: expressAdapter, router: app });
    const res = await request(app).post("/env-void").send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: undefined });
  });

  it("enveloper 模式 + response schema → 校验 return 值后再包装", async () => {
    const app = express();
    app.use(express.json());
    const apiService = lib({ basePath: "" });
    apiService.setResponseEnvelopers(envelopers);

    apiService.api
      .get("/env-schema")
      .group("Index")
      .title("env-schema")
      .registerTyped(
        { response: z.object({ id: z.number() }) },
        async () => ({ id: 7 }) // return 值会先经 response schema 校验，再经 enveloper 包装
      );

    apiService.bind({ adapter: expressAdapter, router: app });
    const res = await request(app).get("/env-schema");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { id: 7 } });
  });

  it("enveloper 模式 + response schema → return 值不合 schema 时抛错（走 error enveloper）", async () => {
    const app = express();
    app.use(express.json());
    const apiService = lib({ basePath: "" });
    apiService.setResponseEnvelopers(envelopers);

    apiService.api
      .get("/env-schema-bad")
      .group("Index")
      .title("env-schema-bad")
      .registerTyped(
        { response: z.object({ id: z.number() }) },
        async () => ({ id: "not-a-number" }) as never // 类型撒谎：实际返回 string
      );

    apiService.bind({ adapter: expressAdapter, router: app });
    const res = await request(app).get("/env-schema-bad");
    // response schema 校验失败 → 抛 ZodError → error enveloper 包装
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// wrapWithEnvelope 直接单测（不经子包 dist，确保 coverage 统计到 src/lib/adapters/utils）
describe("wrapWithEnvelope 单元测试", () => {
  it("未注册任何 enveloper 时零开销退化（返回原 dispatch）", () => {
    const dispatch = vi.fn();
    const wrapped = wrapWithEnvelope(dispatch as never, {});
    expect(wrapped).toBe(dispatch); // 直接返回原 dispatch，不包装
  });

  it("handler return data → successEnveloper 包装写入 reply.json", async () => {
    const ctx = mockCtx();
    ctx.__returned = true;
    ctx.__returnValue = { id: 1 };
    const success = vi.fn((data: unknown) => ({ success: true, data }));

    await wrapWithEnvelope(async () => Promise.resolve(), { success })(ctx);

    expect(success).toHaveBeenCalledWith({ id: 1 }, ctx);
    expect(ctx.reply.json).toHaveBeenCalledWith({ success: true, data: { id: 1 } });
  });

  it("handler 未置 __returned（自行调 ctx.reply）→ 不二次包装", async () => {
    const ctx = mockCtx();
    const success = vi.fn();

    await wrapWithEnvelope(async () => Promise.resolve(), { success })(ctx);

    expect(success).not.toHaveBeenCalled();
    expect(ctx.reply.json).not.toHaveBeenCalled();
  });

  it("handler 抛错 → errorEnveloper 包装 status + body", async () => {
    const ctx = mockCtx();
    const boom = Object.assign(new Error("not found"), { statusCode: 404 });
    const error = vi.fn(() => ({ body: { fail: true }, status: 404 }));

    await wrapWithEnvelope(async () => Promise.reject(boom), { error })(ctx);

    expect(error).toHaveBeenCalledWith(boom, ctx);
    expect(ctx.reply.status).toHaveBeenCalledWith(404);
    expect(ctx.reply.json).toHaveBeenCalledWith({ fail: true });
  });

  it("仅注册 success enveloper 时，抛错 re-throw（不吞错）", async () => {
    const ctx = mockCtx();
    const success = vi.fn();

    await expect(wrapWithEnvelope(async () => Promise.reject(new Error("escape")), { success })(ctx)).rejects.toThrow(
      "escape"
    );
    expect(success).not.toHaveBeenCalled();
  });

  it("__returned=true 但 returnValue=undefined → successEnveloper 仍被调用", async () => {
    const ctx = mockCtx();
    ctx.__returned = true;
    ctx.__returnValue = undefined;
    const success = vi.fn((data: unknown) => ({ ok: true, data }));

    await wrapWithEnvelope(async () => Promise.resolve(), { success })(ctx);

    expect(success).toHaveBeenCalledWith(undefined, ctx);
    expect(ctx.reply.json).toHaveBeenCalled();
  });

  it("reply.__sent=true（handler 调 markSent 手动响应）→ enveloper 跳过，不二次包装", async () => {
    const ctx = mockCtx();
    ctx.__returned = true;
    ctx.__returnValue = { raw: "csv" };
    ctx.reply.__sent = true; // 模拟 handler 已调 reply.markSent()
    const success = vi.fn();

    await wrapWithEnvelope(async () => Promise.resolve(), { success })(ctx);

    expect(success).not.toHaveBeenCalled();
    expect(ctx.reply.json).not.toHaveBeenCalled();
  });
});

// 三框架集成：enveloper 模式下 registerTyped handler 经 raw 手动写 CSV + reply.markSent()，
// enveloper 应跳过自动包装，响应体保持原始 CSV（而非被 json 覆盖/报错）。
const csvEnvelopers = {
  success: (data: unknown) => ({ success: true, data }),
  error: (err: unknown) => {
    const e = err as { statusCode?: number; message?: string };
    return { body: { error: e.message ?? "fail" }, status: e.statusCode ?? 500 };
  },
};

describe("enveloper + markSent 逃生舱 - Express", () => {
  const apiService = lib({
    forceGroup: true,
    info: { basePath: "" },
    groups: { api: { name: "api", prefix: "/api" } },
  });
  apiService.setResponseEnvelopers(csvEnvelopers);
  apiService
    .group("api")
    .get("/csv")
    .registerTyped({}, (req, ctx) => {
      // 经 raw 手动写非 JSON 响应（CSV），调 markSent 告知 enveloper 跳过
      const res = (ctx.reply.raw as { res: { setHeader: (n: string, v: string) => void; end: (b: string) => void } })
        .res;
      res.setHeader("Content-Type", "text/csv");
      res.end("a,b\n1,2");
      ctx.reply.markSent();
    });
  const app = express();
  app.use(express.json());
  apiService.bind({ adapter: expressAdapter, app, router: express.Router });

  it("raw 写 CSV + markSent → 响应体是原始 CSV，非信封", async () => {
    const res = await request(app).get("/api/csv");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toBe("a,b\n1,2");
  });
});

describe("enveloper + markSent 逃生舱 - @leizm/web", () => {
  const apiService = lib({
    forceGroup: true,
    info: { basePath: "" },
    groups: { api: { name: "api", prefix: "/api" } },
  });
  apiService.setResponseEnvelopers(csvEnvelopers);
  apiService
    .group("api")
    .get("/csv")
    .registerTyped({}, (req, ctx) => {
      const raw = ctx.reply.raw as {
        response: { setHeader: (n: string, v: string) => void; end: (b: string) => void };
      };
      raw.response.setHeader("Content-Type", "text/csv");
      raw.response.end("a,b\n1,2");
      ctx.reply.markSent();
    });
  const app = new Application();
  app.use("/", component.bodyParser.json());
  apiService.bind({ adapter: leizmwebAdapter, app, router: Router });

  it("raw 写 CSV + markSent → 响应体是原始 CSV，非信封", async () => {
    const res = await request(app.server).get("/api/csv");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toBe("a,b\n1,2");
  });
});

describe("enveloper + markSent 逃生舱 - Koa", () => {
  const apiService = lib({
    forceGroup: true,
    info: { basePath: "" },
    groups: { api: { name: "api", prefix: "/api" } },
  });
  apiService.setResponseEnvelopers(csvEnvelopers);
  apiService
    .group("api")
    .get("/csv")
    .registerTyped({}, (req, ctx) => {
      // Koa：用原生 ctx 赋值写响应（Koa 惯例：ctx.type + ctx.body 均为 setter），markSent 阻止 enveloper 覆盖
      const raw = ctx.reply.raw as { type: string; body: unknown };
      raw.type = "text/csv";
      raw.body = "a,b\n1,2";
      ctx.reply.markSent();
    });
  const app = new Koa();
  apiService.bind({ adapter: koaAdapter, app, router: KoaRouter });

  it("raw 写 CSV + markSent → 响应体是原始 CSV，非信封", async () => {
    const res = await request(app.callback()).get("/api/csv");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toBe("a,b\n1,2");
  });
});

afterAll(() => {});
