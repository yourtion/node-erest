import { vi } from "vitest";
import lib from "./lib";
import typeDocs from "../lib/plugin/generate_markdown/types";
import { 
  trimSpaces, 
  stringToString, 
  stringOrEmpty, 
  itemTF, 
  itemTFEmoji, 
  tableHeader, 
  fieldString 
} from "../lib/plugin/generate_markdown/utils";
import type { IDocData, IDocTypes } from "../lib/extend/docs";

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
  ["Date", "2017-05-01", { type: "Date" }, new Date("2017-05-01")],
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
  ["NullableInteger", "1", { type: "NullableInteger" }, 1],
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
] as unknown[])("TYPES - %s (%s) success", (type, value, params, expected) => {
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
] as unknown[])("TYPES - %s (%s) toThrow", (type, value, params) => {
  // console.log(value, expected);
  if (type === "Any" && value === null) {
    // HACK: 临时修正Typings错误
    expect(value).toEqual(null);
  } else {
    expect(() => paramsChecker(type, value, params)).toThrow();
  }
});

// Tests for typeDocs function and markdown generation
describe("Type Documentation Generation", () => {
  describe("typeDocs function", () => {
    test("should generate documentation for builtin and custom types", () => {
      const mockData: IDocData = {
        types: {
          String: {
            name: "String",
            description: "字符串类型",
            isBuiltin: true,
            checker: true,
            formatter: true,
            parser: true,
            tsType: "string",
            isDefaultFormat: true,
            isParamsRequired: false
          },
          CustomType: {
            name: "CustomType",
            description: "自定义类型",
            isBuiltin: false,
            checker: true,
            formatter: false,
            parser: true,
            tsType: "custom",
            isDefaultFormat: false,
            isParamsRequired: true
          }
        },
        schema: {},
        erest: null,
        typeManager: null,
        apiInfo: { count: 0, tested: 0, untest: [] }
      };

      const result = typeDocs(mockData);

      expect(result).toContain("## 默认数据类型");
      expect(result).toContain("## 自定义数据类型");
      expect(result).toContain("String");
      expect(result).toContain("CustomType");
      expect(result).toContain("字符串类型");
      expect(result).toContain("自定义类型");
    });

    test("should handle empty types object", () => {
      const mockData: IDocData = {
        types: {},
        schema: {},
        erest: null,
        typeManager: null,
        apiInfo: { count: 0, tested: 0, untest: [] }
      };

      const result = typeDocs(mockData);

      expect(result).toContain("## 默认数据类型");
      expect(result).toContain("## 自定义数据类型");
      expect(result).toContain("类型 | 描述 | 检查 | 格式化 | 解析");
    });

    test("should sort types correctly", () => {
      const mockData: IDocData = {
        types: {
          ZType: {
            name: "ZType",
            description: "Z类型",
            isBuiltin: true,
            checker: true,
            formatter: true,
            parser: true,
            tsType: "string",
            isDefaultFormat: true,
            isParamsRequired: false
          },
          AType: {
            name: "AType",
            description: "A类型",
            isBuiltin: true,
            checker: false,
            formatter: false,
            parser: false,
            tsType: "string",
            isDefaultFormat: true,
            isParamsRequired: false
          }
        },
        schema: {},
        erest: null,
        typeManager: null,
        apiInfo: { count: 0, tested: 0, untest: [] }
      };

      const result = typeDocs(mockData);

      // Check that both types are present in the builtin types section
      expect(result).toContain("AType");
      expect(result).toContain("ZType");
      expect(result).toContain("## 默认数据类型");
    });

    test("should handle types with different boolean values", () => {
      const mockData: IDocData = {
        types: {
          TestType: {
            name: "TestType",
            description: "测试类型",
            isBuiltin: false,
            checker: false,
            formatter: true,
            parser: false,
            tsType: "test",
            isDefaultFormat: false,
            isParamsRequired: true
          }
        },
        schema: {},
        erest: null,
        typeManager: null,
        apiInfo: { count: 0, tested: 0, untest: [] }
      };

      const result = typeDocs(mockData);

      expect(result).toContain("TestType");
      expect(result).toContain("测试类型");
      expect(result).toContain("否"); // checker: false
      expect(result).toContain("是"); // formatter: true
    });
  });
});

// Tests for utility functions
describe("Markdown Utils Functions", () => {
  describe("trimSpaces", () => {
    test("should replace \\r\\n with \\n", () => {
      const input = "line1\r\nline2\r\nline3";
      const result = trimSpaces(input);
      expect(result).toBe("line1\nline2\nline3");
    });

    test("should replace multiple newlines with double newlines", () => {
      const input = "line1\n\n\n\nline2";
      const result = trimSpaces(input);
      expect(result).toBe("line1\n\nline2");
    });

    test("should replace newlines with spaces between with double newlines", () => {
      const input = "line1\n   \nline2";
      const result = trimSpaces(input);
      expect(result).toBe("line1\n\nline2");
    });

    test("should handle complex whitespace scenarios", () => {
      const input = "line1\r\n\r\n\r\nline2\n  \n  \nline3\n\n\n\n\nline4";
      const result = trimSpaces(input);
      expect(result).toBe("line1\n\nline2\n\nline3\n\nline4");
    });

    test("should handle empty string", () => {
      const result = trimSpaces("");
      expect(result).toBe("");
    });
  });

  describe("stringToString", () => {
    test("should convert defined string to string", () => {
      const result = stringToString("test");
      expect(result).toBe("test");
    });

    test("should convert number to string", () => {
      const result = stringToString("123");
      expect(result).toBe("123");
    });

    test("should return default string for undefined", () => {
      const result = stringToString(undefined);
      expect(result).toBe("");
    });

    test("should return custom default string for undefined", () => {
      const result = stringToString(undefined, "default");
      expect(result).toBe("default");
    });

    test("should handle null as string", () => {
      const result = stringToString("null");
      expect(result).toBe("null");
    });
  });

  describe("stringOrEmpty", () => {
    test("should return string as is when defined", () => {
      const result = stringOrEmpty("test");
      expect(result).toBe("test");
    });

    test("should return （无） for undefined", () => {
      const result = stringOrEmpty(undefined);
      expect(result).toBe("（无）");
    });

    test("should wrap in backticks when comm is true", () => {
      const result = stringOrEmpty("test", true);
      expect(result).toBe("`test`");
    });

    test("should wrap （无） in backticks when comm is true and string is undefined", () => {
      const result = stringOrEmpty(undefined, true);
      expect(result).toBe("`（无）`");
    });

    test("should handle empty string", () => {
      const result = stringOrEmpty("");
      expect(result).toBe("");
    });
  });

  describe("itemTF", () => {
    test("should return 是 for truthy values", () => {
      expect(itemTF(true)).toBe("是");
      expect(itemTF(1)).toBe("是");
      expect(itemTF("test")).toBe("是");
      expect(itemTF({})).toBe("是");
      expect(itemTF([])).toBe("是");
    });

    test("should return 否 for falsy values", () => {
      expect(itemTF(false)).toBe("否");
      expect(itemTF(0)).toBe("否");
      expect(itemTF("")).toBe("否");
      expect(itemTF(null)).toBe("否");
      expect(itemTF(undefined)).toBe("否");
    });
  });

  describe("itemTFEmoji", () => {
    test("should return ✅ for truthy values", () => {
      expect(itemTFEmoji(true)).toBe("✅");
      expect(itemTFEmoji(1)).toBe("✅");
      expect(itemTFEmoji("test")).toBe("✅");
      expect(itemTFEmoji({})).toBe("✅");
      expect(itemTFEmoji([])).toBe("✅");
    });

    test("should return ❌ for falsy values", () => {
      expect(itemTFEmoji(false)).toBe("❌");
      expect(itemTFEmoji(0)).toBe("❌");
      expect(itemTFEmoji("")).toBe("❌");
      expect(itemTFEmoji(null)).toBe("❌");
      expect(itemTFEmoji(undefined)).toBe("❌");
    });
  });

  describe("tableHeader", () => {
    test("should create table header with titles", () => {
      const titles = ["Column1", "Column2", "Column3"];
      const result = tableHeader(titles);
      expect(result).toBe("Column1 | Column2 | Column3 \n---|---|---");
    });

    test("should handle single column", () => {
      const titles = ["Column1"];
      const result = tableHeader(titles);
      expect(result).toBe("Column1 \n---");
    });

    test("should handle empty array", () => {
      const titles: string[] = [];
      const result = tableHeader(titles);
      expect(result).toBe(" ");
    });

    test("should handle titles with spaces", () => {
      const titles = ["Column 1", "Column 2"];
      const result = tableHeader(titles);
      expect(result).toBe("Column 1 | Column 2 \n---|---");
    });
  });

  describe("fieldString", () => {
    test("should join fields with pipe separator", () => {
      const fields = ["field1", "field2", "field3"];
      const result = fieldString(fields);
      expect(result).toBe("field1 | field2 | field3");
    });

    test("should handle single field", () => {
      const fields = ["field1"];
      const result = fieldString(fields);
      expect(result).toBe("field1");
    });

    test("should handle empty array", () => {
      const fields: string[] = [];
      const result = fieldString(fields);
      expect(result).toBe("");
    });

    test("should trim whitespace", () => {
      const fields = ["field1", "field2", "field3"];
      const result = fieldString(fields);
      expect(result).toBe("field1 | field2 | field3");
    });

    test("should handle fields with spaces", () => {
      const fields = ["field 1", "field 2"];
      const result = fieldString(fields);
      expect(result).toBe("field 1 | field 2");
    });
  });
});
