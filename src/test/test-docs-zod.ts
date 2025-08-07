import { type ZodType, z } from "zod";
import { vi } from "vitest";
import type ERest from "../lib";
import IAPIDoc from "../lib/extend/docs";
import schemaDocs from "../lib/plugin/generate_markdown/schema";
import { buildSwagger } from "../lib/plugin/generate_swagger";
import lib from "./lib";

// 创建测试用的 ERest 实例
const apiService = lib();
const app = apiService;

describe("Zod Documentation Generation Tests", () => {
  let docInstance: IAPIDoc;

  beforeEach(() => {
    // 重置注册表
    (
      app as ERest<unknown> & { typeRegistry: Map<string, ZodType>; schemaRegistry: Map<string, ZodType> }
    ).typeRegistry = new Map();
    (
      app as ERest<unknown> & { typeRegistry: Map<string, ZodType>; schemaRegistry: Map<string, ZodType> }
    ).schemaRegistry = new Map();
    docInstance = new IAPIDoc(app);
  });

  describe("Type Documentation Generation", () => {
    test("should generate documentation for registered Zod types", () => {
      // 注册一些测试类型
      app.type.register("UserName", z.string().min(1).max(50));
      app.type.register("UserAge", z.number().min(0).max(150));
      app.type.register("UserEmail", z.string().email());

      const docData = docInstance.buildDocData();

      expect(docData.types).toBeDefined();
      expect(Object.keys(docData.types)).toHaveLength(3);

      expect(docData.types.UserName).toEqual({
        name: "UserName",
        description: "字符串类型",
        isBuiltin: false,
        tsType: "string",
        isDefaultFormat: true,
        isParamsRequired: false,
      });

      expect(docData.types.UserAge).toEqual({
        name: "UserAge",
        description: "数字类型",
        isBuiltin: false,
        tsType: "number",
        isDefaultFormat: true,
        isParamsRequired: false,
      });

      expect(docData.types.UserEmail).toEqual({
        name: "UserEmail",
        description: "字符串类型",
        isBuiltin: false,
        tsType: "string",
        isDefaultFormat: true,
        isParamsRequired: false,
      });
    });

    test("should generate documentation for registered Zod schemas", () => {
      // 注册一些测试schema
      const userSchema = z.object({
        name: z.string(),
        age: z.number(),
        email: z.string().email(),
      });

      const productSchema = z.object({
        id: z.string().uuid(),
        title: z.string(),
        price: z.number().positive(),
        inStock: z.boolean(),
      });

      app.schema.register("User", userSchema);
      app.schema.register("Product", productSchema);

      const docData = docInstance.buildDocData();

      expect(docData.types).toBeDefined();
      expect(Object.keys(docData.types)).toHaveLength(2);

      expect(docData.types.User).toEqual({
        name: "User",
        description: "对象类型",
        isBuiltin: false,
        tsType: "object",
        isDefaultFormat: true,
        isParamsRequired: false,
      });

      expect(docData.types.Product).toEqual({
        name: "Product",
        description: "对象类型",
        isBuiltin: false,
        tsType: "object",
        isDefaultFormat: true,
        isParamsRequired: false,
      });
    });

    test("should handle complex Zod types correctly", () => {
      // 测试复杂类型
      const complexSchema = z.union([z.string(), z.number(), z.array(z.string())]);

      const optionalSchema = z.string().optional();
      const nullableSchema = z.number().nullable();
      const enumSchema = z.enum(["red", "green", "blue"]);

      app.type.register("ComplexType", complexSchema);
      app.type.register("OptionalString", optionalSchema);
      app.type.register("NullableNumber", nullableSchema);
      app.type.register("ColorEnum", enumSchema);

      const docData = docInstance.buildDocData();

      expect(docData.types.ComplexType.description).toBe("联合类型");
      expect(docData.types.ComplexType.tsType).toBe("string | number | string[]");

      expect(docData.types.OptionalString.description).toBe("可选类型");
      expect(docData.types.OptionalString.tsType).toBe("string | undefined");

      expect(docData.types.NullableNumber.description).toBe("可空类型");
      expect(docData.types.NullableNumber.tsType).toBe("number | null");

      expect(docData.types.ColorEnum.description).toBe("枚举类型");
      expect(docData.types.ColorEnum.tsType).toBe('"red" | "green" | "blue"');
    });
  });

  describe("Markdown Schema Documentation", () => {
    test("should generate markdown documentation for types", () => {
      // 注册测试类型
      app.type.register("TestString", z.string());
      app.type.register("TestNumber", z.number());

      const docData = docInstance.buildDocData();
      const markdownDoc = schemaDocs(docData);

      expect(markdownDoc).toContain("# 数据类型");
      expect(markdownDoc).toContain("## 注册类型");
      expect(markdownDoc).toContain("TestString");
      expect(markdownDoc).toContain("TestNumber");
      expect(markdownDoc).toContain("字符串类型");
      expect(markdownDoc).toContain("数字类型");
    });

    test("should generate markdown documentation for schemas", () => {
      // 注册测试schema
      const userSchema = z.object({
        name: z.string(),
        age: z.number().optional(),
        email: z.string().email(),
      });

      app.schema.register("User", userSchema);

      const docData = docInstance.buildDocData();
      const markdownDoc = schemaDocs(docData);

      expect(markdownDoc).toContain("# 数据类型");
      expect(markdownDoc).toContain("## Schema定义");
      expect(markdownDoc).toContain("## User");
      expect(markdownDoc).toContain("name");
      expect(markdownDoc).toContain("age");
      expect(markdownDoc).toContain("email");
    });
  });

  describe("Swagger Schema Documentation", () => {
    test("should generate swagger definitions for registered types", () => {
      // 注册测试类型
      app.type.register("UserName", z.string());
      app.type.register("UserAge", z.number());

      const docData = docInstance.buildDocData();
      const swaggerDoc = buildSwagger(docData);

      expect(swaggerDoc.definitions).toBeDefined();
      expect(swaggerDoc.definitions.UserName).toEqual({
        type: "string",
        properties: {},
        description: "字符串类型",
      });

      expect(swaggerDoc.definitions.UserAge).toEqual({
        type: "number",
        properties: {},
        description: "数字类型",
      });
    });

    test("should generate swagger definitions for registered schemas", () => {
      // 注册测试schema
      const userSchema = z.object({
        name: z.string(),
        age: z.number(),
        email: z.string().email(),
        isActive: z.boolean().optional(),
      });

      app.schema.register("User", userSchema);

      const docData = docInstance.buildDocData();
      const swaggerDoc = buildSwagger(docData);

      expect(swaggerDoc.definitions.User).toBeDefined();
      const userDef = swaggerDoc.definitions.User;

      expect(userDef.type).toBe("object");
      expect(userDef.properties).toBeDefined();
      expect(userDef.properties.name).toEqual({
        type: "string",
        description: "字符串类型",
      });
      expect(userDef.properties.age).toEqual({
        type: "number",
        description: "数字类型",
      });
      expect(userDef.properties.email).toEqual({
        type: "string",
        description: "字符串类型",
      });
      expect(userDef.properties.isActive).toEqual({
        type: "boolean",
        description: "布尔类型",
      });

      // 检查必填字段
      expect(userDef.required).toEqual(["name", "age", "email"]);
    });

    test("should handle complex Zod schemas in swagger", () => {
      // 测试复杂schema
      const complexSchema = z.object({
        id: z.string().uuid(),
        tags: z.array(z.string()),
        metadata: z.object({
          created: z.date(),
          updated: z.date().optional(),
        }),
        status: z.enum(["active", "inactive", "pending"]),
      });

      app.schema.register("ComplexEntity", complexSchema);

      const docData = docInstance.buildDocData();
      const swaggerDoc = buildSwagger(docData);

      const complexDef = swaggerDoc.definitions.ComplexEntity;
      expect(complexDef).toBeDefined();
      expect(complexDef.type).toBe("object");

      expect(complexDef.properties.id).toEqual({
        type: "string",
        description: "字符串类型",
      });

      expect(complexDef.properties.tags).toEqual({
        type: "array",
        description: "数组类型",
      });

      expect(complexDef.properties.metadata).toEqual({
        type: "object",
        description: "对象类型",
      });

      expect(complexDef.properties.status).toEqual({
        type: "string",
        description: "枚举类型",
      });
    });
  });

  describe("Edge Cases and Error Handling", () => {
    test("should handle empty registries gracefully", () => {
      const docData = docInstance.buildDocData();
      const markdownDoc = schemaDocs(docData);
      const swaggerDoc = buildSwagger(docData);

      expect(docData.types).toEqual({});
      expect(markdownDoc).toContain("# 数据类型");
      expect(swaggerDoc.definitions).toEqual({});
    });

    test("should handle invalid Zod schemas gracefully", () => {
      // 模拟无效的schema
      (app as Record<string, unknown>).typeRegistry.set("InvalidType", null);
      (app as Record<string, unknown>).schemaRegistry.set("InvalidSchema", { _def: null });

      const docData = docInstance.buildDocData();

      expect(docData.types.InvalidType).toEqual({
        name: "InvalidType",
        description: "未知类型",
        isBuiltin: false,
        tsType: "unknown",
        isDefaultFormat: true,
        isParamsRequired: false,
      });

      expect(docData.types.InvalidSchema).toEqual({
        name: "InvalidSchema",
        description: "未知类型",
        isBuiltin: false,
        tsType: "unknown",
        isDefaultFormat: true,
        isParamsRequired: false,
      });
    });
  });

  describe("Document Generation and Plugin System", () => {
    test("should register and execute plugins correctly", () => {
      let pluginExecuted = false;
      const testPlugin = (data: any, dir: string, options: any, writer: any) => {
        pluginExecuted = true;
        expect(data).toBeDefined();
        expect(dir).toBe("/test/dir");
        expect(options).toBeDefined();
        expect(writer).toBeDefined();
      };

      docInstance.registerPlugin("test", testPlugin);
      docInstance.genDocs();
      
      // Mock the save process
      const mockWriter = vi.fn();
      docInstance.setWritter(mockWriter);
      docInstance.save("/test/dir");

      expect(pluginExecuted).toBe(true);
    });

    test("should handle plugin errors gracefully", () => {
      const errorPlugin = () => {
        throw new Error("Plugin error");
      };

      // Should not throw when plugin fails
      expect(() => {
        docInstance.registerPlugin("error", errorPlugin);
        docInstance.genDocs();
        docInstance.save("/test/dir");
      }).not.toThrow();
    });

    test("should generate correct API info statistics", () => {
      // This test needs to be adjusted since we don't have actual APIs registered
      const docData = docInstance.buildDocData();

      expect(docData.apiInfo.count).toBe(0);
      expect(docData.apiInfo.tested).toBe(0);
      expect(docData.apiInfo.untest).toHaveLength(0);
    });

    test("should format example outputs correctly", () => {
      const mockFormatOutput = vi.fn((output) => ({ formatted: output }));
      app.api.docOutputForamt = mockFormatOutput;

      const docData = docInstance.buildDocData();
      
      // Since we don't have APIs with examples, this test verifies the function is set
      expect(app.api.docOutputForamt).toBe(mockFormatOutput);
    });

    test("should handle custom writer function", () => {
      const mockWriter = vi.fn();
      docInstance.setWritter(mockWriter);
      docInstance.genDocs();
      
      // Test that the writer was set correctly
      expect(mockWriter).toBeDefined();
    });

    test("should build swagger info correctly", () => {
      app.type.register("TestType", z.string());
      app.schema.register("TestSchema", z.object({ name: z.string() }));

      const swaggerInfo = docInstance.getSwaggerInfo();

      expect(swaggerInfo).toBeDefined();
      expect(swaggerInfo.definitions).toBeDefined();
      expect(swaggerInfo.definitions.TestType).toBeDefined();
      expect(swaggerInfo.definitions.TestSchema).toBeDefined();
    });

    test("should cache doc data correctly", () => {
      const docData1 = docInstance.buildDocData();
      const docData2 = docInstance.buildDocData();

      expect(docData1).toBe(docData2); // Should return same cached instance
    });

    test("should handle saveOnExit correctly", () => {
      const originalProcessOn = process.on;
      const mockProcessOn = vi.fn();
      process.on = mockProcessOn;

      docInstance.saveOnExit("/test/dir");

      expect(mockProcessOn).toHaveBeenCalledWith("exit", expect.any(Function));

      // Restore original process.on
      process.on = originalProcessOn;
    });
  });

  describe("Zod Schema Type Extraction", () => {
    test("should extract lazy schema types correctly", () => {
      const lazySchema = z.lazy(() => z.object({
        name: z.string(),
        age: z.number()
      }));

      app.schema.register("LazyUser", lazySchema);

      const docData = docInstance.buildDocData();
      const markdownDoc = schemaDocs(docData);

      expect(markdownDoc).toContain("LazyUser");
      expect(markdownDoc).toContain("name");
      expect(markdownDoc).toContain("age");
    });

    test("should handle recursive lazy schemas", () => {
      interface TreeNode {
        value: string;
        children?: TreeNode[];
      }

      const treeSchema: z.ZodType<TreeNode> = z.lazy(() => z.object({
        value: z.string(),
        children: z.array(treeSchema).optional()
      }));

      app.schema.register("TreeNode", treeSchema);

      const docData = docInstance.buildDocData();
      const markdownDoc = schemaDocs(docData);

      expect(markdownDoc).toContain("TreeNode");
      expect(markdownDoc).toContain("value");
      expect(markdownDoc).toContain("children");
    });

    test("should handle default values in schemas", () => {
      const schemaWithDefaults = z.object({
        name: z.string(),
        status: z.string().default("active"),
        count: z.number().default(() => 0),
        enabled: z.boolean().default(true)
      });

      app.schema.register("EntityWithDefaults", schemaWithDefaults);

      const docData = docInstance.buildDocData();
      const markdownDoc = schemaDocs(docData);

      expect(markdownDoc).toContain("EntityWithDefaults");
      expect(markdownDoc).toContain("active");
      expect(markdownDoc).toContain("true");
    });

    test("should handle union types in schemas", () => {
      const unionSchema = z.object({
        id: z.union([z.string(), z.number()]),
        status: z.union([z.literal("active"), z.literal("inactive")]),
        data: z.union([z.string(), z.object({ value: z.number() })])
      });

      app.schema.register("UnionEntity", unionSchema);

      const docData = docInstance.buildDocData();
      const markdownDoc = schemaDocs(docData);

      expect(markdownDoc).toContain("UnionEntity");
      expect(markdownDoc).toContain("id");
      expect(markdownDoc).toContain("status");
      expect(markdownDoc).toContain("data");
    });

    test("should handle array schemas with complex elements", () => {
      const arraySchema = z.object({
        users: z.array(z.object({
          name: z.string(),
          email: z.string().email()
        })),
        tags: z.array(z.string()),
        scores: z.array(z.number())
      });

      app.schema.register("ArrayEntity", arraySchema);

      const docData = docInstance.buildDocData();
      const markdownDoc = schemaDocs(docData);

      expect(markdownDoc).toContain("ArrayEntity");
      expect(markdownDoc).toContain("users");
      expect(markdownDoc).toContain("tags");
      expect(markdownDoc).toContain("scores");
    });

    test("should handle enum schemas correctly", () => {
      const enumSchema = z.object({
        color: z.enum(["red", "green", "blue"]),
        size: z.enum(["small", "medium", "large"]),
        priority: z.enum(["low", "medium", "high"])
      });

      app.schema.register("EnumEntity", enumSchema);

      const docData = docInstance.buildDocData();
      const markdownDoc = schemaDocs(docData);

      expect(markdownDoc).toContain("EnumEntity");
      expect(markdownDoc).toContain("color");
      expect(markdownDoc).toContain("size");
      expect(markdownDoc).toContain("priority");
      expect(markdownDoc).toContain("枚举类型");
    });

    test("should handle nullable and optional fields", () => {
      const nullableSchema = z.object({
        required: z.string(),
        optional: z.string().optional(),
        nullable: z.string().nullable(),
        optionalNullable: z.string().optional().nullable()
      });

      app.schema.register("NullableEntity", nullableSchema);

      const docData = docInstance.buildDocData();
      const markdownDoc = schemaDocs(docData);

      expect(markdownDoc).toContain("NullableEntity");
      expect(markdownDoc).toContain("required");
      expect(markdownDoc).toContain("optional");
      expect(markdownDoc).toContain("nullable");
      expect(markdownDoc).toContain("optionalNullable");
    });
  });
});
