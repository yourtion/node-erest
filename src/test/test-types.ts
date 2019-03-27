import lib from "./lib";

const apiService = lib();
const paramsChecker = apiService.paramsChecker();

const date = new Date();

test.each([
  // Boolean
  ["Boolean", true, { type: "Boolean" }, true],
  ["Boolean", false, { type: "Boolean" }, false],
  ["Boolean", "false", { type: "Boolean" }, false],
  ["Boolean", "true", { type: "Boolean", format: false }, "true"],

  // Date
  ["Date", "2017-05-01", { type: "Date" }, "2017-05-01"],
  ["Date", date, { type: "Date" }, date],

  // String
  ["String", "1", { type: "String" }, "1"],
  ["TrimString", " 1 ", { type: "TrimString", format: false }, " 1 "],
  ["TrimString", " 1 ", { type: "TrimString" }, "1"],

  // Number
  ["Number", "1", { type: "Number" }, 1],
  ["Integer", "-1", { type: "Integer" }, -1],
  ["Integer", "1", { type: "Integer", format: false }, "1"],
  ["Integer", 1, { type: "Integer" }, 1],
  ["Float", "1.1", { type: "Float" }, 1.1],
  ["Float", "-1", { type: "Float", format: true }, -1],
  ["Float", "100.12233", { type: "Float", format: false }, "100.12233"],

  // Object
  ["Object", { a: 1 }, { type: "Object" }, { a: 1 }],
  ["Object", {}, { type: "Object" }, {}],
  ["Object", ["1"], { type: "Object" }, ["1"]],

  // JSON
  ["JSON", `{"a": "b"}`, { type: "JSON", format: false }, `{"a": "b"}`],
  ["JSON", `{"a": "b"}`, { type: "JSON" }, { a: "b" }],
  ["JSONString", `{"a": "b"}`, { type: "JSONString", format: false }, `{"a": "b"}`],
  ["JSONString", ` {"a": "b"} `, { type: "JSONString" }, `{"a": "b"}`],

  // Array
  ["Array", ["1"], { type: "Array" }, ["1"]],
  ["Array", [1, 2, 3], { type: "Array" }, [1, 2, 3]],
  ["IntArray", [1, 2, 3], { type: "IntArray" }, [1, 2, 3]],
  ["IntArray", "1, 5, 3", { type: "IntArray" }, [1, 3, 5]],
  ["StringArray", ["a", 2, "3"], { type: "StringArray" }, ["a", "2", "3"]],
  ["StringArray", "a, 5, q", { type: "StringArray" }, ["a", "5", "q"]],

  // Nullable
  ["NullableString", "1", { type: "NullableString" }, "1"],
  ["NullableString", null, { type: "NullableString" }, null],
  ["NullableInteger", "1", { type: "NullableInteger" }, "1"],
  ["NullableInteger", "1", { type: "NullableInteger", format: true }, 1],
  ["NullableInteger", 1, { type: "NullableInteger" }, 1],
  ["NullableInteger", null, { type: "NullableInteger" }, null],

  // Other
  ["Any", "1", { type: "Any" }, "1"],
  ["Any", 1, { type: "Any" }, 1],
  ["Any", null, { type: "Any" }, null],
  ["Any", { a: "b" }, { type: "Any" }, { a: "b" }],
  ["MongoIdString", "507f1f77bcf86cd799439011", { type: "MongoIdString" }, "507f1f77bcf86cd799439011"],
  ["Email", "yourtion@gmail.com", { type: "Email" }, "yourtion@gmail.com"],
  ["Domain", "yourtion.com", { type: "Domain" }, "yourtion.com"],
  ["Alpha", "Yourtion", { type: "Alpha" }, "Yourtion"],
  ["AlphaNumeric", "Yourtion012", { type: "AlphaNumeric" }, "Yourtion012"],
  ["Ascii", "Yourtion.com/hello", { type: "Ascii" }, "Yourtion.com/hello"],
  ["Base64", "WW91cnRpb24=", { type: "Base64" }, "WW91cnRpb24="],
  ["URL", "http://github.com/yourtion", { type: "URL" }, "http://github.com/yourtion"],
  ["ENUM", "Hello", { type: "ENUM", params: ["Hello", "World"] }, "Hello"],
])("TYPES - %s (%s) success", (type, value, params, expected) => {
  expect(paramsChecker(type, value, params)).toEqual(expected);
});

test.each([
  // HACK: 临时修正Typings错误
  ["Any", null, { type: "Any" }, null],

  ["Number", -2, { type: "Number", params: { min: 0 } }],
  ["Number", 200, { type: "Number", params: { max: 10 } }],
  ["Number", "-1", { type: "Number", params: { min: 0, max: 10 } }],
  ["Integer", "-1.0", { type: "Integer" }],
  ["Integer", "Yourtion", { type: "ENUM", params: ["Hello", "World"] }],
  ["ENUM", "Yourtion", { type: "ENUM", params: ["Hello", "World"] }],
])("TYPES - %s (%s) toThrow", (type, value, params) => {
  // console.log(value, expected);
  if (type === "Any" && value === null) {
    // HACK: 临时修正Typings错误
    expect(value).toEqual(null);
  } else {
    expect(() => paramsChecker(type, value, params)).toThrow();
  }
});
