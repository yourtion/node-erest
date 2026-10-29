import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import ERest, { ERestError, z, type Context } from "erest";
import { frameworks, listen } from "./frameworks.js";

describe.each(frameworks)("portable HTTP contract: $name", (framework) => {
  let host: Awaited<ReturnType<typeof listen>>;
  const events: string[] = [];
  const observed: unknown[] = [];
  const handler = vi.fn((ctx: Context) => ctx.reply.json({ reached: true }));
  const service = new ERest({
    groups: { test: "test" },
    hooks: {
      onRequest: () => {
        events.push("request");
        throw new Error("observer only");
      },
      onValidate: (_ctx, result) => {
        events.push(result instanceof Error ? "invalid" : "validated");
        throw new Error("observer only");
      },
      onError: (_ctx, error) => {
        events.push("error");
        observed.push(error);
        throw new Error("observer only");
      },
      onResponse: () => {
        events.push("response");
        throw new Error("observer only");
      },
    },
  });
  service.setResponseEnvelopers({
    success: (data) => ({ data }),
    error: (err) => ({
      status: (err as ERestError).statusCode ?? 500,
      body: { code: (err as ERestError).code ?? "INTERNAL_ERROR", message: (err as Error).message },
    }),
  });
  const api = service.api;
  api
    .get("/query")
    .group("test")
    .registerTyped(
      { query: z.object({ tag: z.array(z.string()), empty: z.string(), plus: z.string() }) },
      (req) => req.query
    );
  api
    .get("/items/static")
    .group("test")
    .register((ctx) => ctx.reply.json({ static: true }));
  api
    .get("/items/:id")
    .group("test")
    .registerTyped({ params: z.object({ id: z.string() }) }, (req) => req.params);
  api
    .get("/text")
    .group("test")
    .register((ctx) => ctx.reply.send("<b>literal text</b>"));
  api
    .post("/text")
    .group("test")
    .register((ctx) => ctx.reply.send("posted"));
  api
    .get("/empty")
    .group("test")
    .register((ctx) => ctx.reply.send(""));
  api
    .get("/null")
    .group("test")
    .register((ctx) => ctx.reply.json(null));
  api
    .get("/undefined")
    .group("test")
    .register((ctx) => ctx.reply.json(undefined));
  api
    .get("/serialization")
    .group("test")
    .registerTyped({}, () => ({ value: 1n }));
  api
    .get("/no-content")
    .group("test")
    .register((ctx) => ctx.reply.status(204).send(""));
  api
    .post("/body")
    .group("test")
    .registerTyped({ body: z.object({ name: z.string() }) }, (req) => req.body);
  api
    .get("/required-one")
    .group("test")
    .query(z.object({ a: z.string().optional(), b: z.string().optional() }))
    .requiredOneOf(["a", "b"])
    .register(handler);
  const failure = new ERestError("PERMISSION_DENIED", "denied", undefined, 403);
  api
    .get("/throws")
    .group("test")
    .register(async () => {
      await Promise.resolve();
      throw failure;
    });
  api
    .get("/blocked")
    .group("test")
    .before((ctx) => ctx.reply.status(403).send("blocked"))
    .register(handler);
  api
    .get("/onion")
    .group("test")
    .before(async (_ctx, next) => {
      events.push("before-in");
      await next();
      events.push("before-out");
    })
    .middlewares(async (_ctx, next) => {
      events.push("middleware-in");
      await next();
      events.push("middleware-out");
    })
    .register((ctx) => {
      events.push("handler");
      ctx.reply.json({ ok: true });
    });

  beforeAll(async () => {
    host = await listen(framework.server(service, false));
  });
  afterAll(async () => {
    await host?.close();
  });

  it("keeps repeated query keys, empty values and percent decoding", async () => {
    const res = await host.request("/query?tag=a&tag=b&empty=&plus=a%2Bb");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { tag: ["a", "b"], empty: "", plus: "a+b" } });
  });
  it("matches static and parameter routes, decodes UTF-8, rejects unmatched paths", async () => {
    expect(await (await host.request("/items/static")).json()).toEqual({ static: true });
    expect(await (await host.request("/items/%E4%B8%AD%E6%96%87")).json()).toEqual({ data: { id: "中文" } });
    expect(await (await host.request("/items/a%2Fb")).json()).toEqual({ data: { id: "a/b" } });
    expect(await (await host.request("/items/%252F")).json()).toEqual({ data: { id: "%2F" } });
    expect((await host.request("/items/a/extra")).status).toBe(404);
    expect((await host.request("/absent")).status).toBe(404);
  });
  it("sends literal text with text/plain, including HTML-like strings", async () => {
    const res = await host.request("/text");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await res.text()).toBe("<b>literal text</b>");
  });
  it("supports HEAD on GET routes with no body", async () => {
    const res = await host.request("/text", { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await res.text()).toBe("");
  });
  it("returns a bodyless OPTIONS response with all registered methods", async () => {
    const res = await host.request("/text", { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("allow")).toBe("GET, HEAD, POST, OPTIONS");
    expect(await res.text()).toBe("");
  });
  it("distinguishes empty text, JSON null and 204", async () => {
    for (const [path, status, text] of [
      ["/empty", 200, ""],
      ["/null", 200, "null"],
      ["/undefined", 200, ""],
      ["/no-content", 204, ""],
    ] as const) {
      const res = await host.request(path);
      expect(res.status).toBe(status);
      expect(await res.text()).toBe(text);
    }
  });
  it("observes successful validation and completion", async () => {
    events.length = 0;
    const res = await host.request("/body", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"name":"ok"}',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { name: "ok" } });
    expect(events).toEqual(["request", "validated", "response"]);
  });
  it("observes serialization failures before marking the reply sent", async () => {
    events.length = 0;
    observed.length = 0;
    const res = await host.request("/serialization");
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: "INTERNAL_ERROR" });
    expect(observed).toHaveLength(1);
    expect(observed[0]).toBeInstanceOf(TypeError);
    expect(events).toEqual(["request", "validated", "error", "response"]);
  });
  it.each([undefined, "{}"])("validates missing/empty bodies (%s) and observes failure once", async (body) => {
    events.length = 0;
    observed.length = 0;
    const res = await host.request("/body", { method: "POST", headers: { "content-type": "application/json" }, body });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "MISSING_PARAM" });
    expect(events).toEqual(["request", "invalid", "error", "response"]);
    expect(observed).toHaveLength(1);
  });
  it("normalizes malformed JSON through the same error envelope and hooks", async () => {
    events.length = 0;
    observed.length = 0;
    const res = await host.request("/body", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: "INVALID_BODY", message: "Invalid JSON body" });
    expect(events).toEqual(["request", "error", "response"]);
    expect(observed).toHaveLength(1);
    expect(observed[0]).toBeInstanceOf(ERestError);
    expect((observed[0] as Error).cause).toBeInstanceOf(Error);
  });
  it("observes requiredOneOf failures as validation failures", async () => {
    events.length = 0;
    expect((await host.request("/required-one")).status).toBe(400);
    expect(events).toEqual(["request", "invalid", "error", "response"]);
  });
  it("observes original async errors before formatting them", async () => {
    events.length = 0;
    observed.length = 0;
    const res = await host.request("/throws");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "PERMISSION_DENIED", message: "denied" });
    expect(observed).toEqual([failure]);
    expect(events).toEqual(["request", "validated", "error", "response"]);
  });
  it("short-circuits before validation/handler without applying a success envelope", async () => {
    events.length = 0;
    handler.mockClear();
    const res = await host.request("/blocked");
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("blocked");
    expect(handler).not.toHaveBeenCalled();
    expect(events).toEqual(["request", "response"]);
  });
  it("preserves onion middleware order", async () => {
    events.length = 0;
    expect(await (await host.request("/onion")).json()).toEqual({ ok: true });
    expect(events).toEqual([
      "request",
      "before-in",
      "validated",
      "middleware-in",
      "handler",
      "middleware-out",
      "before-out",
      "response",
    ]);
  });
});

describe.each(frameworks)("native error boundary: $name", (framework) => {
  it("observes a propagated handler error only once without an error envelope", async () => {
    const onError = vi.fn(),
      onRequest = vi.fn(),
      onResponse = vi.fn();
    const service = new ERest({ groups: { test: "test" }, hooks: { onError, onRequest, onResponse } });
    service.api
      .get("/failure")
      .group("test")
      .register(() => {
        throw new ERestError("NOT_FOUND", "gone", undefined, 404);
      });
    const host = await listen(framework.server(service, false));
    try {
      const res = await host.request("/failure");
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "gone", code: "NOT_FOUND" });
      expect(onRequest).toHaveBeenCalledOnce();
      expect(onError).toHaveBeenCalledOnce();
      expect(onResponse).toHaveBeenCalledOnce();
    } finally {
      await host.close();
    }
  });
});
