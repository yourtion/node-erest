import { H3, H3Event, HTTPError, setCookie } from "h3";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import { defaultErrorFormatter, type Context } from "../lib/index.js";
import { createERest, h3Adapter, type H3Raw } from "../../packages/erest-h3/src/index.js";

function setup() {
  const app = new H3({
    silent: true,
    onError(error, event) {
      const { body, status } = defaultErrorFormatter(error.cause instanceof Error ? error.cause : error);
      event.res.status = status;
      return body;
    },
  });
  const service = createERest({ groups: { test: "Test" } });
  return { app, service };
}

describe("H3 v2 integration", () => {
  it("validates layered params/query/body/headers and preserves native event types", async () => {
    const { app, service } = setup();
    service.api
      .post("/items/:id")
      .group("test")
      .registerTyped(
        {
          params: z.object({ id: z.coerce.number().int() }),
          query: z.object({ tag: z.array(z.string()) }),
          body: z.object({ id: z.coerce.number(), name: z.string().trim() }),
          headers: z.object({ "x-token": z.string() }),
        },
        (req, ctx) => {
          expectTypeOf(ctx.reply.raw).toEqualTypeOf<H3Raw>();
          expectTypeOf(ctx.reply.raw).toEqualTypeOf<H3Event>();
          expectTypeOf(req.params.id).toEqualTypeOf<number>();
          expect(ctx.reply.raw.context.$ctx).toBe(ctx);
          expect(ctx.$pathParams).toEqual({ id: 42 });
          expect(ctx.$body).toEqual({ id: 7, name: "Tom" });
          expect(ctx.$params?.id).toBe(7);
          ctx.reply.status(201).json(req);
        }
      );
    service.bind({ adapter: h3Adapter, router: app });
    const response = await app.request("/items/42?tag=a&tag=b", {
      method: "POST",
      headers: { "content-type": "application/json", "X-Token": "secret" },
      body: JSON.stringify({ id: "7", name: " Tom " }),
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({
      params: { id: 42 },
      query: { tag: ["a", "b"] },
      body: { id: 7, name: "Tom" },
      headers: { "x-token": "secret" },
    });
    const invalid = await app.request("/items/nope?tag=a&tag=b", { method: "POST", body: "{}" });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ code: "INVALID_PARAM" });
    expect((await app.request("/unknown")).status).toBe(404);
  });

  it.each(["post", "put", "patch", "delete"] as const)(
    "parses %s bodies and rejects missing or malformed JSON",
    async (method) => {
      const { app, service } = setup();
      service.api[method]("/body")
        .group("test")
        .registerTyped({ body: z.object({ name: z.string().min(1) }) }, (req, ctx) => ctx.reply.json(req.body));
      service.bind({ adapter: h3Adapter, router: app });
      const request = (body?: string, contentType = "application/json") =>
        app.request("/body", {
          method: method.toUpperCase(),
          headers: { "content-type": contentType },
          body,
        });
      expect((await request()).status).toBe(400);
      expect((await request("{}")).status).toBe(400);
      expect((await request('{"name":')).status).toBe(400);
      expect(await (await request('{"name":"Tom"}')).json()).toEqual({ name: "Tom" });
      expect(await (await request("name=Tom", "application/x-www-form-urlencoded")).json()).toEqual({ name: "Tom" });
    }
  );

  it("keeps undeclared bodies available for native stream and multipart handling", async () => {
    const { app, service } = setup();
    service.api
      .post("/raw")
      .group("test")
      .registerTyped({}, async (_req, ctx) => {
        ctx.reply.send(await ctx.reply.raw.req.text());
      });
    service.bind({ adapter: h3Adapter, router: app });
    const response = await app.request("/raw", { method: "POST", body: "raw content" });
    expect(await response.text()).toBe("raw content");
    expect(response.headers.get("content-type")).toContain("text/plain");
  });

  it.each([null, false, 0, "", undefined])(
    "serializes JSON scalar %s without falling through to a handler return",
    async (value) => {
      const { app, service } = setup();
      service.api
        .get("/scalar")
        .group("test")
        .registerTyped({}, (_req, ctx) => {
          ctx.reply.json(value);
          return "ignored";
        });
      service.bind({ adapter: h3Adapter, router: app });
      const response = await app.request("/scalar");
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(await response.text()).toBe(JSON.stringify(value) ?? "");
    }
  );

  it("wraps returned data and errors, including body parsing failures", async () => {
    const { app, service } = setup();
    const success = vi.fn((data) => ({ data }));
    service.setResponseEnvelopers({
      success,
      error: (err) => ({
        status: err instanceof HTTPError ? err.status : 422,
        body: { message: (err as Error).message },
      }),
    });
    service.api
      .post("/envelope")
      .group("test")
      .registerTyped(
        { body: z.object({ count: z.coerce.number().default(2) }), response: z.object({ count: z.number() }) },
        (req) => req.body
      );
    service.api
      .get("/manual")
      .group("test")
      .registerTyped({}, (_req, ctx) => {
        ctx.reply.status(202).json({ manual: true });
      });
    service.api
      .get("/csv")
      .group("test")
      .registerTyped({}, (_req, ctx) => {
        ctx.reply.markSent();
        return new Response("id\n1", { headers: { "content-type": "text/csv" } });
      });
    service.api
      .get("/bad-response")
      .group("test")
      .registerTyped({ response: z.object({ id: z.number() }) }, () => ({ id: "wrong" }) as never);
    service.bind({ adapter: h3Adapter, router: app });
    const response = await app.request("/envelope", { method: "POST" });
    expect(await response.json()).toEqual({ data: { count: 2 } });
    const malformed = await app.request("/envelope", { method: "POST", body: "{" });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ message: "Invalid JSON body" });
    expect((await app.request("/bad-response")).status).toBe(422);
    const manual = await app.request("/manual");
    expect(manual.status).toBe(202);
    expect(await manual.json()).toEqual({ manual: true });
    const csv = await app.request("/csv");
    expect(csv.headers.get("content-type")).toBe("text/csv");
    expect(await csv.text()).toBe("id\n1");
    expect(success).toHaveBeenCalledTimes(1);
  });

  it("mounts explicit/default/nested group prefixes once and composes middleware in order", async () => {
    const app = new H3();
    const service = createERest<{ trace: string[] }>({
      forceGroup: true,
      groups: { v1: { name: "v1", prefix: "/api/v1" }, UserAdmin: "Admin", root: { name: "root", prefix: "/" } },
    });
    const trace: string[] = [];
    service.beforeHooks((ctx, next) => {
      ctx.state.trace = trace;
      trace.push("global");
      return next();
    });
    const group = service.group("v1");
    group.before((ctx, next) => {
      ctx.state.trace.push("group-before");
      return next();
    });
    group.middleware(async (ctx, next) => {
      ctx.state.trace.push("group-in");
      await next();
      ctx.state.trace.push("group-out");
    });
    group
      .get("/items/:id")
      .before((ctx, next) => {
        ctx.state.trace.push("route-before");
        return next();
      })
      .middlewares((ctx, next) => {
        ctx.state.trace.push("route-middleware");
        return next();
      })
      .registerTyped({ params: z.object({ id: z.string() }) }, (req, ctx) => {
        expectTypeOf(ctx.state.trace).toEqualTypeOf<string[]>();
        trace.push("handler");
        ctx.reply.json({ id: req.params.id, path: ctx.path });
      });
    service
      .group("UserAdmin")
      .get("/info")
      .register((ctx) => ctx.reply.json({ admin: true }));
    service
      .group("root")
      .get("/")
      .register((ctx) => ctx.reply.send("root"));
    service.bind({ adapter: h3Adapter, app, router: H3 });
    const response = await app.request("/api/v1/items/hello%20world");
    expect(await response.json()).toEqual({ id: "hello world", path: "/api/v1/items/hello%20world" });
    expect(trace).toEqual([
      "global",
      "group-before",
      "route-before",
      "group-in",
      "route-middleware",
      "handler",
      "group-out",
    ]);
    expect(await (await app.request("/user_admin/info")).json()).toEqual({ admin: true });
    expect(await (await app.request("/")).text()).toBe("root");
    expect((await app.request("/api/v1/api/v1/items/1")).status).toBe(404);
  });

  it("observes lifecycle hooks, swallows observer errors and propagates dispatch errors to H3", async () => {
    const events: string[] = [];
    const failure = new Error("handler failed");
    const onError = vi.fn((_ctx: Context, err: Error) => {
      expect(err).toBe(failure);
      events.push("error");
      throw new Error("ignored");
    });
    const service = createERest({
      groups: { test: "Test" },
      hooks: {
        onRequest: () => {
          events.push("request");
          throw new Error("ignored");
        },
        onValidate: () => {
          events.push("validate");
          throw new Error("ignored");
        },
        onResponse: () => {
          events.push("response");
          throw new Error("ignored");
        },
        onError,
      },
    });
    const app = new H3({ silent: true });
    service.api
      .get("/ok")
      .group("test")
      .register((ctx) => {
        setCookie(ctx.reply.raw as H3Event, "session", "value");
        ctx.reply.json("ok");
      });
    service.api
      .get("/fail")
      .group("test")
      .register(() => {
        throw failure;
      });
    service.bind({ adapter: h3Adapter, router: app });
    const response = await app.request("/ok");
    expect(await response.json()).toBe("ok");
    expect(response.headers.get("set-cookie")).toContain("session=value");
    expect(events).toEqual(["request", "validate", "response"]);
    events.length = 0;
    expect((await app.request("/fail")).status).toBe(500);
    expect(events).toEqual(["request", "validate", "error"]);
    expect(onError).toHaveBeenCalledOnce();
  });

  it("enforces requiredOneOf and lets middleware terminate the chain", async () => {
    const { app, service } = setup();
    const handler = vi.fn();
    service.api
      .get("/search")
      .group("test")
      .query(z.object({ name: z.string().optional(), email: z.string().optional() }))
      .requiredOneOf(["name", "email"])
      .register((ctx) => ctx.reply.json(ctx.$query));
    service.api
      .get("/blocked")
      .group("test")
      .before((ctx) => ctx.reply.status(403).send("blocked"))
      .register(handler);
    service.bind({ adapter: h3Adapter, router: app });
    expect((await app.request("/search")).status).toBe(400);
    expect(await (await app.request("/search?email=a%40b.com")).json()).toEqual({ email: "a@b.com" });
    const response = await app.request("/blocked");
    expect(response.status).toBe(403);
    expect(await response.text()).toBe("blocked");
    expect(handler).not.toHaveBeenCalled();
  });
});
