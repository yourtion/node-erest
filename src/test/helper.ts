import { IApiInfo } from "../lib";

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

/** 类型枚举 */
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

/**
 * 参数构造
 *
 * @param {String} type 参数类型
 * @param comment 参数说明
 * @param required 是否必填
 * @param defaultValue 默认值
 */
export function build(type: string, comment: string, required?: boolean, defaultValue?: any, params?: any) {
  return removeUndefined({ type, comment, required, default: defaultValue, params }) as any;
}

/** 名字 */
export const nameParams = build(TYPES.String, "Your name", true);
/** 年龄 */
export const ageParams = build(TYPES.Integer, "Your age", false);

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
    .query({ name: nameParams })
    .title("Get2")
    .register(function get2(req: any, res: any) {
      res.end(`Get ${req.$params.name}`);
    });
}

/** `POST /index`（返回："Post ${query.name}:${body.age}"） */
export function apiPost(api: IApiInfo<any>) {
  return api
    .post("/index")
    .group("Index")
    .query({ name: nameParams })
    .body({ age: ageParams })
    .title("Post")
    .required(["name", "age"])
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
    .body({ age: ageParams })
    .register(function put(req: any, res: any) {
      res.end(`Put ${req.$params.age}`);
    });
}

/** `DELETE /index/:name`（返回："Delete ${params.name}"） */
export function apiDelete(api: IApiInfo<any>) {
  return api
    .delete("/index/:name")
    .group("Index")
    .params({ name: nameParams })
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
    if (!req.$params.age || req.$params.age < 18) {
      return res.json({ success: false });
    }
    return res.json({ success: true, result: req.$params, headers: req.headers });
  }
  return api.define({
    method: "get",
    path,
    group: "Index",
    title: "JSON",
    query: { age: ageParams },
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
}

/** 生成 Express 的 hook */
export function hook(name: string, value: any = 1) {
  return renameFunction(name, (req: any, res: any, next: any) => {
    req["$" + name] = value;
    next();
  });
}
