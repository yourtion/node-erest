import { createServer } from "node:http";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import lib from "./lib";

const cases = [
  ...["post", "put", "patch"].map((method) => ({
    method,
    route: "/:query",
    query: z.object({ search: z.string() }),
    args: ["path", { search: "yes" }],
    url: "/path?search=yes",
    body: "",
  })),
  ...["get", "delete"].map((method) => ({
    method,
    route: "/:id",
    query: z.object({ id: z.string() }),
    args: ["path", { id: "query" }],
    url: "/path?id=query",
    body: "",
  })),
  {
    method: "post",
    route: "/:id",
    bodySchema: z.object({ id: z.string() }),
    query: z.object({ search: z.string() }),
    args: ["path", { id: "body" }, { search: "yes" }],
    url: "/path?search=yes",
    body: JSON.stringify({ id: "body" }),
  },
  {
    method: "put",
    route: "/:query/:_query",
    bodySchema: z.object({ query: z.string(), _query: z.string() }),
    query: z.object({ search: z.string() }),
    args: ["p1", "p2", { query: "b1", _query: "b2" }, { search: "yes" }],
    url: "/p1/p2?search=yes",
    body: JSON.stringify({ query: "b1", _query: "b2" }),
  },
  {
    method: "patch",
    route: "/:default",
    bodySchema: z.object({ "x-data": z.string(), default: z.string() }),
    args: ["path", { "x-data": "value", default: "body" }],
    url: "/path",
    body: JSON.stringify({ "x-data": "value", default: "body" }),
  },
];

describe("生成 SDK 的形参绑定与避撞", () => {
  test.each(cases)("$method $route：完整 ESM 导入并验证实际传输", async (entry) => {
    const { method, route, args, url, body } = entry;
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ method: req.method, url: req.url, body: Buffer.concat(chunks).toString() }));
    });
    try {
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const { port } = server.address() as { port: number };
      const service = lib({
        info: { host: `http://127.0.0.1:${port}`, basePath: "" },
        docs: { markdown: false, axios: true },
      });
      service.api[method as "post"](route)
        .group("Index")
        .title("Arguments")
        .registerTyped(
          {
            ...("query" in entry ? { query: entry.query } : {}),
            ...("bodySchema" in entry ? { body: entry.bodySchema } : {}),
          },
          () => {}
        );
      service.buildOpenAPI();
      let generated = "";
      service.setDocWritter((_file, source) => {
        generated = source;
      });
      service.genDocs("/docs", false);
      const axiosURL = pathToFileURL(createRequire(import.meta.url).resolve("axios")).href;
      const source = generated.replace("from 'axios'", `from ${JSON.stringify(axiosURL)}`);
      const moduleURL = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
      const { default: sdk } = await import(/* @vite-ignore */ moduleURL);
      sdk.instance.defaults.proxy = false;
      sdk.instance.defaults.timeout = 3000;
      const functions = Object.keys(sdk).filter((key) => key !== "instance");
      expect(functions).toHaveLength(1);
      const response = await sdk[functions[0]](...args);
      expect(response.data).toEqual({ method: method.toUpperCase(), url, body });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });
});
