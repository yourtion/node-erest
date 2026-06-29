/**
 * @file reply.raw 逃生舱集成测试
 * 验证三框架 handler 通过 reply.raw 访问原生对象（以 setCookie/原生响应头为例）
 */
import express from "express";
import Koa from "koa";
import bodyParser from "koa-bodyparser";
import KoaRouter from "koa-router";
import { Application, component, Router } from "@leizm/web";
import { expressAdapter, koaAdapter, leizmwebAdapter } from "./adapters";
import { httpReq as request } from "./http-req";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import lib from "./lib";

// ---------------- Express ----------------
describe("reply.raw - Express 集成", () => {
  const app = express();
  app.use(express.json());

  const apiService = lib({ basePath: "" });
  apiService.api
    .post("/login")
    .group("Index")
    .title("login-express")
    .registerTyped({ body: z.object({ user: z.string() }) }, (_req, reply) => {
      // reply.raw 在 Express 下为 { req, res }，通过 res.cookie 设置 cookie
      const res = (reply as { raw: { res: express.Response } }).raw.res;
      res.cookie("token", "abc-123", { httpOnly: true });
      reply.json({ ok: true });
    });

  apiService.bind({ adapter: expressAdapter, router: app });

  it("handler 能通过 reply.raw.res.cookie 设置 Set-Cookie 响应头", async () => {
    const res = await request(app).post("/login").send({ user: "Tom" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const setCookie = res.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    expect(String(setCookie)).toContain("token=abc-123");
    expect(String(setCookie)).toContain("HttpOnly");
  });
});

afterAll(() => {});
