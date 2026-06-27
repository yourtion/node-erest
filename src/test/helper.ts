import { z } from "zod";
import type { Context, Middleware } from "../lib/adapters/types.js";
import type { IApiInfo } from "../lib/index.js";

/**
 * 辅助函数
 *
 * Stage 1 过渡期：同时保留原生 Zod fixture（apiGet/apiPost 等，给 test-test.ts）
 * 与旧 ISchemaType 构造器（build/TYPES，给 test-router/test-lib/test-params，
 * 这些文件中断言 ISchemaType 结构的测试将在 Task 6/7 随 ISchemaType 删除而移除）。
 */

/** 删除对象中的 undefined */
function removeUndefined(object: Record<string, unknown>) {
  Object.keys(object).forEach((key) => object[key] === undefined && delete object[key]);
  return object;
}

/** 方法重命名 */
function renameFunction(name: string, fn: unknown) {
  return new Function(`return function (call) { return function ${name}() { return call(this, arguments) }; };`)()(
    Function.apply.bind(fn)
  );
}

/** 获取 Node.js 版本 */
export function nodeVersion() {
  const v = process.version.match(/^v(\d+)/);
  return (v && Number(v[1])) || 0;
}

/** @deprecated 类型枚举（ISchemaType，仅过渡期 test-router/test-lib/test-params 使用） */
export const TYPES = Object.freeze({
  Boolean: "Boolean",
  Date: "Date",
  String: "String",
  TrimString: "TrimString",
  Number: "Number",
  Integer: "Integer",
  Float: "Float",
  Object: "Object",
  Array: "Array",
  JSON: "JSON",
  JSONString: "JSONString",
  Any: "Any",
  MongoIdString: "MongoIdString",
  Email: "Email",
  Domain: "Domain",
  Alpha: "Alpha",
  AlphaNumeric: "AlphaNumeric",
  Ascii: "Ascii",
  Base64: "Base64",
  URL: "URL",
  ENUM: "ENUM",
  IntArray: "IntArray",
  StringArray: "StringArray",
  NullableString: "NullableString",
  NullableInteger: "NullableInteger",
});

/** @deprecated ISchemaType 参数构造器（过渡期） */
export function build(type: string, comment: string, required?: boolean, defaultValue?: unknown, params?: unknown) {
  return removeUndefined({ type, comment, required, default: defaultValue, params }) as unknown;
}

/** @deprecated 旧 ISchemaType 参数（过渡期） */
export const nameParams = build(TYPES.String, "Your name", true);
/** @deprecated 旧 ISchemaType 参数（过渡期） */
export const ageParams = build(TYPES.Integer, "Your age", false);

/** 名字（必填字符串，Zod） */
export const nameSchema = z.string();
/** 年龄（可选整数，Zod） */
export const ageSchema = z.coerce.number().int().optional();

/** `GET /`（返回："Hello, API Framework Index"） */
export function apiGet(api: IApiInfo<unknown>) {
  return api
    .get("/")
    .group("Index")
    .title("Get")
    .register(function get(ctx: Context) {
      ctx.reply.send("Hello, API Framework Index");
    });
}

/** `GET /index`（返回："Get ${query.name}"） */
export function apiGet2(api: IApiInfo<unknown>) {
  return api
    .get("/index")
    .group("Index")
    .query(z.object({ name: nameSchema }))
    .title("Get2")
    .register(function get2(ctx: Context) {
      ctx.reply.send(`Get ${ctx.$params.name}`);
    });
}

/** `POST /index`（返回："Post ${query.name}:${body.age}"） */
export function apiPost(api: IApiInfo<unknown>) {
  return api
    .post("/index")
    .group("Index")
    .query(z.object({ name: nameSchema }))
    .body(z.object({ age: z.number().int() }))
    .title("Post")
    .register(function post(ctx: Context) {
      ctx.reply.send(`Post ${ctx.$params.name}:${ctx.$params.age}`);
    });
}

/** `PUT /index`（返回："Put ${body.age}"） */
export function apiPut(api: IApiInfo<unknown>) {
  return api
    .put("/index")
    .group("Index")
    .title("Put")
    .body(z.object({ age: z.number().int() }))
    .register(function put(ctx: Context) {
      ctx.reply.send(`Put ${ctx.$params.age}`);
    });
}

/** `DELETE /index/:name`（返回："Delete ${params.name}"） */
export function apiDelete(api: IApiInfo<unknown>) {
  return api
    .delete("/index/:name")
    .group("Index")
    .params(z.object({ name: nameSchema }))
    .title("Delete")
    .register(function del(ctx: Context) {
      ctx.reply.send(`Delete ${ctx.$params.name}`);
    });
}

/** `PATCH /index`（返回："Patch"） */
export function apiPatch(api: IApiInfo<unknown>) {
  return api
    .patch("/index")
    .group("Index")
    .title("Patch")
    .register(function patch(ctx: Context) {
      ctx.reply.send(`Patch`);
    });
}

/**
 * 生成 json 返回
 *
 * - 默认返回 `{ success: true, result: ctx.$params, headers: ctx.headers }`
 * - 当没有 age 或者 age<18 时返回 `{ success: false }`
 */
export function apiJson(api: IApiInfo<unknown>, path = "/json") {
  function json(ctx: Context) {
    if (!ctx.$params.age || ctx.$params.age < 18) {
      return ctx.reply.json({ success: false });
    }
    return ctx.reply.json({ success: true, result: ctx.$params, headers: ctx.headers });
  }
  return api.define({
    method: "get",
    path,
    group: "Index",
    title: "JSON",
    query: z.object({ age: z.coerce.number().int() }),
    handler: json,
  });
}

/** 返回所有定义的API（Get、Get2、Post、Delete、Put、Patch） */
export function apiAll(api: IApiInfo<unknown>) {
  apiGet(api);
  apiGet2(api);
  apiPost(api);
  apiDelete(api);
  apiPut(api);
  apiPatch(api);
  apiHeader(api);
}

/** 生成标准化 hook（签名 (ctx, next)，写 ctx.state["$name"]） */
export function hook(name: string, value: unknown = 1) {
  return renameFunction(name, ((ctx: Context, next: () => Promise<void> | void) => {
    ctx.state[`$${name}`] = value;
    return next();
  }) as Middleware);
}

/** `GET /header`（返回："Get ${header.name}"） */
export function apiHeader(api: IApiInfo<unknown>) {
  return api
    .get("/header")
    .group("Index")
    .headers(z.object({ name: nameSchema }))
    .title("Header")
    .register((ctx: Context) => {
      ctx.reply.send(`Get ${ctx.$params.name}`);
    });
}
