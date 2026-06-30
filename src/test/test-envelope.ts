/**
 * @file 全局 response envelope 集成测试
 * 验证 setResponseEnvelopers 后 registerTyped handler return data 被自动包装
 */
import express from "express";
import { expressAdapter } from "./adapters";
import { httpReq as request } from "./http-req";
import { afterAll, describe, expect, it } from "vitest";
import lib from "./lib";

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
});

afterAll(() => {});
