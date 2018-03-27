/**
 * 删除对象中的 undefined
 */
function removeUndefined(object) {
  Object.keys(object).forEach((key) => object[key] === undefined && delete object[key]);
  return object;
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
