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
    expect(fn).toThrow("missing required parameter 'numP' is required!");
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
