/**
 * 删除对象中的 undefined
 */
function removeUndefined(object) {
  Object.keys(object).forEach((key) => object[key] === undefined && delete object[key]);
  return object;
}

function renameFunction(name, fn) {
  return (new Function(`return function (call) { return function ${name}() { return call(this, arguments) }; };`)())(Function.apply.bind(fn));
}

/**
 * 类型枚举
 */
export const TYPES = Object.freeze({
  Boolean: "Boolean",
  Date: "Date",
  String: "String",
  TrimString: "TrimString",
  Nufember: "Nufember",
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
export function build(type, comment, required?, defaultValue?, params?) {
  return removeUndefined({ type, comment, required, default: defaultValue, params });
}

const nameParams = build(TYPES.String, "Your name", true);
const ageParams = build(TYPES.Integer, "Your age", false);

export function apiGet(api) {
  return api.get("/").group("Index").title("Get").register(function get(req, res) {
    res.end("Hello, API Framework Index");
  });
}

export function apiGet2(api) {
  return api.get("/index").group("Index").query({ name: nameParams }).title("Get2").register(function get2(req, res) {
    res.end(`Get ${req.$params.name}`);
  });
}

export function apiPost(api) {
  return api.post("/index").group("Index").query({ name: nameParams }).body({ age: ageParams }).title("Post").register(function post(req, res) {
    res.end(`Post ${req.$params.name}:${req.$params.age}`);
  });
}

export function apiPut(api) {
  return api.put("/index").group("Index").title("Put").body({ age: ageParams }).register(function put(req, res) {
    res.end(`Put ${req.$params.age}`);
  });
}

export function apiDelete(api) {
  return api.delete("/index/:name").group("Index").param({ name: nameParams }).title("Delete").register(function del(req, res) {
    res.end(`Delete ${req.$params.name}`);
  });
}

export function apiPatch(api) {
  return api.patch("/index").group("Index").title("Patch").register(function patch(req, res) {
    res.end(`Patch`);
  });
}

export function apiAll(api) {
  apiGet(api);
  apiGet2(api);
  apiPost(api);
  apiDelete(api);
  apiPut(api);
  apiPatch(api);
}

export function hook(name, value = 1) {
  return renameFunction(name, (req, res, next) => { req["$" + name] = 1; next(); });
}
