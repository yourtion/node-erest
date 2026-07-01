/**
 * @file 三框架对齐：forceGroup 模式下 `:param` 多层路径 + 同前缀多路由的路由匹配回归。
 *
 * 背景：one-api 在 leizm/web adapter 下，同 group 注册 `/tables/:id/data`、
 * `/tables/:id/export`、`/tables/:id/data/:pk` 后，`/tables/:id/export`（非 typed .register()）
 * 返回 404，而同路径改 .registerTyped() 后 200。erest 自身 leizmweb 集成测试只覆盖静态路径，
 * 未覆盖 `:param` + 多层字面段 + 同前缀多路由的形态。本文件三框架对齐验证该场景。
 */
import { describe, expect, it } from "vitest";
import { Application, component, Router } from "@leizm/web";
import express from "express";
import Koa from "koa";
import KoaRouter from "koa-router";
import { expressAdapter, koaAdapter, leizmwebAdapter } from "./adapters";
import { httpReq } from "./http-req";
import lib from "./lib";

/**
 * 在给定 apiService 上注册一组「`:param` 多层路径 + 同前缀多路由」的 API。
 * 模拟 one-api admin-data 路由形态：
 *   GET /items/:id/data         （registerTyped）
 *   GET /items/:id/export       （register 非typed）
 *   GET /items/:id/data/:pk     （registerTyped）
 *   GET /items/:id/refresh      （registerTyped，固定字面段）
 */
function registerMultilevelRoutes(apiService: ReturnType<typeof lib>): void {
  const g = apiService.group("api");
  g.get("/items/:id/data").registerTyped({ params: z.object({ id: z.string() }) }, (req, ctx) => {
    ctx.reply.json({ data: req.params.id });
  });
  g.get("/items/:id/export").register((ctx) => {
    ctx.reply.send("csv-content");
  });
  g.get("/items/:id/data/:pk").registerTyped({ params: z.object({ id: z.string(), pk: z.string() }) }, (req, ctx) => {
    ctx.reply.json({ pk: req.params.pk });
  });
  g.get("/items/:id/refresh").registerTyped({ params: z.object({ id: z.string() }) }, (req, ctx) => {
    ctx.reply.json({ refreshed: req.params.id });
  });
}

import { z } from "zod";

describe("多层级路径对齐 - Express", () => {
  const apiService = lib({
    forceGroup: true,
    info: { basePath: "" },
    groups: { api: { name: "api", prefix: "/api" } },
  });
  registerMultilevelRoutes(apiService);
  const app = express();
  app.use(express.json());
  apiService.bind({ adapter: expressAdapter, app, router: express.Router });

  it("GET /api/items/1/data → 200", async () => {
    const res = await httpReq(app).get("/api/items/1/data");
    expect(res.status).toBe(200);
  });
  it("GET /api/items/1/export（register 非typed）→ 200", async () => {
    const res = await httpReq(app).get("/api/items/1/export");
    expect(res.status).toBe(200);
    expect(res.text).toBe("csv-content");
  });
  it("GET /api/items/1/data/99 → 200", async () => {
    const res = await httpReq(app).get("/api/items/1/data/99");
    expect(res.status).toBe(200);
  });
  it("GET /api/items/1/refresh → 200", async () => {
    const res = await httpReq(app).get("/api/items/1/refresh");
    expect(res.status).toBe(200);
  });
});

describe("多层级路径对齐 - @leizm/web", () => {
  const apiService = lib({
    forceGroup: true,
    info: { basePath: "" },
    groups: { api: { name: "api", prefix: "/api" } },
  });
  registerMultilevelRoutes(apiService);
  const app = new Application();
  app.use("/", component.bodyParser.json());
  apiService.bind({ adapter: leizmwebAdapter, app, router: Router });

  it("GET /api/items/1/data → 200", async () => {
    const res = await httpReq(app.server).get("/api/items/1/data");
    expect(res.status).toBe(200);
  });
  it("GET /api/items/1/export（register 非typed）→ 200", async () => {
    const res = await httpReq(app.server).get("/api/items/1/export");
    expect(res.status).toBe(200);
    expect(res.text).toBe("csv-content");
  });
  it("GET /api/items/1/data/99 → 200", async () => {
    const res = await httpReq(app.server).get("/api/items/1/data/99");
    expect(res.status).toBe(200);
  });
  it("GET /api/items/1/refresh → 200", async () => {
    const res = await httpReq(app.server).get("/api/items/1/refresh");
    expect(res.status).toBe(200);
  });
});

describe("多层级路径对齐 - Koa", () => {
  const apiService = lib({
    forceGroup: true,
    info: { basePath: "" },
    groups: { api: { name: "api", prefix: "/api" } },
  });
  registerMultilevelRoutes(apiService);
  const app = new Koa();
  app.use(async (ctx, next) => {
    try {
      await next();
    } catch (err: unknown) {
      ctx.status = (err as { statusCode?: number }).statusCode ?? 500;
      ctx.type = "application/json";
      ctx.body = JSON.stringify({ message: (err as Error).message });
    }
  });
  apiService.bind({ adapter: koaAdapter, app, router: KoaRouter });

  it("GET /api/items/1/data → 200", async () => {
    const res = await httpReq(app.callback()).get("/api/items/1/data");
    expect(res.status).toBe(200);
  });
  it("GET /api/items/1/export（register 非typed）→ 200", async () => {
    const res = await httpReq(app.callback()).get("/api/items/1/export");
    expect(res.status).toBe(200);
    expect(res.text).toBe("csv-content");
  });
  it("GET /api/items/1/data/99 → 200", async () => {
    const res = await httpReq(app.callback()).get("/api/items/1/data/99");
    expect(res.status).toBe(200);
  });
  it("GET /api/items/1/refresh → 200", async () => {
    const res = await httpReq(app.callback()).get("/api/items/1/refresh");
    expect(res.status).toBe(200);
  });
});
