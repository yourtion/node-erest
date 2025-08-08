/**
 * 针对schema.ts未覆盖代码的测试用例
 * 提高测试覆盖率
 */

import assert from "assert";
import { z } from "zod";
import schemaDocs from "../../dist/lib/plugin/generate_markdown/schema";
import type ERest from "../lib";
import IAPIDoc from "../lib/extend/docs";
import lib from "./lib";

// 创建测试用的 ERest 实例
const apiService = lib();
const app = apiService;

describe("Schema Coverage Tests", () => {
  let docInstance: IAPIDoc;

  beforeEach(() => {
    // 重置注册表
    (app as any).typeRegistry = new Map();
    (app as any).schemaRegistry = new Map();
    docInstance = new IAPIDoc(app);
  });

  describe("extractZodFieldInfo edge cases", () => {
    it("should handle ZodArray with unknown inner type", () => {
      const arraySchema = z.array(z.string());
      // Mock the _def to simulate missing type field
      (arraySchema._def as any).type = undefined;
      app.schema.register("ArrayUnknownSchema", z.object({ field: arraySchema }));

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("## ArrayUnknownSchema"));
    });

    it("should handle ZodEnum with non-array values", () => {
      const mockEnumSchema = {
        _def: {
          typeName: "ZodObject",
          shape: () => ({
            enumField: {
              _def: {
                typeName: "ZodEnum",
                values: "single_value",
              },
            },
          }),
        },
      } as any;

      app.schema.register("EnumNonArraySchema", mockEnumSchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("## EnumNonArraySchema"));
    });

    it("should handle ZodEnum without values", () => {
      const mockEnumSchema = {
        _def: {
          typeName: "ZodObject",
          shape: () => ({
            enumField: {
              _def: {
                typeName: "ZodEnum",
                values: undefined,
              },
            },
          }),
        },
      } as any;

      app.schema.register("EnumNoValuesSchema", mockEnumSchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("## EnumNoValuesSchema"));
    });

    it("should handle ZodDefault with undefined value", () => {
      const mockDefaultSchema = {
        _def: {
          typeName: "ZodObject",
          shape: () => ({
            defaultField: {
              _def: {
                typeName: "ZodDefault",
                innerType: {
                  _def: { typeName: "ZodString" },
                },
                defaultValue: undefined,
              },
            },
          }),
        },
      } as any;

      app.schema.register("DefaultUndefinedSchema", mockDefaultSchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("## DefaultUndefinedSchema"));
    });

    it("should handle ZodUnion without options", () => {
      const mockUnionSchema = {
        _def: {
          typeName: "ZodObject",
          shape: () => ({
            unionField: {
              _def: {
                typeName: "ZodUnion",
                options: undefined,
              },
            },
          }),
        },
      } as any;

      app.schema.register("UnionNoOptionsSchema", mockUnionSchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("## UnionNoOptionsSchema"));
    });

    it("should handle ZodLazy without getter", () => {
      const mockLazySchema = {
        _def: {
          typeName: "ZodObject",
          shape: () => ({
            lazyField: {
              _def: {
                typeName: "ZodLazy",
                getter: undefined,
              },
            },
          }),
        },
      } as any;

      app.schema.register("LazyNoGetterSchema", mockLazySchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("## LazyNoGetterSchema"));
    });

    it("should handle unknown type without typeName", () => {
      const mockUnknownSchema = {
        _def: {
          typeName: undefined,
          type: undefined,
        },
      } as any;

      app.schema.register("UnknownNoTypeNameSchema", mockUnknownSchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("# 数据类型"));
    });

    it("should handle schema with description property", () => {
      const mockSchemaWithDesc = {
        _def: {
          typeName: "ZodObject",
          shape: () => ({
            field: {
              _def: { typeName: "ZodString" },
            },
          }),
        },
        description: "Direct description",
      } as any;

      app.schema.register("DescPropertySchema", mockSchemaWithDesc);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("## DescPropertySchema"));
    });

    it("should handle undefined zodSchema", () => {
      const docData = {
        types: {},
        schema: {
          get: () => undefined,
          has: () => false,
        },
        erest: {
          schemaRegistry: new Map(),
        },
      };

      const result = schemaDocs(docData);
      assert.ok(result.includes("# 数据类型"));
    });

    it("should handle zodSchema without _def", () => {
      const invalidSchema = {} as any;
      app.schema.register("InvalidSchema", invalidSchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("# 数据类型"));
    });

    it("should handle ZodLazy with getter function", () => {
      const lazySchema = z.lazy(() =>
        z.object({
          id: z.string(),
          name: z.string(),
        })
      );

      app.schema.register("LazySchema", lazySchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("## LazySchema"));
    });

    it("should handle ZodLazy with failing getter", () => {
      const failingLazySchema = z.lazy(() => {
        throw new Error("Getter failed");
      });

      app.schema.register("FailingLazySchema", failingLazySchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("## FailingLazySchema"));
    });

    it("should handle ZodDefault with function defaultValue", () => {
      const defaultSchema = z.object({
        timestamp: z.number().default(() => Date.now()),
        uuid: z.string().default(() => "generated-uuid"),
      });

      app.schema.register("DefaultSchema", defaultSchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("## DefaultSchema"));
      assert.ok(result.includes("timestamp"));
      assert.ok(result.includes("uuid"));
    });

    it("should handle ZodDefault with failing function defaultValue", () => {
      // 创建一个模拟的schema，避免在注册时就执行default函数
      const mockSchema = {
        _def: {
          typeName: "ZodObject",
          shape: () => ({
            failingDefault: {
              _def: {
                typeName: "ZodDefault",
                innerType: {
                  _def: { typeName: "ZodString" },
                },
                defaultValue: () => {
                  throw new Error("Default function failed");
                },
              },
            },
          }),
        },
      } as any;

      app.schema.register("FailingDefaultSchema", mockSchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("## FailingDefaultSchema"));
    });

    it("should handle ZodUnion with empty options", () => {
      // 创建一个模拟的ZodUnion，options为空
      const emptyUnionSchema = {
        _def: {
          typeName: "ZodUnion",
          options: [],
        },
      } as any;

      app.schema.register("EmptyUnionSchema", emptyUnionSchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("# 数据类型"));
    });

    it("should handle ZodEnum with values", () => {
      const enumSchema = z.object({
        status: z.enum(["active", "inactive", "pending"]),
        priority: z.enum(["low", "medium", "high"]),
      });

      app.schema.register("EnumSchema", enumSchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("## EnumSchema"));
      assert.ok(result.includes("status"));
      assert.ok(result.includes("priority"));
    });

    it("should handle unknown type names", () => {
      const unknownTypeSchema = {
        _def: {
          typeName: "ZodUnknownType",
        },
      } as any;

      app.schema.register("UnknownTypeSchema", unknownTypeSchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("# 数据类型"));
    });

    it("should handle schema with description", () => {
      const describedSchema = z.object({
        field1: z.string().describe("这是一个字符串字段"),
        field2: z.number().describe("这是一个数字字段"),
      });

      app.schema.register("DescribedSchema", describedSchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("## DescribedSchema"));
      assert.ok(result.includes("这是一个字符串字段"));
      assert.ok(result.includes("这是一个数字字段"));
    });
  });

  describe("Schema registry edge cases", () => {
    it("should handle missing schemaRegistry", () => {
      const docData = {
        types: {},
        schema: {},
        erest: {},
      };

      const result = schemaDocs(docData);
      assert.ok(result.includes("# 数据类型"));
    });

    it("should handle schemaRegistry as non-Map", () => {
      const docData = {
        types: {},
        schema: {
          someProperty: "not a map",
        },
        erest: {
          schemaRegistry: "not a map",
        },
      };

      const result = schemaDocs(docData);
      assert.ok(result.includes("# 数据类型"));
    });

    it("should find schemaRegistry in schemaManager properties", () => {
      const schemaRegistry = new Map();
      schemaRegistry.set(
        "TestSchema",
        z.object({
          id: z.string(),
          name: z.string(),
        })
      );

      const docData = {
        types: {},
        schema: {
          registryProperty: schemaRegistry,
        },
        erest: {},
      };

      const result = schemaDocs(docData);
      assert.ok(result.includes("# 数据类型"));
      assert.ok(result.includes("## Schema定义"));
      assert.ok(result.includes("## TestSchema"));
    });

    it("should handle empty schemaRegistry", () => {
      const docData = {
        types: {},
        schema: {},
        erest: {
          schemaRegistry: new Map(),
        },
      };

      const result = schemaDocs(docData);
      assert.ok(result.includes("# 数据类型"));
      assert.ok(!result.includes("## Schema定义"));
    });
  });

  describe("Type documentation edge cases", () => {
    it("should handle types with empty object", () => {
      const docData = {
        types: {},
        schema: {},
        erest: {},
      };

      const result = schemaDocs(docData);
      assert.ok(result.includes("# 数据类型"));
      assert.ok(!result.includes("## 注册类型"));
    });

    it("should handle types with valid data", () => {
      const docData = {
        types: {
          CustomType: {
            name: "CustomType",
            description: "A custom type",
            isBuiltin: false,
            checker: true,
            formatter: true,
            parser: true,
          },
        },
        schema: {},
        erest: {},
      };

      const result = schemaDocs(docData);
      assert.ok(result.includes("# 数据类型"));
      assert.ok(result.includes("## 注册类型"));
      assert.ok(result.includes("CustomType"));
    });
  });

  describe("Complex schema scenarios", () => {
    it("should handle deeply nested schemas", () => {
      const deepSchema = z.object({
        level1: z.object({
          level2: z.object({
            level3: z.object({
              level4: z.string(),
            }),
          }),
        }),
      });

      app.schema.register("DeepSchema", deepSchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("## DeepSchema"));
      assert.ok(result.includes("level1"));
    });

    it("should handle schemas with all Zod types", () => {
      const allTypesSchema = z.object({
        stringField: z.string(),
        numberField: z.number(),
        booleanField: z.boolean(),
        dateField: z.date(),
        arrayField: z.array(z.string()),
        objectField: z.object({ nested: z.string() }),
        enumField: z.enum(["a", "b", "c"]),
        optionalField: z.string().optional(),
        defaultField: z.string().default("default"),
        unionField: z.union([z.string(), z.number()]),
      });

      app.schema.register("AllTypesSchema", allTypesSchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("## AllTypesSchema"));
      assert.ok(result.includes("stringField"));
      assert.ok(result.includes("numberField"));
      assert.ok(result.includes("booleanField"));
      assert.ok(result.includes("dateField"));
      assert.ok(result.includes("arrayField"));
      assert.ok(result.includes("objectField"));
      assert.ok(result.includes("enumField"));
      assert.ok(result.includes("optionalField"));
      assert.ok(result.includes("defaultField"));
      assert.ok(result.includes("unionField"));
    });
  });

  describe("schemaDocs function", () => {
    it("should generate schema documentation", () => {
      const schema = z.object({
        name: z.string().describe("User name"),
        age: z.number().optional(),
        email: z.string().default("test@example.com"),
      });

      app.schema.register("User", schema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("# 数据类型"));
      assert.ok(result.includes("## User"));
      assert.ok(result.includes("name"));
      assert.ok(result.includes("age"));
      assert.ok(result.includes("email"));
    });

    it("should handle missing erest instance", () => {
      const docData = {
        types: {},
        schema: {
          get: () => undefined,
          has: () => false,
        },
        erest: null,
      };

      const result = schemaDocs(docData as any);

      assert.ok(result.includes("# 数据类型"));
    });

    it("should handle erest without schemaRegistry", () => {
      const docData = {
        types: {},
        schema: {
          get: () => undefined,
          has: () => false,
        },
        erest: {
          // No schemaRegistry property
        },
      };

      const result = schemaDocs(docData as any);

      assert.ok(result.includes("# 数据类型"));
    });

    it("should handle schemaManager with Map property", () => {
      const testMap = new Map();
      testMap.set("TestSchema", z.string());

      const docData = {
        types: {},
        schema: {
          get: () => undefined,
          has: () => false,
          someMapProperty: testMap,
        },
        erest: null,
      };

      const result = schemaDocs(docData as any);

      assert.ok(result.includes("# 数据类型"));
      assert.ok(result.includes("## TestSchema"));
    });

    it("should handle empty schemaRegistry", () => {
      const docData = {
        types: {},
        schema: {
          get: () => undefined,
          has: () => false,
        },
        erest: {
          schemaRegistry: new Map(),
        },
      };

      const result = schemaDocs(docData as any);

      assert.ok(result.includes("# 数据类型"));
    });

    it("should handle non-Map schemaRegistry", () => {
      const docData = {
        types: {},
        schema: {
          get: () => undefined,
          has: () => false,
        },
        erest: {
          schemaRegistry: "not a map",
        },
      };

      const result = schemaDocs(docData as any);

      assert.ok(result.includes("# 数据类型"));
    });
  });

  describe("generateZodSchemaInfo function", () => {
    it("should handle ZodLazy with object inner schema", () => {
      const lazyObjectSchema = z.lazy(() =>
        z.object({
          name: z.string(),
          age: z.number(),
        })
      );

      app.schema.register("LazyObjectSchema", lazyObjectSchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("## LazyObjectSchema"));
      assert.ok(result.includes("name"));
      assert.ok(result.includes("age"));
    });

    it("should handle ZodLazy with function shape", () => {
      const mockLazySchema = {
        _def: {
          typeName: "ZodLazy",
          getter: () => ({
            _def: {
              typeName: "ZodObject",
              shape: () => ({
                dynamicField: {
                  _def: { typeName: "ZodString" },
                },
              }),
            },
          }),
        },
      } as any;

      app.schema.register("LazyFunctionShapeSchema", mockLazySchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("## LazyFunctionShapeSchema"));
    });

    it("should handle ZodLazy with non-object inner schema", () => {
      const lazyStringSchema = z.lazy(() => z.string());

      app.schema.register("LazyStringSchema", lazyStringSchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("## LazyStringSchema"));
    });

    it("should handle ZodLazy with getter exception", () => {
      const mockLazySchema = {
        _def: {
          typeName: "ZodLazy",
          getter: () => {
            throw new Error("Getter error");
          },
        },
      } as any;

      app.schema.register("LazyErrorSchema", mockLazySchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("## LazyErrorSchema"));
    });

    it("should handle non-object schema", () => {
      const stringSchema = z.string().describe("Simple string");

      app.schema.register("SimpleStringSchema", stringSchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("## SimpleStringSchema"));
    });

    it("should handle schema without _def", () => {
      const mockSchema = {} as any;

      app.schema.register("NoDefSchema", mockSchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("# 数据类型"));
    });

    it("should handle ZodLazy with type value lazy", () => {
      const mockSchema = {
        _def: {
          type: "lazy",
          getter: () =>
            z.object({
              field: z.string(),
            }),
        },
      } as any;

      app.schema.register("TypeValueLazySchema", mockSchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("## TypeValueLazySchema"));
    });

    it("should handle ZodLazy with def.getter instead of _def.getter", () => {
      const mockSchema = {
        _def: {
          typeName: "ZodLazy",
        },
        def: {
          type: "lazy",
          getter: () => ({
            _def: {
              typeName: "ZodString",
            },
          }),
        },
      } as any;

      app.schema.register("DefGetterSchema", mockSchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("## DefGetterSchema"));
    });

    it("should handle ZodLazy without getter", () => {
      const mockSchema = {
        _def: {
          typeName: "ZodLazy",
        },
        def: {
          type: "lazy",
        },
      } as any;

      app.schema.register("NoGetterSchema", mockSchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("## NoGetterSchema"));
    });

    it("should handle default case in switch statement", () => {
      const mockSchema = {
        _def: {
          typeName: "ZodCustomType",
        },
      } as any;

      app.schema.register("CustomTypeSchema", mockSchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("## CustomTypeSchema"));
    });

    it("should handle schema with no typeName", () => {
      const mockSchema = {
        _def: {},
      } as any;

      app.schema.register("NoTypeNameSchema", mockSchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("## NoTypeNameSchema"));
    });

    it("should handle ZodDefault with function defaultValue that throws", () => {
      const mockSchema = {
        _def: {
          typeName: "ZodDefault",
          innerType: {
            _def: {
              typeName: "ZodString",
            },
          },
          defaultValue: () => {
            throw new Error("Default value error");
          },
        },
      } as any;

      app.schema.register("ThrowingDefaultSchema", mockSchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("## ThrowingDefaultSchema"));
    });

    it("should handle type that exists in typeManager", () => {
      const docData = {
        types: {
          TestType: {
            name: "TestType",
            tsType: "string",
            description: "Test type",
            isDefaultFormat: true,
            isParamsRequired: false,
          },
        },
        schema: {},
        erest: {},
      };

      const result = schemaDocs(docData);
      assert.ok(result.includes("## 注册类型"));
      assert.ok(result.includes("TestType"));
    });

    it("should handle empty type string", () => {
      const docData = {
        types: {
          EmptyType: {
            name: "",
            tsType: "",
            description: "",
            isDefaultFormat: false,
            isParamsRequired: true,
          },
        },
        schema: {},
        erest: {},
      };

      const result = schemaDocs(docData);
      assert.ok(result.includes("## 注册类型"));
    });

    // Test _parseType function coverage - this function is not directly called in current implementation
    // The _parseType function exists but is not used in the current code path
    // We need to test the actual code paths that are executed

    it("should handle types with tsType field", () => {
      const docData = {
        typeManager: { has: (type: string) => type === "KnownType" },
        types: {
          TestType: {
            name: "TestType",
            tsType: "string",
            description: "Test type",
            isDefaultFormat: true,
            isParamsRequired: false,
          },
        },
        schema: {},
        erest: {},
      };

      const result = schemaDocs(docData);
      assert.ok(result.includes("TestType"));
      assert.ok(result.includes("string"));
    });

    it("should handle types without tsType field", () => {
      const docData = {
        typeManager: { has: () => false },
        types: {
          TestType: {
            name: "TestType",
            tsType: undefined,
            description: "Test type",
            isDefaultFormat: true,
            isParamsRequired: false,
          },
        },
        schema: {},
        erest: {},
      };

      const result = schemaDocs(docData);
      assert.ok(result.includes("TestType"));
      assert.ok(result.includes("unknown"));
    });

    // Test ZodLazy with getter in generateZodSchemaInfo
    it("should handle ZodLazy with getter in generateZodSchemaInfo", () => {
      const mockLazySchema = {
        _def: {
          typeName: "ZodLazy",
          getter: () => ({
            _def: {
              typeName: "ZodObject",
              shape: {
                field1: { _def: { typeName: "ZodString" } },
                field2: { _def: { typeName: "ZodNumber" } },
              },
            },
          }),
        },
      } as any;

      app.schema.register("LazyObjectSchema", mockLazySchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("## LazyObjectSchema"));
    });

    it("should handle ZodLazy with function shape", () => {
      const mockLazySchema = {
        _def: {
          typeName: "ZodLazy",
          getter: () => ({
            _def: {
              typeName: "ZodObject",
              shape: () => ({
                dynamicField: { _def: { typeName: "ZodString" } },
              }),
            },
          }),
        },
      } as any;

      app.schema.register("LazyFunctionShapeSchema", mockLazySchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("## LazyFunctionShapeSchema"));
    });

    it("should handle ZodLazy with non-object inner type", () => {
      const mockLazySchema = {
        _def: {
          typeName: "ZodLazy",
          getter: () => ({
            _def: {
              typeName: "ZodString",
            },
          }),
        },
      } as any;

      app.schema.register("LazyStringSchema", mockLazySchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("## LazyStringSchema"));
    });

    it("should handle ZodLazy with getter that throws", () => {
      const mockLazySchema = {
        _def: {
          typeName: "ZodLazy",
          getter: () => {
            throw new Error("Getter failed");
          },
        },
      } as any;

      app.schema.register("LazyErrorSchema", mockLazySchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("## LazyErrorSchema"));
    });

    it("should handle ZodLazy with type value lazy", () => {
      const mockLazySchema = {
        _def: {
          type: "lazy",
          getter: () => ({
            _def: {
              typeName: "ZodString",
            },
          }),
        },
      } as any;

      app.schema.register("TypeLazySchema", mockLazySchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("## TypeLazySchema"));
    });

    it("should handle ZodLazy with typeName lazy", () => {
      const mockLazySchema = {
        _def: {
          typeName: "lazy",
          getter: () => ({
            _def: {
              typeName: "ZodString",
            },
          }),
        },
      } as any;

      app.schema.register("TypeNameLazySchema", mockLazySchema);

      const docData = docInstance.buildDocData();
      const result = schemaDocs(docData);

      assert.ok(result.includes("## TypeNameLazySchema"));
    });
  });
});
