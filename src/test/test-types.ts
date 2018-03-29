import lib from "./lib";
import { GROUPS, INFO } from "./lib";

const apiService = lib();
const paramsChecker = apiService.paramsChecker();
const schemaChecker = apiService.schemaChecker();

describe("Types - default", () => {
  it("TYPES - Boolean", () => {
    expect(paramsChecker("Boolean", true, { type: "Boolean" })).toBe(true);
    expect(paramsChecker("Boolean", false, { type: "Boolean" })).toBe(false);
    expect(paramsChecker("Boolean", "true", { type: "Boolean" })).toBe("true");
    expect(paramsChecker("Boolean", "false", { type: "Boolean", format: true })).toBe(false);
  });

  it("TYPES - Date", () => {
    expect(paramsChecker("Date", "2017-05-01", { type: "Date" })).toBe("2017-05-01");
    const date = new Date();
    expect(paramsChecker("Date", date, { type: "Date" })).toBe(date);
  });

  it("TYPES - String", () => {
    expect(paramsChecker("String", "1", { type: "String" })).toBe("1");
  });

  it("TYPES - TrimString", () => {
    expect(paramsChecker("TrimString", " 1 ", { type: "TrimString" })).toBe(" 1 ");
    expect(paramsChecker("TrimString", " 1 ", { type: "TrimString", format: true })).toBe("1");
  });

  it("TYPES - Number", () => {
    expect(paramsChecker("Number", "1", { type: "Number" })).toBe(1);
    const min = () => paramsChecker("Number", -2, { type: "Number", params: { min: 0 } });
    expect(min).toThrow();
    const max = () => paramsChecker("Number", 200, { type: "Number", params: { max: 10 } });
    expect(max).toThrow();
    const minmax = () =>
      paramsChecker("Number", "-1", { type: "Number", params: { min: 0, max: 10 } });
    expect(minmax).toThrow();
  });

  it("TYPES - Integer", () => {
    expect(paramsChecker("Integer", "-1", { type: "Integer", format: true })).toBe(-1);
    expect(paramsChecker("Integer", "1", { type: "Integer" })).toBe("1");
    expect(paramsChecker("Integer", 1, { type: "Integer" })).toBe(1);
    const float = () => paramsChecker("Integer", "-1.0", { type: "Integer" });
    expect(float).toThrow();
  });

  it("TYPES - Float", () => {
    expect(paramsChecker("Float", "1.1", { type: "Float", format: true })).toBe(1.1);
    expect(paramsChecker("Float", "-1", { type: "Float", format: true })).toBe(-1);
    expect(paramsChecker("Float", "100.12233", { type: "Float" })).toBe("100.12233");
  });

  it("TYPES - Object", () => {
    expect(paramsChecker("Object", { a: 1 }, { type: "Object" })).toEqual({ a: 1 });
    expect(paramsChecker("Object", {}, { type: "Object" })).toEqual({});
    expect(paramsChecker("Object", ["1"], { type: "Object" })).toEqual(["1"]);
  });

  it("TYPES - Array", () => {
    expect(paramsChecker("Array", ["1"], { type: "Array" })).toEqual(["1"]);
    expect(paramsChecker("Array", [1, 2, 3], { type: "Array" })).toEqual([1, 2, 3]);
  });

  it("TYPES - JSON", () => {
    expect(paramsChecker("JSON", `{"a": "b"}`, { type: "JSON" })).toBe(`{"a": "b"}`);
    expect(paramsChecker("JSON", `{"a": "b"}`, { type: "JSON", format: true })).toEqual({ a: "b" });
  });

  it("TYPES - JSONString", () => {
    expect(paramsChecker("JSONString", `{"a": "b"}`, { type: "JSONString" })).toBe(`{"a": "b"}`);
    expect(
      paramsChecker("JSONString", ` {"a": "b"} `, { type: "JSONString", format: true }),
    ).toEqual(`{"a": "b"}`);
  });

  it("TYPES - Any", () => {
    expect(paramsChecker("Any", "1", { type: "Any" })).toBe("1");
    expect(paramsChecker("Any", 1, { type: "Any" })).toBe(1);
    expect(paramsChecker("Any", null, { type: "Any" })).toBe(null);
    expect(paramsChecker("Any", { a: "b" }, { type: "Any" })).toEqual({ a: "b" });
  });

  it("TYPES - MongoIdString", () => {
    expect(
      paramsChecker("MongoIdString", "507f1f77bcf86cd799439011", { type: "MongoIdString" }),
    ).toBe("507f1f77bcf86cd799439011");
  });

  it("TYPES - Email", () => {
    expect(paramsChecker("Email", "yourtion@gmail.com", { type: "Email", format: true })).toBe(
      "yourtion@gmail.com",
    );
  });

  it("TYPES - Domain", () => {
    expect(paramsChecker("Domain", "yourtion.com", { type: "Domain", format: true })).toBe(
      "yourtion.com",
    );
  });

  it("TYPES - Alpha", () => {
    expect(paramsChecker("Alpha", "Yourtion", { type: "Alpha" })).toBe("Yourtion");
  });

  it("TYPES - AlphaNumeric", () => {
    expect(paramsChecker("AlphaNumeric", "Yourtion012", { type: "AlphaNumeric" })).toBe(
      "Yourtion012",
    );
  });

  it("TYPES - Ascii", () => {
    expect(paramsChecker("Ascii", "Yourtion.com/hello", { type: "Ascii" })).toBe(
      "Yourtion.com/hello",
    );
  });

  it("TYPES - Base64", () => {
    expect(paramsChecker("Base64", "WW91cnRpb24=", { type: "Base64" })).toBe("WW91cnRpb24=");
    expect(paramsChecker("Base64", "WW91cnRpb24=", { type: "Base64", format: true })).toBe(
      "WW91cnRpb24=",
    );
  });

  it("TYPES - URL", () => {
    expect(paramsChecker("URL", "http://github.com/yourtion", { type: "URL" })).toBe(
      "http://github.com/yourtion",
    );
    expect(paramsChecker("URL", "http://github.com/yourtion", { type: "URL", format: true })).toBe(
      "http://github.com/yourtion",
    );
  });

  it("TYPES - ENUM", () => {
    expect(paramsChecker("ENUM", "Hello", { type: "ENUM", params: ["Hello", "World"] })).toBe(
      "Hello",
    );
    const tenum = () =>
      paramsChecker("Integer", "Yourtion", { type: "ENUM", params: ["Hello", "World"] });
    expect(tenum).toThrow();
  });

  it("TYPES - IntArray", () => {
    expect(paramsChecker("IntArray", [1, 2, 3], { type: "IntArray" })).toEqual([1, 2, 3]);
    expect(paramsChecker("IntArray", "1, 5, 3", { type: "IntArray" })).toEqual([1, 3, 5]);
  });

  it("TYPES - NullableString", () => {
    expect(paramsChecker("NullableString", "1", { type: "NullableString" })).toBe("1");
    expect(paramsChecker("NullableString", null, { type: "NullableString" })).toBeNull();
  });

  it("TYPES - NullableInteger", () => {
    expect(paramsChecker("NullableInteger", "1", { type: "NullableInteger" })).toBe("1");
    expect(paramsChecker("NullableInteger", "1", { type: "NullableInteger", format: true })).toBe(
      1,
    );
    expect(paramsChecker("NullableInteger", 1, { type: "NullableInteger" })).toBe(1);
    expect(paramsChecker("NullableInteger", null, { type: "NullableInteger" })).toBeNull();
  });
});
