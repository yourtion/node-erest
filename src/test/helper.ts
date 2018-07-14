/**
 * 删除对象中的 undefined
 */
function removeUndefined(object: Record<string, any>) {
  Object.keys(object).forEach(key => object[key] === undefined && delete object[key]);
  return object;
}

function renameFunction(name: string, fn: any) {
  return new Function(`return function (call) { return function ${name}() { return call(this, arguments) }; };`)()(
    Function.apply.bind(fn)
  );
}

/**
 * 类型枚举
 */
export const TYPES = Object.freeze({
  Boolean: "Boolean",
  Date: "Date",
  String: "String",
  Number: "Number",
  Integer: "Integer",
  Float: "Float",
  JSON: "JSON",
  JSONString: "JSONString",
  Any: "Any",
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
 * @param {any} comment 参数说明
 * @param {any} required 是否必填
 * @param {any} defaultValue 默认值
 * @return {Object}
 */
export function build(type: string, comment: string, required?: boolean, defaultValue?: any, params?: any) {
  return removeUndefined({ type, comment, required, default: defaultValue, params }) as any;
}

export const nameParams = build(TYPES.String, "Your name", true);
export const ageParams = build(TYPES.Integer, "Your age", false);

export function apiGet(api: any) {
  return api
    .get("/")
    .group("Index")
    .title("Get")
    .register(function get(req: any, res: any) {
      res.end("Hello, API Framework Index");
    });
}

export function apiGet2(api: any) {
  return api
    .get("/index")
    .group("Index")
    .query({ name: nameParams })
    .title("Get2")
    .register(function get2(req: any, res: any) {
      res.end(`Get ${req.$params.name}`);
    });
}

export function apiPost(api: any) {
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

export function apiPut(api: any) {
  return api
    .put("/index")
    .group("Index")
    .title("Put")
    .body({ age: ageParams })
    .register(function put(req: any, res: any) {
      res.end(`Put ${req.$params.age}`);
    });
}

export function apiDelete(api: any) {
  return api
    .delete("/index/:name")
    .group("Index")
    .params({ name: nameParams })
    .title("Delete")
    .register(function del(req: any, res: any) {
      res.end(`Delete ${req.$params.name}`);
    });
}

export function apiPatch(api: any) {
  return api
    .patch("/index")
    .group("Index")
    .title("Patch")
    .register(function patch(req: any, res: any) {
      res.end(`Patch`);
    });
}

export function apiJson(api: any, path = "/json") {
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

export function apiAll(api: any) {
  apiGet(api);
  apiGet2(api);
  apiPost(api);
  apiDelete(api);
  apiPut(api);
  apiPatch(api);
}

export function hook(name: string, value: any = 1) {
  return renameFunction(name, (req: any, res: any, next: any) => {
    req["$" + name] = value;
    next();
  });
}
