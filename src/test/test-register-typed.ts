/**
 * @file registerTyped 跨框架集成测试
 * @author Yourtion Guo <yourtion@gmail.com>
 *
 * 验证 registerTyped 在 Express / Koa / @leizm/web 三个框架下均能正确读取分层校验参数，
 * 以及 $reply 框架无关响应、分层访问器（标准化后 handler 接收标准 ctx）。
 */

import { expressAdapter, koaAdapter, leizmwebAdapter } from "./adapters";

import { Application, component, Router } from "@leizm/web";
import express from "express";
import Koa from "koa";
import bodyParser from "koa-bodyparser";
import KoaRouter from "koa-router";
import { httpReq as request } from "./http-req";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import lib from "./lib";

const schemas = {
  params: z.object({ id: z.string() }),
  query: z.object({ include: z.string().optional() }),
  body: z.object({ name: z.string(), age: z.number().int() }),
};

// ---------------- Express ----------------
describe("registerTyped - Express 集成", () => {
  const app = express();
  app.use(express.json());

  const apiService = lib({ basePath: "" });
  const { api } = apiService;

  api
    .put("/typed/:id")
    .group("Index")
    .title("typed-express")
    .registerTyped(
      {
        ...schemas,
        response: z.object({
          id: z.string(),
          include: z.string().nullable(),
          name: z.string(),
          age: z.number(),
          typed: z.boolean(),
        }),
      },
      (req, reply) => {
        reply.status(201).json({
          id: req.params.id,
          include: req.query.include ?? null,
          name: req.body.name,
          age: req.body.age,
          typed: true,
        });
      }
    );

  apiService.bind({ adapter: expressAdapter, router: app });
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err.statusCode || 400).json({ message: err.message });
  });

  it("应正确读取 params/query/body 分层参数", async () => {
    const res = await request(app).put("/typed/42?include=profile").send({ name: "Tom", age: 20 });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: "42", include: "profile", name: "Tom", age: 20, typed: true });
  });

  it("body 校验失败时应返回 400", async () => {
    const res = await request(app).put("/typed/42").send({ name: "Tom", age: 1.5 });
    expect(res.status).toBe(400);
  });
});

// ---------------- Koa ----------------
describe("registerTyped / 分层访问器 - Koa 集成", () => {
  function buildApp() {
    const app = new Koa();
    app.use(bodyParser());
    app.use(async (ctx, next) => {
      try {
        await next();
      } catch (err: unknown) {
        ctx.status = (err as { statusCode?: number }).statusCode || 400;
        ctx.type = "application/json";
        ctx.body = JSON.stringify({ message: (err as Error).message });
      }
    });
    return app;
  }

  it("registerTyped 应在 Koa 下正确读取校验后的参数", async () => {
    const app = buildApp();
    const apiService = lib({ basePath: "" });
    const router = new KoaRouter();
    apiService.api
      .put("/typed/:id")
      .group("Index")
      .title("typed-koa")
      .registerTyped(schemas, (req, reply) => {
        reply.json({ id: req.params.id, name: req.body.name, age: req.body.age, include: req.query.include ?? null });
      });
    apiService.bind({ adapter: koaAdapter, router });
    app.use(router.routes()).use(router.allowedMethods());
    const server = app.listen();
    const res = await request(server).put("/typed/7?include=full").send({ name: "Jerry", age: 33 });
    server.close();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "7", name: "Jerry", age: 33, include: "full" });
  });

  it("registerTyped 应在 Koa 下拒绝非法 body", async () => {
    const app = buildApp();
    const apiService = lib({ basePath: "" });
    const router = new KoaRouter();
    apiService.api
      .put("/typed/:id")
      .group("Index")
      .registerTyped(schemas, () => ({}));
    apiService.bind({ adapter: koaAdapter, router });
    app.use(router.routes()).use(router.allowedMethods());
    const server = app.listen();
    const res = await request(server).put("/typed/7").send({ name: "Jerry", age: "no" });
    server.close();
    expect(res.status).toBe(400);
  });

  it("ctx.$validated 应被注入且分层正确", async () => {
    const app = buildApp();
    const apiService = lib({ basePath: "" });
    const router = new KoaRouter();
    apiService.api
      .put("/v/:id")
      .group("Index")
      .title("validated-koa")
      .params(z.object({ id: z.string() }))
      .body(z.object({ name: z.string() }))
      .register((ctx: any) => {
        const v = ctx.$validated;
        ctx.reply.json({ id: v.params.id, name: v.body.name });
      });
    apiService.bind({ adapter: koaAdapter, router });
    app.use(router.routes()).use(router.allowedMethods());
    const server = app.listen();
    const res = await request(server).put("/v/9").send({ name: "Cara" });
    server.close();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "9", name: "Cara" });
  });
});

// ---------------- @leizm/web ----------------
describe("registerTyped / 分层访问器 - @leizm/web 集成", () => {
  it("registerTyped 应在 @leizm/web 下用 reply 正确写响应", async () => {
    const app = new Application();
    app.use("/", component.bodyParser.json());
    const apiService = lib({ basePath: "" });
    const router = new Router();
    apiService.api
      .put("/typed/:id")
      .group("Index")
      .title("typed-lei")
      .registerTyped(schemas, (req, reply) => {
        reply.json({ id: req.params.id, name: req.body.name, age: req.body.age });
      });
    apiService.bind({ adapter: leizmwebAdapter, router });
    app.use("/", router);
    const res = await request(app.server).put("/typed/99").send({ name: "Anna", age: 28 });
    app.server.close();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "99", name: "Anna", age: 28 });
  });

  it("ctx.$validated 应被注入且分层正确", async () => {
    const app = new Application();
    app.use("/", component.bodyParser.json());
    const apiService = lib({ basePath: "" });
    const router = new Router();
    apiService.api
      .put("/v/:id")
      .group("Index")
      .title("validated-lei")
      .params(z.object({ id: z.string() }))
      .query(z.object({ q: z.string().optional() }))
      .body(z.object({ name: z.string() }))
      .register((ctx: any) => {
        const v = ctx.$validated;
        ctx.reply.json({ id: v.params.id, q: v.query.q ?? null, name: v.body.name });
      });
    apiService.bind({ adapter: leizmwebAdapter, router });
    app.use("/", router);
    const res = await request(app.server).put("/v/5?q=hi").send({ name: "Bob" });
    app.server.close();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "5", q: "hi", name: "Bob" });
  });

  it("$params（扁平）与分层访问器应同时注入", async () => {
    const app = new Application();
    app.use("/", component.bodyParser.json());
    const apiService = lib({ basePath: "" });
    const router = new Router();
    apiService.api
      .put("/dual/:id")
      .group("Index")
      .title("dual")
      .params(z.object({ id: z.coerce.number() }))
      .body(z.object({ name: z.string() }))
      .register((ctx: any) => {
        const flat = ctx.$params;
        const layered = ctx.$validated;
        ctx.reply.json({
          flatId: flat.id,
          flatName: flat.name,
          layeredId: layered.params.id,
          layeredName: layered.body.name,
          pathId: ctx.$pathParams.id,
          bodyName: ctx.$body.name,
        });
      });
    apiService.bind({ adapter: leizmwebAdapter, router });
    app.use("/", router);
    const res = await request(app.server).put("/dual/3").send({ name: "Dan" });
    app.server.close();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      flatId: 3,
      flatName: "Dan",
      layeredId: 3,
      layeredName: "Dan",
      pathId: 3,
      bodyName: "Dan",
    });
  });
});

// ---------------- $reply 框架无关响应 ----------------
describe("$reply 框架无关响应（同一 handler 三框架复用）", () => {
  const makeRoutes = (apiObj: { api: any }, store: Map<number, any>) => {
    apiObj.api
      .post("/users")
      .group("Index")
      .title("create")
      .registerTyped({ body: z.object({ name: z.string(), age: z.number().int() }) }, (req, reply) => {
        const id = store.size + 1;
        store.set(id, req.body);
        reply.status(201).json({ success: true, id });
      });
    apiObj.api
      .get("/users/:id")
      .group("Index")
      .title("get")
      .registerTyped({ params: z.object({ id: z.coerce.number() }) }, (req, reply) => {
        const user = store.get(req.params.id);
        if (!user) {
          reply.status(404).json({ error: "not found" });
          return;
        }
        reply.json(user);
      });
  };

  it("Express：reply.json/status 正确写入响应", async () => {
    const app = express();
    app.use(express.json());
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(err.statusCode || 400).json({ message: err.message });
    });
    const apiService = lib({ basePath: "" });
    makeRoutes(apiService as any, new Map());
    apiService.bind({ adapter: expressAdapter, router: app });
    const created = await request(app).post("/users").send({ name: "Tom", age: 20 });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ success: true, id: 1 });
    const got = await request(app).get("/users/1");
    expect(got.status).toBe(200);
    expect(got.body).toEqual({ name: "Tom", age: 20 });
    const miss = await request(app).get("/users/999");
    expect(miss.status).toBe(404);
  });

  it("Koa：reply.json/status 正确写入响应", async () => {
    const koa = new Koa();
    koa.use(bodyParser());
    koa.use(async (ctx, next) => {
      try {
        await next();
      } catch (err: unknown) {
        ctx.status = 400;
        ctx.body = { message: (err as Error).message };
      }
    });
    const apiService = lib({ basePath: "" });
    const router = new KoaRouter();
    makeRoutes(apiService as any, new Map());
    apiService.bind({ adapter: koaAdapter, router });
    koa.use(router.routes()).use(router.allowedMethods());
    const server = koa.listen();
    const created = await request(server).post("/users").send({ name: "Jerry", age: 33 });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ success: true, id: 1 });
    const got = await request(server).get("/users/1");
    expect(got.status).toBe(200);
    expect(got.body).toEqual({ name: "Jerry", age: 33 });
    server.close();
  });

  it("@leizm/web：reply.json/status 正确写入响应", async () => {
    const app = new Application();
    app.use("/", component.bodyParser.json());
    const apiService = lib({ basePath: "" });
    const router = new Router();
    makeRoutes(apiService as any, new Map());
    apiService.bind({ adapter: leizmwebAdapter, router });
    app.use("/", router);
    const created = await request(app.server).post("/users").send({ name: "Anna", age: 28 });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ success: true, id: 1 });
    const got = await request(app.server).get("/users/1");
    expect(got.status).toBe(200);
    expect(got.body).toEqual({ name: "Anna", age: 28 });
    app.server.close();
  });
});

// ---------------- 分层快捷访问器同名覆盖 ----------------
describe("分层快捷访问器避免同名覆盖", () => {
  it("Express：扁平 $params.id 被 body 覆盖，$pathParams.id 保留路径值", async () => {
    const app = express();
    app.use(express.json());
    const apiService = lib({ basePath: "" });
    apiService.api
      .put("/p/:id")
      .group("Index")
      .title("layered-express")
      .params(z.object({ id: z.coerce.number() }))
      .body(z.object({ id: z.string(), name: z.string() }))
      .register((ctx: any) => {
        ctx.reply.json({
          flatId: ctx.$params.id,
          pathId: ctx.$pathParams.id,
          bodyId: ctx.$body.id,
          name: ctx.$body.name,
        });
      });
    apiService.bind({ adapter: expressAdapter, router: app });
    const res = await request(app).put("/p/42").send({ id: "body-id", name: "Tom" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ flatId: "body-id", pathId: 42, bodyId: "body-id", name: "Tom" });
  });

  it("Koa：$pathParams/$body 均被注入", async () => {
    const koa = new Koa();
    koa.use(bodyParser());
    koa.use(async (ctx, next) => {
      try {
        await next();
      } catch (err: unknown) {
        ctx.status = 400;
        ctx.body = { message: (err as Error).message };
      }
    });
    const apiService = lib({ basePath: "" });
    const router = new KoaRouter();
    apiService.api
      .put("/p/:id")
      .group("Index")
      .title("layered-koa")
      .params(z.object({ id: z.coerce.number() }))
      .body(z.object({ name: z.string() }))
      .register((ctx: any) => {
        ctx.reply.json({
          pathId: ctx.$pathParams.id,
          body: ctx.$body.name,
          validatedPresent: !!ctx.$validated,
          flatPresent: !!ctx.$params,
        });
      });
    apiService.bind({ adapter: koaAdapter, router });
    koa.use(router.routes()).use(router.allowedMethods());
    const server = koa.listen();
    const res = await request(server).put("/p/3").send({ name: "Mia" });
    server.close();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pathId: 3, body: "Mia", validatedPresent: true, flatPresent: true });
  });

  it("@leizm/web：$pathParams/$body 均被注入", async () => {
    const app = new Application();
    app.use("/", component.bodyParser.json());
    const apiService = lib({ basePath: "" });
    const router = new Router();
    apiService.api
      .put("/p/:id")
      .group("Index")
      .title("layered-lei")
      .params(z.object({ id: z.coerce.number() }))
      .query(z.object({ q: z.string().optional() }))
      .body(z.object({ name: z.string() }))
      .register((ctx: any) => {
        ctx.reply.json({
          pathId: ctx.$pathParams.id,
          query: ctx.$query.q ?? null,
          body: ctx.$body.name,
          headersPresent: !!ctx.$headers,
          validatedPresent: !!ctx.$validated,
          flatPresent: !!ctx.$params,
        });
      });
    apiService.bind({ adapter: leizmwebAdapter, router });
    app.use("/", router);
    const res = await request(app.server).put("/p/7?q=hi").send({ name: "Lee" });
    app.server.close();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      pathId: 7,
      query: "hi",
      body: "Lee",
      headersPresent: true,
      validatedPresent: true,
      flatPresent: true,
    });
  });
});

afterAll(() => {});
