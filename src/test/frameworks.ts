/** Single registry: every adapter must run the same HTTP contract. Only host wiring differs. */
import { createServer, type Server } from "node:http";
import express from "express";
import Koa from "koa";
import KoaRouter from "koa-router";
import bodyParser from "koa-bodyparser";
import { Application, Router, component } from "@leizm/web";
import { H3 } from "h3";
import { toNodeHandler } from "h3/node";
import type ERest from "../lib/index.js";
const expressAdapter = process.env.ISLIB
  ? await import("../../packages/erest-express/src/index.js")
  : await import("../../packages/erest-express/dist/index.js");
const koaAdapter = process.env.ISLIB
  ? await import("../../packages/erest-koa/src/index.js")
  : await import("../../packages/erest-koa/dist/index.js");
const leiAdapter = process.env.ISLIB
  ? await import("../../packages/erest-leizmweb/src/index.js")
  : await import("../../packages/erest-leizmweb/dist/index.js");
const h3Adapter = process.env.ISLIB
  ? await import("../../packages/erest-h3/src/index.js")
  : await import("../../packages/erest-h3/dist/index.js");

export const frameworks = [
  {
    name: "express",
    server(service: ERest, grouped: boolean): Server {
      const app = express();
      app.use(express.json());
      service.bind(
        grouped
          ? { adapter: expressAdapter.expressAdapter, app, router: express.Router }
          : { adapter: expressAdapter.expressAdapter, router: app }
      );
      app.use(expressAdapter.createErrorHandler(service));
      return createServer(app);
    },
  },
  {
    name: "koa",
    server(service: ERest, grouped: boolean): Server {
      const app = new Koa();
      app.use(koaAdapter.createErrorHandler(service));
      app.use(bodyParser());
      if (grouped) service.bind({ adapter: koaAdapter.koaAdapter, app, router: KoaRouter });
      else {
        const router = new KoaRouter();
        service.bind({ adapter: koaAdapter.koaAdapter, router });
        app.use(router.routes()).use(router.allowedMethods());
      }
      return createServer(app.callback());
    },
  },
  {
    name: "leizmweb",
    server(service: ERest, grouped: boolean): Server {
      const app = new Application();
      app.use("/", component.bodyParser.json());
      if (grouped) service.bind({ adapter: leiAdapter.leizmWebAdapter, app, router: Router });
      else {
        const router = new Router();
        service.bind({ adapter: leiAdapter.leizmWebAdapter, router });
        app.use("/", router);
      }
      app.use("/", leiAdapter.createErrorHandler(service));
      return app.server;
    },
  },
  {
    name: "h3",
    server(service: ERest, grouped: boolean): Server {
      const app = new H3({ onError: h3Adapter.createErrorHandler(service) });
      service.bind(
        grouped ? { adapter: h3Adapter.h3Adapter, app, router: H3 } : { adapter: h3Adapter.h3Adapter, router: app }
      );
      return createServer(toNodeHandler(app));
    },
  },
];

export async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return {
    server,
    request: (path: string, init?: RequestInit) =>
      fetch(baseUrl + path, { ...init, signal: AbortSignal.timeout(3000) }),
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    },
  };
}
