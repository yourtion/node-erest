// A fresh production-JS process is used for every sample. No ts-node/Vitest overhead.
import { createServer } from "node:http";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { expectedGet, output, schemas, validate } from "./fixture.mjs";

const [framework, mode, scenario] = process.argv.slice(2);
const isGet = scenario === "get";
const method = isGet ? "get" : "post";
const route = isGet ? "/ping" : "/users/:id";
const compute = (req) => (isGet ? expectedGet : output(req));
const work = (req) => (scenario === "io5" ? delay(5).then(() => compute(req)) : compute(req));
const checked = (req) => (mode === "native-zod" ? validate(req) : req);
let app, router, server, adapter;
const sendKoa = (ctx, result) => {
  // Match the adapter's serialization and Content-Type behavior.
  ctx.type = "application/json";
  ctx.body = JSON.stringify(result);
};

if (framework === "express") {
  const { default: express } = await import("express");
  app = express();
  app.use(express.json());
  router = app;
  server = createServer(app);
  if (mode === "erest") {
    const mod = await import("../packages/erest-express/dist/index.js");
    adapter = new mod.ExpressAdapter();
  } else {
    router[method](
      route,
      scenario === "io5"
        ? async (req, res) => res.json(await work(checked(req)))
        : (req, res) => res.json(compute(checked(req)))
    );
  }
} else if (framework === "koa") {
  const [{ default: Koa }, { default: Router }, { default: bodyParser }] = await Promise.all([
    import("koa"),
    import("koa-router"),
    import("koa-bodyparser"),
  ]);
  app = new Koa();
  app.silent = true;
  router = new Router();
  app.use(bodyParser());
  if (mode === "erest") {
    const mod = await import("../packages/erest-koa/dist/index.js");
    adapter = new mod.KoaAdapter();
  } else {
    const input = (ctx) => checked({ params: ctx.params, query: ctx.query, body: ctx.request.body });
    router[method](
      route,
      scenario === "io5"
        ? async (ctx) => sendKoa(ctx, await work(input(ctx)))
        : (ctx) => sendKoa(ctx, compute(input(ctx)))
    );
  }
  app.use(router.routes());
  server = createServer(app.callback());
} else if (framework === "leizmweb") {
  const { Application, Router, component } = await import("@leizm/web");
  app = new Application();
  router = new Router();
  app.use("/", component.bodyParser.json());
  if (mode === "erest") {
    const mod = await import("../packages/erest-leizmweb/dist/index.js");
    adapter = new mod.LeizmWebAdapter();
  } else {
    router[method](
      route,
      scenario === "io5"
        ? async (ctx) => ctx.response.json(await work(checked(ctx.request)))
        : (ctx) => ctx.response.json(compute(checked(ctx.request)))
    );
  }
  app.use("/", router);
  server = app.server;
} else if (framework === "h3") {
  const [{ H3, getQuery, getRouterParams, readBody }, { toNodeHandler }] = await Promise.all([
    import("h3"),
    import("h3/node"),
  ]);
  app = new H3({ silent: true });
  router = app;
  if (mode === "erest") {
    const mod = await import("../packages/erest-h3/dist/index.js");
    adapter = new mod.H3Adapter();
  } else {
    const send = (event, result) => {
      // Match the adapter's serialization and Content-Type behavior.
      event.res.headers.set("content-type", "application/json; charset=utf-8");
      return JSON.stringify(result);
    };
    router.on(
      method.toUpperCase(),
      route,
      isGet
        ? (event) => send(event, expectedGet)
        : async (event) => {
            const input = checked({
              params: getRouterParams(event, { decode: true }),
              query: getQuery(event),
              body: (await readBody(event)) ?? {},
            });
            return send(event, scenario === "io5" ? await work(input) : compute(input));
          }
    );
  }
  server = createServer(toNodeHandler(app));
} else {
  throw new Error(`Unknown framework: ${framework}`);
}

if (mode === "erest") {
  const { ERest } = await import("../dist/lib/index.js");
  const service = new ERest({ info: { basePath: "" }, groups: { bench: "Benchmark" }, docs: { markdown: false } });
  const api = service.api[method](route).group("bench");
  if (isGet) api.register((ctx) => ctx.reply.json(expectedGet));
  else
    api.registerTyped(
      schemas,
      scenario === "io5"
        ? async (req, ctx) => ctx.reply.json(await work(req))
        : (req, ctx) => ctx.reply.json(compute(req))
    );
  service.bind({ adapter, router });
}

if (framework === "express") {
  app.use((error, _req, res, _next) =>
    res.status(error.status || error.statusCode || 400).json({ error: error.message })
  );
}

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
global.gc?.();
const idleMemory = process.memoryUsage();
process.send({ type: "ready", port: server.address().port, idleMemory });
let cpuStart, wallStart;
process.on("message", (message) => {
  if (message.type === "start") {
    // GC outside the measured interval; no forced GC during requests.
    global.gc?.();
    cpuStart = process.cpuUsage();
    wallStart = performance.now();
    process.send({ type: "started" });
  } else if (message.type === "stop") {
    const elapsedMs = performance.now() - wallStart;
    const cpu = process.cpuUsage(cpuStart);
    const memory = process.memoryUsage();
    global.gc?.();
    process.send({
      type: "stats",
      elapsedMs,
      cpu,
      memory,
      retainedMemory: process.memoryUsage(),
      maxRssKiB: process.resourceUsage().maxRSS,
    });
  } else if (message.type === "close") {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  }
});
