import lib from "./lib";

const apiService = lib();

import { build, TYPES } from "./helper";
const paramsChecker = apiService.paramsChecker();
const schemaChecker = apiService.schemaChecker();

const stringP1 = build(TYPES.String, "StringSchema", true);
const stringP2 = build(TYPES.String, "StringSchema", true, "Hello");
const stringP3 = build(TYPES.String, "StringSchema");

const numP = build(TYPES.Number, "Number", true);
const intP = build(TYPES.Integer, "Int");
const enumP = build(TYPES.ENUM, "Int", true, undefined, ["A", "B", 1]);
const jsonP = build(TYPES.JSON, "Json");

const schema1: Record<string, any> = { stringP2, stringP3, numP, intP };
const array1 = build(TYPES.Array, "Array with String param", true, undefined, TYPES.Integer);
const array2 = build(TYPES.Array, "Array with Type param", true, undefined, jsonP);

describe("Params - params checker", () => {
  it("ParamsChecker - simple checker success", () => {
    expect(paramsChecker("st1", "1", stringP1)).toBe("1");
    stringP3.format = true;
    expect(paramsChecker("st2", "1", stringP3)).toBe("1");
    expect(paramsChecker("nu1", "1", numP)).toBe(1);
    expect(paramsChecker("en1", "A", enumP)).toBe("A");
    expect(paramsChecker("json", '{ "a": 1 }', jsonP)).toEqual({ a: 1 });
    jsonP.format = false;
    expect(paramsChecker("json", '{ "a": 1 }', jsonP)).toEqual('{ "a": 1 }');
  });

  it("ParamsChecker - ENUM", () => {
    expect(paramsChecker("en1", 1, enumP)).toBe(1);
    const fn = () => paramsChecker("en2", "C", enumP);
    expect(fn).toThrow("incorrect parameter 'en2' should be valid ENUM with additional restrictions: A,B,1");
  });

  it("ParamsChecker - Array with String param", () => {
    expect(paramsChecker("array1", ["1", 2, "99"], array1)).toEqual([1, 2, 99]);
    const fn = () => paramsChecker("array1", ["1", 2, "a"], array1);
    expect(fn).toThrow("incorrect parameter 'array1[2]' should be valid Integer");
  });

  it("ParamsChecker - Array with Type param", () => {
    jsonP.format = true;
    expect(paramsChecker("array2", ['{ "a": 1 }', '{ "b": 2 }', "{}"], array2)).toEqual([{ a: 1 }, { b: 2 }, {}]);
    const fn = () => paramsChecker("array2", ['{ "a": 1 }', "{"], array2);
    expect(fn).toThrow("incorrect parameter 'array2[1]' should be valid JSON");
  });
});

describe("Params - schema checker", () => {
  it("SchemaChecker - success", () => {
    const data = { stringP2: "a", numP: 1.02, intP: 2 };
    const res = schemaChecker(data, schema1);
    expect(res).toEqual(data);
  });

  it("SchemaChecker - remove not in schema success", () => {
    const data = { numP: 1.02, a: "xxx" };
    const res = schemaChecker(data, schema1);
    expect(res.a).toBeUndefined();
  });

  it("SchemaChecker - requied check throw", () => {
    const data = { a: "xxx" };
    const fn = () => schemaChecker(data, schema1);
    expect(fn).toThrow("missing required parameter 'numP'");
  });

  it("SchemaChecker - requiedOneOf check ok", () => {
    const data = { numP: 123 } as any;
    const res = schemaChecker(data, schema1, ["numP", "stringP3"]);
    data.stringP2 = "Hello";
    expect(res).toEqual(data);
  });

  it("SchemaChecker - requiedOneOf check throw", () => {
    const data = { numP: 122 };
    const fn = () => schemaChecker(data, schema1, ["intP", "stringP3"]);
    expect(fn).toThrow("missing required parameter one of intP, stringP3 is required");
  });
});
