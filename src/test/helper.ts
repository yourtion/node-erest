import * as z from 'zod';
import { IApiInfo } from "../lib";
import { ERestHandler } from '../lib/api'; // For typing handlers if needed

/**
 * 辅助函数
 */

/** 删除对象中的 undefined */
function removeUndefined(object: Record<string, any>) {
  Object.keys(object).forEach((key) => object[key] === undefined && delete object[key]);
  return object;
}

/** 方法重命名 */
function renameFunction(name: string, fn: any) {
  return new Function(`return function (call) { return function ${name}() { return call(this, arguments) }; };`)()(
    Function.apply.bind(fn)
  );
}

/** 获取 Node.js 版本 */
export function nodeVersion() {
  const v = process.version.match(/^v(\d+)/);
  return (v && Number(v[1])) || 0;
}

/** 名字 */
export const zodNameParam = z.string().min(1).describe("Your name"); // Assuming required: true means non-empty
/** 年龄 */
export const zodAgeParam = z.number().int().describe("Your age").optional(); // Assuming required: false means optional

/** `GET /`（返回："Hello, API Framework Index"） */
export function apiGet(api: IApiInfo<any>) {
  return api
    .get("/")
    .group("Index")
    .title("Get")
    .register(function get(req: any, res: any) {
      res.end("Hello, API Framework Index");
    });
}

/** `GET /index`（返回："Get ${query.name}"） */
export function apiGet2(api: IApiInfo<any>) {
  return api
    .get("/index")
    .group("Index")
    .query(z.object({ name: zodNameParam }))
    .title("Get2")
    .register(function get2(req: any, res: any) {
      res.end(`Get ${req.$params.name}`);
    });
}

/** `POST /index`（返回："Post ${query.name}:${body.age}"） */
export function apiPost(api: IApiInfo<any>) {
  // If age is truly required for POST, it should not be optional in the body schema.
  // Using .unwrap() or making a new required schema for POST context.
  const requiredAgeParam = zodAgeParam.unwrap(); // Removes .optional()
  return api
    .post("/index")
    .group("Index")
    .query(z.object({ name: zodNameParam }))
    .body(z.object({ age: requiredAgeParam })) 
    .title("Post")
    // The .required(["name", "age"]) call is no longer the primary driver for field requirement.
    // Zod schemas (zodNameParam being non-optional, and requiredAgeParam being non-optional) define this.
    // The ERest `required` set can still be used for an additional check layer if desired,
    // for example, to ensure fields exist even if Zod might allow them to be undefined with `z.undefined()`
    // but here, Zod's own requirement handling is more idiomatic.
    // If the intent of .required(["name", "age"]) was to ensure they are present (not undefined),
    // then Zod's default non-optional behavior for `name` and `requiredAgeParam` covers this.
    .register(function post(req: any, res: any) {
      res.end(`Post ${req.$params.name}:${req.$params.age}`);
    });
}

/** `PUT /index`（返回："Put ${body.age}"） */
export function apiPut(api: IApiInfo<any>) {
  return api
    .put("/index")
    .group("Index")
    .title("Put")
    .body(z.object({ age: zodAgeParam })) // age is optional here as per zodAgeParam definition
    .register(function put(req: any, res: any) {
      res.end(`Put ${req.$params.age}`);
    });
}

/** `DELETE /index/:name`（返回："Delete ${params.name}"） */
export function apiDelete(api: IApiInfo<any>) {
  return api
    .delete("/index/:name")
    .group("Index")
    .params(z.object({ name: zodNameParam }))
    .title("Delete")
    .register(function del(req: any, res: any) {
      res.end(`Delete ${req.$params.name}`);
    });
}

/** `PATCH /index`（返回："Patch"） */
export function apiPatch(api: IApiInfo<any>) {
  return api
    .patch("/index")
    .group("Index")
    .title("Patch")
    .register(function patch(req: any, res: any) {
      res.end(`Patch`);
    });
}

/**
 * 生成 json 返回
 *
 * - 默认返回 `{ success: true, result: req.$params, headers: req.headers }`
 * - 当没有 age 或者 age<18 时返回 `{ success: false }`
 */
export function apiJson(api: IApiInfo<any>, path = "/json") {
  function json(req: any, res: any) {
    // req.$params will have { age?: number }
    if (req.$params.age === undefined || req.$params.age < 18) {
      return res.json({ success: false });
    }
    return res.json({ success: true, result: req.$params, headers: req.headers });
  }
  return api.define({
    method: "get",
    path,
    group: "Index",
    title: "JSON",
    query: z.object({ age: zodAgeParam }), // age is optional here
    handler: json,
  });
}

/** 返回所有定义的API（Get、Get2、Post、Delete、Put、Patch） */
export function apiAll(api: IApiInfo<any>) {
  apiGet(api);
  apiGet2(api);
  apiPost(api);
  apiDelete(api);
  apiPut(api);
  apiPatch(api);
  apiHeader(api);
}

/** 生成 Express 的 hook */
export function hook(name: string, value: any = 1) {
  return renameFunction(name, (req: any, res: any, next: any) => {
    req["$" + name] = value;
    next();
  });
}

/** `GET /header`（返回："Get ${header.name}"） */
export function apiHeader(api: IApiInfo<any>) {
  return api
    .get("/header")
    .group("Index")
    .headers(z.object({ name: zodNameParam }))
    .title("Header")
    .register((req: any, res: any) => {
      res.end(`Get ${req.$params.name}`);
    });
}
