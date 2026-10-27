import { createRequire } from "node:module";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import generateAxios from "../lib/plugin/generate_axios";

describe("生成 SDK 的路径参数（#195 / #27）", () => {
  test.each([
    {
      route: "/posts/:id",
      method: "getPostsId",
      values: ["42"],
      url: "/posts/42",
      paramsSchema: z.object({ id: z.string() }),
    },
    { route: "/posts/:id", method: "getPostsId", values: ["43"], url: "/posts/43" },
    { route: "/posts/:user_2/:_item3", method: "getPostsUser_2_item3", values: ["44", "45"], url: "/posts/44/45" },
    { route: "/posts", method: "getPosts", values: [], url: "/posts" },
  ])("$route 的实际 ESM 导入和 HTTP 请求", async ({ route, method, values, url, paramsSchema }) => {
    const server = createServer((req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ url: req.url }));
    });
    try {
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address() as { port: number };
      let sdkSource = "";
      generateAxios(
        {
          info: { title: "Paths", host: `http://127.0.0.1:${address.port}`, basePath: "" },
          apis: {
            route: { method: "get", title: "Path", realPath: route, paramsSchema },
          },
        } as any,
        "/out",
        { axios: true },
        (_path, source) => {
          sdkSource = source;
        }
      );
      const axiosURL = pathToFileURL(createRequire(import.meta.url).resolve("axios")).href;
      const source = sdkSource.replace("from 'axios'", `from ${JSON.stringify(axiosURL)}`);
      const moduleURL = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
      const { default: sdk } = await import(/* @vite-ignore */ moduleURL);
      sdk.instance.defaults.proxy = false;
      sdk.instance.defaults.timeout = 3000;
      const response = await sdk[method](...values);
      expect(response.status).toBe(200);
      expect(response.data).toEqual({ url });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });
});
