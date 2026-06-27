/**
 * Common API helper functions for testing
 * Stage 1：fixture 全部迁移到原生 Zod
 */

import { z } from "zod";
import type { IApiInfo } from "../../lib";
import type { Context } from "../../lib/adapters/types.js";

/** 通用 Zod schema 定义 */
export const commonSchemas = {
  name: z.string(),
  age: z.coerce.number().int().optional(),
  email: z.string().email().optional(),
  id: z.string(),
  status: z.enum(["active", "inactive", "pending"]).optional(),
} as const;

/** @deprecated 旧 ISchemaType 参数（仅 test-params/test-schema-coverage 过渡用） */
export const commonParams = {
  name: { type: "String", required: true },
  age: { type: "Integer" },
  email: { type: "Email" },
  id: { type: "String", required: true },
  status: { type: "ENUM", params: ["active", "inactive", "pending"] },
} as const;

/** 创建标准化 GET API */
export function createGetApi(api: IApiInfo<unknown>, path = "/", title = "Get Test") {
  return api
    .get(path)
    .group("Index")
    .title(title)
    .register(function get(ctx: Context) {
      ctx.reply.send("Hello, API Framework Index");
    });
}

/** 创建标准化 POST API（带 body 校验） */
export function createPostApi(api: IApiInfo<unknown>, path = "/", title = "Post Test") {
  return api
    .post(path)
    .group("Index")
    .title(title)
    .query(z.object({ name: commonSchemas.name }))
    .body(z.object({ age: z.coerce.number().int() }))
    .register(function post(ctx: Context) {
      ctx.reply.send(`Post ${ctx.$params.name}:${ctx.$params.age}`);
    });
}

/** 创建 DELETE API（带 params） */
export function createDeleteApi(api: IApiInfo<unknown>, path = "/:id", title = "Delete Test") {
  return api
    .delete(path)
    .group("Index")
    .title(title)
    .params(z.object({ id: commonSchemas.id }))
    .register(function del(ctx: Context) {
      ctx.reply.send(`Delete ${ctx.$params.id}`);
    });
}

/** 创建 JSON 响应 API */
export function createJsonApi(api: IApiInfo<unknown>, path = "/json", title = "JSON Test") {
  function jsonHandler(ctx: Context) {
    if (!ctx.$params.age || ctx.$params.age < 18) {
      return ctx.reply.json({ success: false });
    }
    return ctx.reply.json({ success: true, result: ctx.$params, headers: ctx.headers });
  }
  return api.define({
    method: "get",
    path,
    group: "Index",
    title,
    query: z.object({ age: z.coerce.number().int() }),
    handler: jsonHandler,
  });
}

/** 创建全部标准 CRUD API */
export function createAllCrudApis(api: IApiInfo<unknown>) {
  const apis = {
    get: createGetApi(api, "/", "Get"),
    post: createPostApi(api, "/index", "Post"),
    delete: createDeleteApi(api, "/index/:id", "Delete"),
    json: createJsonApi(api, "/json", "JSON"),
  };
  apis.get = api
    .put("/index")
    .group("Index")
    .title("Put")
    .body(z.object({ age: z.coerce.number().int() }))
    .register(function put(ctx: Context) {
      ctx.reply.send(`Put ${ctx.$params.age}`);
    });
  apis.get = api
    .patch("/index")
    .group("Index")
    .title("Patch")
    .register(function patch(ctx: Context) {
      ctx.reply.send("Patch");
    });
  return apis;
}

/** 创建带 headers 校验的 API */
export function createHeaderApi(api: IApiInfo<unknown>, path = "/header", title = "Header Test") {
  return api
    .get(path)
    .group("Index")
    .title(title)
    .headers(z.object({ name: commonSchemas.name }))
    .register((ctx: Context) => {
      ctx.reply.send(`Get ${ctx.$params.name}`);
    });
}
