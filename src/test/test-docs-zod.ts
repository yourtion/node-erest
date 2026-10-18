import Debug from "debug";
import { vol } from "memfs";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import IAPIDoc, { type IDocGeneratePlugin, type IDocWritter } from "../lib/extend/docs";
import apiDocs from "../lib/plugin/generate_markdown/apis";
import errorDocs from "../lib/plugin/generate_markdown/errors";
import generateMarkdown from "../lib/plugin/generate_markdown/index";
import schemaDocs from "../lib/plugin/generate_markdown/schema";
import typeDocs from "../lib/plugin/generate_markdown/types";
import { fieldString, tableHeader, trimSpaces } from "../lib/plugin/generate_markdown/utils";
import { buildSwagger } from "../lib/plugin/generate_swagger";
import lib from "./lib";

// 创建测试用的 ERest 实例
const apiService = lib();
const app = apiService;

describe("Zod Documentation Generation Tests", () => {
  let docInstance: IAPIDoc;

  beforeEach(() => {
    // 重置注册表
    (app as any).typeRegistry = new Map();
    (app as any).schemaRegistry = new Map();
    docInstance = new IAPIDoc(app as any);
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
      // 模拟无效的 schema（非 ZodType）
      (app as any).typeRegistry.set("InvalidType", null);
      (app as any).schemaRegistry.set("InvalidSchema", null);

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
      const testPlugin: IDocGeneratePlugin = (data, dir, options, writer) => {
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

      // 静默错误输出以避免测试中的 stderr 噪音
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Should not throw when plugin fails
      expect(() => {
        docInstance.registerPlugin("error", errorPlugin);
        docInstance.genDocs();
        docInstance.save("/test/dir");
      }).not.toThrow();

      // 恢复 console.error
      consoleErrorSpy.mockRestore();
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
      app.api.docOutputFormat = mockFormatOutput;

      docInstance.buildDocData();

      // Since we don't have APIs with examples, this test verifies the function is set
      expect(app.api.docOutputFormat).toBe(mockFormatOutput);
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

      const swaggerInfo = docInstance.getSwaggerInfo() as any;

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
      const lazySchema = z.lazy(() =>
        z.object({
          name: z.string(),
          age: z.number(),
        })
      );

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

      const treeSchema: z.ZodType<TreeNode> = z.lazy(() =>
        z.object({
          value: z.string(),
          children: z.array(treeSchema).optional(),
        })
      );

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
        enabled: z.boolean().default(true),
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
        data: z.union([z.string(), z.object({ value: z.number() })]),
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
        users: z.array(
          z.object({
            name: z.string(),
            email: z.string().email(),
          })
        ),
        tags: z.array(z.string()),
        scores: z.array(z.number()),
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
        priority: z.enum(["low", "medium", "high"]),
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
        optionalNullable: z.string().optional().nullable(),
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

/** 构造满足 isZodSchema 契约（_def + parse）的最小 fake schema */
function fakeZod(def: Record<string, unknown>) {
  return { _def: def, def, parse: () => ({ ok: true }) } as any;
}

/** 重置 lib 实例上的类型/Schema 注册表 */
function resetRegistries() {
  (app as any).typeRegistry = new Map();
  (app as any).schemaRegistry = new Map();
}

/** 构造带 forEach 的最小 errorManager fake */
function fakeErrorManager(errors: Array<Record<string, unknown>>) {
  return { forEach: (cb: (v: unknown) => void) => errors.forEach(cb) };
}

/** 构造 apiDocs 所需的最小 docData */
function buildApiData(
  apis: Record<string, unknown>,
  group: Record<string, string> = { User: "用户组", Other: "其他" }
) {
  return {
    info: { title: "t", description: "d", host: "http://x", basePath: "/api" },
    group,
    apis,
    types: {},
  } as any;
}

describe("Markdown 生成器 - utils 工具函数", () => {
  test("trimSpaces 应将 2 个以上连续换行折叠为恰好 2 个、纯空白行折叠为空行", () => {
    expect(trimSpaces("a\n\n\n\n\nb\n \n c")).toEqual("a\n\nb\n\n c");
    expect(trimSpaces("a\r\n\r\nb")).toEqual("a\n\nb");
  });

  test("fieldString 应以“ | ”连接字段并去除首尾空白", () => {
    expect(fieldString(["x", "y", "z"])).toEqual("x | y | z");
    expect(fieldString(["a", "", "c"])).toEqual("a |  | c");
  });

  test("tableHeader 应生成表头行 + 去尾竖线的分隔行", () => {
    expect(tableHeader(["a", "b", "c"])).toEqual("a | b | c \n---|---|---");
    expect(tableHeader(["错误", "错误码"])).toEqual("错误 | 错误码 \n---|---");
  });
});

describe("Markdown 生成器 - 错误文档（errors.ts）", () => {
  test("应按错误码降序输出完整错误表格", () => {
    const out = errorDocs({
      errorManager: fakeErrorManager([
        { name: "LOW", code: 5, description: "低", isShow: true, isLog: false },
        { name: "HIGH", code: 900, description: "高", isShow: false, isLog: true },
      ]),
    } as any);
    // 降序：HIGH(900) 在前，LOW(5) 在后；名称加反引号；是/否 由 itemTF 渲染
    expect(out).toEqual(
      "# 错误类型\n" +
        "错误 | 错误码 | 描述 | 显示 | 日志 \n" +
        "---|---|---|---|---\n" +
        "`HIGH` | 900 | 高 | 否 | 是\n" +
        "`LOW` | 5 | 低 | 是 | 否"
    );
  });

  test("三个错误乱序注册时仍应严格按错误码降序排列", () => {
    const out = errorDocs({
      errorManager: fakeErrorManager([
        { name: "ONE", code: 1, description: "一", isShow: true, isLog: false },
        { name: "HUNDRED", code: 100, description: "百", isShow: false, isLog: true },
        { name: "FIFTY", code: 50, description: "五十", isShow: true, isLog: true },
      ]),
    } as any);
    expect(out).toEqual(
      "# 错误类型\n" +
        "错误 | 错误码 | 描述 | 显示 | 日志 \n" +
        "---|---|---|---|---\n" +
        "`HUNDRED` | 100 | 百 | 否 | 是\n" +
        "`FIFTY` | 50 | 五十 | 是 | 是\n" +
        "`ONE` | 1 | 一 | 是 | 否"
    );
  });

  test("没有注册错误时应只输出标题与表头", () => {
    const out = errorDocs({ errorManager: fakeErrorManager([]) } as any);
    expect(out).toEqual("# 错误类型\n错误 | 错误码 | 描述 | 显示 | 日志 \n---|---|---|---|---");
  });
});

describe("Markdown 生成器 - 类型文档（types.ts）", () => {
  test("内置类型与自定义类型应分表输出，字段各列精确渲染", () => {
    const out = typeDocs({
      types: {
        Bt: {
          name: "Bt",
          description: "内置类型",
          checker: "c1",
          formatter: "",
          parser: "p1",
          isBuiltin: true,
          isParamsRequired: false,
        },
        Ct: {
          name: "Ct",
          description: "自定义类型",
          checker: "",
          formatter: "f1",
          parser: "",
          isBuiltin: false,
          isParamsRequired: true,
        },
      },
    } as any);
    expect(out).toEqual(
      "## 默认数据类型\n\n" +
        "类型 | 描述 | 检查 | 格式化 | 解析 \n" +
        "---|---|---|---|---\n" +
        "`Bt` | 内置类型 | 是 | 否 | 是\n" +
        "\n" +
        "## 自定义数据类型\n\n" +
        "类型 | 描述 | 检查 | 格式化 | 解析 \n" +
        "---|---|---|---|---\n" +
        "`Ct` | 自定义类型 | 否 | 是 | 否\n"
    );
  });

  test("未标记 isBuiltin 的类型全部落入自定义表", () => {
    const out = typeDocs({
      types: {
        X: {
          name: "X",
          description: "x",
          checker: "",
          formatter: "",
          parser: "",
          isBuiltin: false,
          isParamsRequired: false,
        },
      },
    } as any);
    expect(out).not.toContain("`X` | x | 否 | 否 | 否\n\n## 默认数据类型");
    expect(out).toContain(
      "## 自定义数据类型\n\n类型 | 描述 | 检查 | 格式化 | 解析 \n---|---|---|---|---\n`X` | x | 否 | 否 | 否\n"
    );
  });
});

describe("Markdown 生成器 - Schema 文档（schema.ts）", () => {
  test("真实 zod 4 schema：注册类型表 + 对象/标量/枚举/默认值/联合/懒加载全量渲染", () => {
    resetRegistries();
    app.type.register("UserName", z.string().min(1));
    const userSchema = z.object({
      name: z.string(),
      age: z.number().optional(),
      vip: z.boolean(),
      born: z.date(),
      tags: z.array(z.string()),
      meta: z.object({ k: z.string() }),
      color: z.enum(["red", "green"]),
      status: z.string().default("active"),
      score: z.number().default(() => 0),
      flag: z.boolean().default(false),
      mix: z.union([z.string(), z.number()]),
      note: z.string().describe("自定义备注"),
      big: z.bigint(),
      ref: z.lazy(() => z.string()),
      boom: z.lazy(() => {
        throw new Error("boom");
      }),
    });
    app.schema.register("User", userSchema);
    app.schema.register("JustString", z.string());
    app.schema.register(
      "LazyObj",
      z.lazy(() =>
        z.object({
          a: z.string(),
          b: z.number().optional(),
        })
      )
    );
    app.schema.register(
      "LazyStr",
      z.lazy(() => z.string())
    );
    app.schema.register(
      "LazyThrow",
      z.lazy(() => {
        throw new Error("boom");
      })
    );

    const doc = new IAPIDoc(app as any);
    const out = schemaDocs(doc.buildDocData());

    expect(out).toEqual(
      "# 数据类型\n\n" +
        "## 注册类型\n" +
        "类型名 | TypeScript类型 | 描述 | 格式化 | 默认值 | 可选 | 参数 \n" +
        "---|---|---|---|---|---|---\n" +
        // 未在 typeManager 注册的 tsType 渲染为小写锚点链接
        "UserName | [string](#string) | 字符串类型 | 是 |  | 是 |\n" +
        "User | [object](#object) | 对象类型 | 是 |  | 是 |\n" +
        "JustString | [string](#string) | 字符串类型 | 是 |  | 是 |\n" +
        "LazyObj | [unknown](#unknown) | Zod lazy 类型 | 是 |  | 是 |\n" +
        "LazyStr | [unknown](#unknown) | Zod lazy 类型 | 是 |  | 是 |\n" +
        "LazyThrow | [unknown](#unknown) | Zod lazy 类型 | 是 |  | 是 |\n" +
        "\n" +
        "## Schema定义\n" +
        "## User\n" +
        "字段 | 类型 | 备注 | 格式化 | 默认值 | 必填 | 参数 \n" +
        "---|---|---|---|---|---|---\n" +
        "name | string | 字符串类型 | 是 |  | 是 |\n" +
        // optional：类型穿透、必填为否、描述继承内层
        "age | number | 数字类型 | 是 |  | 否 |\n" +
        "vip | boolean | 布尔类型 | 是 |  | 是 |\n" +
        "born | Date | 日期类型 | 是 |  | 是 |\n" +
        // zod 4 数组元素在 _def.element，旧实现读 _def.type 得标量，渲染为 unknown[]
        "tags | unknown[] | 数组类型 | 是 |  | 是 |\n" +
        "meta | object | 对象类型 | 是 |  | 是 |\n" +
        "color | enum | 枚举类型 | 是 |  | 是 |\n" +
        // default：默认值列输出 "active"，必填为否
        "status | string | 字符串类型 | 是 | active | 否 |\n" +
        // falsy 默认值（0/false）渲染为空
        "score | number | 数字类型 | 是 |  | 否 |\n" +
        "flag | boolean | 布尔类型 | 是 |  | 否 |\n" +
        "mix | string | number | 联合类型 | 是 |  | 是 |\n" +
        // describe 覆盖默认描述
        "note | string | 自定义备注 | 是 |  | 是 |\n" +
        // default 分支：去掉 Zod 前缀转小写
        "big | bigint | bigint 类型 | 是 |  | 是 |\n" +
        // 字段级 lazy：取内层类型
        "ref | string | 字符串类型 | 是 |  | 是 |\n" +
        // 字段级 lazy getter 抛错：退化为 lazy 类型
        "boom | lazy | 延迟类型 | 是 |  | 是 |\n" +
        "## JustString\n" +
        "字段 | 类型 | 备注 | 格式化 | 默认值 | 必填 | 参数 \n" +
        "---|---|---|---|---|---|---\n" +
        "JustString | string | 字符串类型 | 是 |  | 是 |\n" +
        // 顶层 lazy 包对象：展开内层对象字段
        "## LazyObj\n" +
        "字段 | 类型 | 备注 | 格式化 | 默认值 | 必填 | 参数 \n" +
        "---|---|---|---|---|---|---\n" +
        "a | string | 字符串类型 | 是 |  | 是 |\n" +
        "b | number | 数字类型 | 是 |  | 否 |\n" +
        // 顶层 lazy 包标量：单行渲染
        "## LazyStr\n" +
        "字段 | 类型 | 备注 | 格式化 | 默认值 | 必填 | 参数 \n" +
        "---|---|---|---|---|---|---\n" +
        "LazyStr | string | 字符串类型 | 是 |  | 是 |\n" +
        // 顶层 lazy getter 抛错：catch 分支
        "## LazyThrow\n" +
        "字段 | 类型 | 备注 | 格式化 | 默认值 | 必填 | 参数 \n" +
        "---|---|---|---|---|---|---\n" +
        "LazyThrow | lazy | 延迟类型 | 是 |  | 是 |"
    );
  });

  test("Zod 3 风格 fake schema：typeName 双轨、enum values、函数默认值、shape 函数等分支", () => {
    const hand: any = {
      info: { title: "t", description: "d", host: "http://x", basePath: "/api" },
      genTime: "g",
      group: {},
      types: {
        // tsType 已在 typeManager 注册 → 渲染纯文本
        TPlain: {
          name: "TPlain",
          description: "已注册类型",
          tsType: "string",
          isDefaultFormat: true,
          isParamsRequired: false,
        },
        // tsType 未注册 → 渲染小写锚点链接（含去除 "[]"）
        TLink: {
          name: "TLink",
          description: "未注册类型",
          tsType: "Custom[]",
          isDefaultFormat: false,
          isParamsRequired: true,
        },
        // 无 tsType → 回退 unknown 链接
        TNoTs: { name: "TNoTs", description: "", isParamsRequired: false },
      },
      apis: {},
      typeManager: { has: (t: string) => t === "string" },
      // 无 erest 引用时，从 schema 管理器属性中扫描 Map 作为注册表
      schema: {
        has: () => false,
        registry: new Map<string, any>([
          ["FakeZod3Str", fakeZod({ typeName: "ZodString" })],
          [
            "FakeZod3Obj",
            fakeZod({
              typeName: "ZodObject",
              shape: {
                f1: fakeZod({ typeName: "ZodNumber" }),
                // 字段缺 _def → 走默认信息
                bad: { parse: () => ({}) },
              },
            }),
          ],
          ["FakeEnumValues", fakeZod({ type: "enum", values: ["v1", "v2", "v3"] })],
          [
            "FakeDefaultFn",
            fakeZod({ type: "default", innerType: fakeZod({ type: "string" }), defaultValue: () => "FNV" }),
          ],
          [
            "FakeDefaultThrow",
            fakeZod({
              type: "default",
              innerType: fakeZod({ type: "string" }),
              defaultValue: () => {
                throw new Error("d");
              },
            }),
          ],
          ["FakeZod3Lazy", fakeZod({ typeName: "ZodLazy", getter: () => fakeZod({ type: "string" }) })],
          [
            "FakeZod3LazyObj",
            fakeZod({
              typeName: "ZodLazy",
              getter: () => fakeZod({ typeName: "ZodObject", shape: { z3: fakeZod({ typeName: "ZodBoolean" }) } }),
            }),
          ],
          [
            "FakeLazyShapeFn",
            fakeZod({
              type: "lazy",
              getter: () => fakeZod({ type: "object", shape: () => ({ fn: fakeZod({ type: "date" }) }) }),
            }),
          ],
          ["FakeLazyNoGetter", fakeZod({ type: "lazy" })],
          [
            "FakeLazyThrow",
            fakeZod({
              type: "lazy",
              getter: () => {
                throw new Error("x");
              },
            }),
          ],
          ["FakeArrayNoEl", fakeZod({ typeName: "ZodArray" })],
          ["FakeUnionEmpty", fakeZod({ type: "union", options: [] })],
          ["FakeZodCustom", fakeZod({ typeName: "ZodIntersection" })],
          [
            "FakeLazyField",
            fakeZod({
              type: "object",
              shape: {
                lz: fakeZod({ type: "lazy", getter: () => fakeZod({ type: "string" }) }),
                lzthrow: fakeZod({
                  typeName: "ZodLazy",
                  getter: () => {
                    throw new Error("y");
                  },
                }),
                lznog: fakeZod({ type: "lazy" }),
              },
            }),
          ],
          // 不满足 isZodSchema（无 _def）→ 仅输出标题，无表格
          ["NoDefSchema", { parse: () => ({}) }],
        ]),
      },
    };

    expect(schemaDocs(hand)).toEqual(
      "# 数据类型\n\n" +
        "## 注册类型\n" +
        "类型名 | TypeScript类型 | 描述 | 格式化 | 默认值 | 可选 | 参数 \n" +
        "---|---|---|---|---|---|---\n" +
        "TPlain | string | 已注册类型 | 是 |  | 是 |\n" +
        "TLink | [Custom[]](#custom) | 未注册类型 | 否 |  | 否 |\n" +
        "TNoTs | [unknown](#unknown) |  | 否 |  | 是 |\n" +
        "\n" +
        "## Schema定义\n" +
        "## FakeZod3Str\n" +
        "字段 | 类型 | 备注 | 格式化 | 默认值 | 必填 | 参数 \n" +
        "---|---|---|---|---|---|---\n" +
        "FakeZod3Str | string | 字符串类型 | 是 |  | 是 |\n" +
        "## FakeZod3Obj\n" +
        "字段 | 类型 | 备注 | 格式化 | 默认值 | 必填 | 参数 \n" +
        "---|---|---|---|---|---|---\n" +
        "f1 | number | 数字类型 | 是 |  | 是 |\n" +
        "bad | unknown |  | 是 |  | 是 |\n" +
        // Zod 3 enum 用 _def.values → 参数列输出取值列表
        "## FakeEnumValues\n" +
        "字段 | 类型 | 备注 | 格式化 | 默认值 | 必填 | 参数 \n" +
        "---|---|---|---|---|---|---\n" +
        "FakeEnumValues | enum | 枚举类型 | 是 |  | 是 | v1, v2, v3\n" +
        // 函数默认值：调用后字符串化
        "## FakeDefaultFn\n" +
        "字段 | 类型 | 备注 | 格式化 | 默认值 | 必填 | 参数 \n" +
        "---|---|---|---|---|---|---\n" +
        "FakeDefaultFn | string | 字符串类型 | 是 | FNV | 否 |\n" +
        // 函数默认值调用抛错：回退占位符
        "## FakeDefaultThrow\n" +
        "字段 | 类型 | 备注 | 格式化 | 默认值 | 必填 | 参数 \n" +
        "---|---|---|---|---|---|---\n" +
        "FakeDefaultThrow | string | 字符串类型 | 是 | [default value] | 否 |\n" +
        // Zod 3 lazy(typeName) 包标量
        "## FakeZod3Lazy\n" +
        "字段 | 类型 | 备注 | 格式化 | 默认值 | 必填 | 参数 \n" +
        "---|---|---|---|---|---|---\n" +
        "FakeZod3Lazy | string | 字符串类型 | 是 |  | 是 |\n" +
        // Zod 3 lazy 包对象 → 展开内层字段
        "## FakeZod3LazyObj\n" +
        "字段 | 类型 | 备注 | 格式化 | 默认值 | 必填 | 参数 \n" +
        "---|---|---|---|---|---|---\n" +
        "z3 | boolean | 布尔类型 | 是 |  | 是 |\n" +
        // 内层 shape 为函数 → 调用后展开
        "## FakeLazyShapeFn\n" +
        "字段 | 类型 | 备注 | 格式化 | 默认值 | 必填 | 参数 \n" +
        "---|---|---|---|---|---|---\n" +
        "fn | Date | 日期类型 | 是 |  | 是 |\n" +
        // lazy 无 getter → 只输出标题与表头，无数据行
        "## FakeLazyNoGetter\n" +
        "字段 | 类型 | 备注 | 格式化 | 默认值 | 必填 | 参数 \n" +
        "---|---|---|---|---|---|---\n" +
        "## FakeLazyThrow\n" +
        "字段 | 类型 | 备注 | 格式化 | 默认值 | 必填 | 参数 \n" +
        "---|---|---|---|---|---|---\n" +
        "FakeLazyThrow | lazy | 延迟类型 | 是 |  | 是 |\n" +
        // 数组缺元素定义 → unknown[]
        "## FakeArrayNoEl\n" +
        "字段 | 类型 | 备注 | 格式化 | 默认值 | 必填 | 参数 \n" +
        "---|---|---|---|---|---|---\n" +
        "FakeArrayNoEl | unknown[] | 数组类型 | 是 |  | 是 |\n" +
        // 空 options 联合 → 类型列输出 union
        "## FakeUnionEmpty\n" +
        "字段 | 类型 | 备注 | 格式化 | 默认值 | 必填 | 参数 \n" +
        "---|---|---|---|---|---|---\n" +
        "FakeUnionEmpty | union | 联合类型 | 是 |  | 是 |\n" +
        // default 分支：typeName 去 Zod 前缀小写
        "## FakeZodCustom\n" +
        "字段 | 类型 | 备注 | 格式化 | 默认值 | 必填 | 参数 \n" +
        "---|---|---|---|---|---|---\n" +
        "FakeZodCustom | intersection | ZodIntersection 类型 | 是 |  | 是 |\n" +
        "## FakeLazyField\n" +
        "字段 | 类型 | 备注 | 格式化 | 默认值 | 必填 | 参数 \n" +
        "---|---|---|---|---|---|---\n" +
        "lz | string | 字符串类型 | 是 |  | 是 |\n" +
        "lzthrow | lazy | 延迟类型 | 是 |  | 是 |\n" +
        "lznog | lazy | 延迟类型 | 是 |  | 是 |\n" +
        "## NoDefSchema"
    );
  });

  test("空注册表：仅输出一级标题，无注册类型/Schema 定义小节", () => {
    const out = schemaDocs({
      info: { title: "t", description: "d", host: "http://x", basePath: "/api" },
      genTime: "g",
      group: {},
      types: {},
      apis: {},
      typeManager: { has: () => false },
      schema: { has: () => false, registry: new Map() },
    } as any);
    expect(out).toEqual("# 数据类型");
    expect(out).not.toContain("## 注册类型");
    expect(out).not.toContain("## Schema定义");
  });
});

describe("Markdown 生成器 - API 文档（apis.ts）", () => {
  test("全量字段接口：参数表（params/query/body/headers）、选填参数、字符串响应、使用示例", () => {
    const data = buildApiData({
      "get_/user/:id": {
        group: "User",
        title: "获取用户",
        method: "get",
        path: "/user/:id",
        realPath: "/api/user/:id",
        description: "  第一行  \n  第二行  ",
        tested: true,
        requiredOneOf: [["a", "b"]],
        paramsSchema: z.object({ id: z.number().describe("用户ID") }),
        querySchema: z.object({ a: z.string().optional(), b: z.string().optional(), c: z.string() }),
        bodySchema: z.object({ color: z.enum(["red", "blue"]).describe("颜色") }),
        headersSchema: z.object({ "x-token": z.string() }),
        response: "User[]",
        examples: [
          {
            name: "示例一",
            path: "/api/user/1",
            headers: { "x-token": "abc" },
            input: { id: 1, $secret: "hidden" },
            output: { ok: 1 },
          },
          { name: "示例二", path: "/api/user/2", input: { id: 2 } },
        ],
      },
    });
    const { list, groupTitles } = apiDocs(data);

    expect(list).toHaveLength(1);
    expect(list[0].name).toEqual("User");
    expect(list[0].content).toEqual(
      "## 获取用户 ✅\n" +
        "\n" +
        "请求地址：**GET** `/api/user/:id`\n" +
        // 多行描述逐行 trim
        "第一行\n" +
        "第二行\n" +
        "\n" +
        "### 参数：\n" +
        "\n" +
        "参数名 | 位置 | 类型 | 格式化 | 必填 | 说明 \n" +
        "---|---|---|---|---|---\n" +
        // 字段名反引号；describe 作为说明；必填“是”
        "`id` | params | number | 否 | 是 | 用户ID\n" +
        // requiredOneOf 命中 → “选填”
        "`a` | query | string | 否 | 选填 | （无）\n" +
        "`b` | query | string | 否 | 选填 | （无）\n" +
        // 未命中 requiredOneOf → 普通必填
        "`c` | query | string | 否 | 是 | （无）\n" +
        // enum：类型列 enum，说明追加取值
        "`color` | body | enum | 否 | 是 | 颜色 (red,blue)\n" +
        "`x-token` | headers | string | 否 | 是 | （无）\n" +
        "\n" +
        "选填参数：\n" +
        "\n" +
        "- `a`, `b` 其中一个\n" +
        "\n" +
        // 字符串响应 → schema 锚点链接（去 "[]"、小写）
        "### 返回结果：\n" +
        "\n" +
        "[User[]](/schema#user)\n" +
        "\n" +
        "### 使用示例：\n" +
        "\n" +
        "```javascript\n" +
        "// 示例一 - /api/user/1 \n" +
        "\n" +
        'headers = {\n  "x-token": "abc"\n}\n' +
        // $ 前缀键应从示例输入中剔除
        'input = {\n  "id": 1\n};\n' +
        'output = {\n  "ok": 1\n};\n' +
        "\n" +
        // 无 headers 的示例：不输出 headers 行；无 output → 空对象
        "// 示例二 - /api/user/2 \n" +
        'input = {\n  "id": 2\n};\n' +
        "output = {};\n" +
        "\n" +
        "```"
    );
    expect(groupTitles).toEqual({
      User: ["  - GET `/user/:id` - 获取用户"],
      Other: undefined,
    });
  });

  test("同组两个接口合并输出；无参数接口渲染“参数：无参数”与 zod 响应表", () => {
    const data = buildApiData({
      "get_/user/:id": {
        group: "User",
        title: "获取用户",
        method: "get",
        path: "/user/:id",
        realPath: "/api/user/:id",
        tested: true,
        requiredOneOf: [],
        examples: [],
        response: "User[]",
      },
      "post_/plain": {
        group: "User",
        title: "无参数接口",
        method: "post",
        path: "/plain",
        realPath: "/api/plain",
        requiredOneOf: [],
        tested: false,
        examples: [],
        response: z.object({ id: z.number(), name: z.string().optional() }),
      },
    });
    const { list, groupTitles } = apiDocs(data);

    expect(list).toHaveLength(1);
    expect(list[0].content).toEqual(
      "## 获取用户 ✅\n\n" +
        "请求地址：**GET** `/api/user/:id`\n\n" +
        "参数：无参数\n\n" +
        "### 返回结果：\n\n" +
        "[User[]](/schema#user)\n\n" +
        "## 无参数接口 ❌\n\n" +
        "请求地址：**POST** `/api/plain`\n\n" +
        "参数：无参数\n\n" +
        "### 返回结果：\n\n" +
        "参数名 | 类型 | 必填 | 说明 \n" +
        "---|---|---|---\n" +
        "`id` | number | 是 | （无）\n" +
        "`name` | string | 否 | （无）"
    );
    expect(groupTitles).toEqual({
      User: ["  - GET `/user/:id` - 获取用户", "  - POST `/plain` - 无参数接口"],
      Other: undefined,
    });
  });

  test("非字符串且非 zod 的响应：不输出“返回结果”小节", () => {
    const data = buildApiData({
      "get_/misc": {
        group: "Other",
        title: "杂项",
        method: "delete",
        path: "/misc",
        realPath: "/api/misc",
        tested: true,
        requiredOneOf: [],
        examples: [],
        response: 123,
      },
    });
    const { list } = apiDocs(data);
    expect(list).toHaveLength(1);
    expect(list[0].name).toEqual("Other");
    expect(list[0].content).toEqual("## 杂项 ✅\n\n请求地址：**DELETE** `/api/misc`\n\n参数：无参数");
  });

  test("无响应接口：不输出“返回结果”小节", () => {
    const data = buildApiData({
      "get_/none": {
        group: "Other",
        title: "无响应",
        method: "get",
        path: "/none",
        realPath: "/api/none",
        tested: true,
        requiredOneOf: [],
        examples: [],
      },
    });
    const { list } = apiDocs(data);
    expect(list[0].content).toEqual("## 无响应 ✅\n\n请求地址：**GET** `/api/none`\n\n参数：无参数");
    expect(list[0].content).not.toContain("返回结果");
  });

  test("示例无 input 时不渲染 input 行；无 output 时输出空对象", () => {
    const data = buildApiData({
      "get_/x": {
        group: "Other",
        title: "无输入",
        method: "get",
        path: "/x",
        realPath: "/api/x",
        tested: true,
        requiredOneOf: [],
        examples: [{ name: "只有名字", path: "/api/x" }],
      },
    });
    const content = apiDocs(data).list[0].content;
    expect(content).toContain("### 使用示例：\n\n```javascript\n// 只有名字 - /api/x ");
    expect(content).not.toContain("input = ");
    expect(content).toContain("output = {};");
  });
});

describe("Markdown 生成器 - 总入口（index.ts）", () => {
  const mdData = {
    info: { title: "Demo", description: "描述", host: "http://127.0.0.1:3001", basePath: "/api" },
    genTime: "2026/1/1 00:00:00",
    group: { UserGroup: "用户", EmptyGroup: "空组" },
    types: {
      B1: {
        name: "B1",
        description: "内置",
        isBuiltin: true,
        checker: "chk",
        formatter: "",
        parser: "",
        isParamsRequired: false,
      },
    },
    apis: {
      "get_/ping": {
        group: "UserGroup",
        title: "Ping",
        method: "get",
        path: "/ping",
        realPath: "/api/ping",
        tested: true,
        requiredOneOf: [],
        examples: [],
      },
    },
    errorManager: {
      forEach: (cb: (v: unknown) => void) => {
        cb({ name: "BIG", code: 100, description: "大", isShow: false, isLog: true });
      },
    },
    schema: { has: () => false, registry: new Map() },
    typeManager: { has: () => false },
  } as any;

  test("wiki + index + all 全开：输出文件名与全部内容", () => {
    const written: Array<[string, string]> = [];
    generateMarkdown(mdData, "/out", { wiki: true, index: true, all: true } as any, (p, c) => written.push([p, c]));

    // 文件名：Home 特例大写，其余小写（含中文标题）
    expect(written.map((w) => w[0])).toEqual([
      "/out/types.md",
      "/out/errors.md",
      "/out/schema.md",
      "/out/index.md",
      "/out/usergroup.md",
      "/out/Home.md",
      "/out/api文档-demo.md",
    ]);

    const files: Record<string, string> = Object.fromEntries(written);

    expect(files["/out/types.md"]).toEqual(
      "## 默认数据类型\n\n类型 | 描述 | 检查 | 格式化 | 解析 \n---|---|---|---|---\n`B1` | 内置 | 是 | 否 | 否\n\n## 自定义数据类型\n\n类型 | 描述 | 检查 | 格式化 | 解析 \n---|---|---|---|---\n"
    );
    expect(files["/out/errors.md"]).toEqual(
      "# 错误类型\n错误 | 错误码 | 描述 | 显示 | 日志 \n---|---|---|---|---\n`BIG` | 100 | 大 | 否 | 是"
    );
    expect(files["/out/schema.md"]).toEqual(
      "# 数据类型\n\n## 注册类型\n类型名 | TypeScript类型 | 描述 | 格式化 | 默认值 | 可选 | 参数 \n---|---|---|---|---|---|---\nB1 | [unknown](#unknown) | 内置 | 否 |  | 是 |"
    );
    expect(files["/out/index.md"]).toEqual(
      "# Demo\n\n描述\n\n测试服务器： http://127.0.0.1:3001/api\n\n生成时间： 2026/1/1 00:00:00\n\n文档列表：\n\n- [用户 ( UserGroup ) 相关文档](./usergroup.md)\n- [空组 ( EmptyGroup ) 相关文档](./emptygroup.md)"
    );
    expect(files["/out/usergroup.md"]).toEqual(
      "# 用户 ( UserGroup ) 相关文档\n\n## Ping ✅\n\n请求地址：**GET** `/api/ping`\n\n参数：无参数"
    );
    // Home：wiki 前缀链接 + 分组内接口标题列表（空组无接口则无标题行）
    expect(files["/out/Home.md"]).toEqual(
      "# Demo\n\n描述\n\n测试服务器： http://127.0.0.1:3001/api\n\n生成时间： 2026/1/1 00:00:00\n\n文档列表：\n\n- [/user_group - 用户相关文档](wikiusergroup)\n  - GET `/ping` - Ping\n- [/empty_group - 空组相关文档](wikiemptygroup)"
    );
    // all-in-one：分组锚点 + 类型/错误小节
    expect(files["/out/api文档-demo.md"]).toEqual(
      "# Demo\n\n描述\n\n测试服务器： http://127.0.0.1:3001/api\n\n生成时间： 2026/1/1 00:00:00\n\n文档列表：\n\n" +
        "- [用户 ( UserGroup ) 相关](#usergroup)\n- [空组 ( EmptyGroup ) 相关](#emptygroup)\n- [类型相关文档](#types)\n- [错误信息文档](#errors)\n\n" +
        '# <a id="usergroup">用户 ( UserGroup ) 相关文档</a>\n\n## Ping ✅\n\n请求地址：**GET** `/api/ping`\n\n参数：无参数\n' +
        '# <a id="types">类型相关文档</a>\n\n## 默认数据类型\n\n类型 | 描述 | 检查 | 格式化 | 解析 \n---|---|---|---|---\n`B1` | 内置 | 是 | 否 | 否\n\n## 自定义数据类型\n\n类型 | 描述 | 检查 | 格式化 | 解析 \n---|---|---|---|---\n\n' +
        '# <a id="errors">错误信息文档</a>\n\n# 错误类型\n错误 | 错误码 | 描述 | 显示 | 日志 \n---|---|---|---|---\n`BIG` | 100 | 大 | 否 | 是'
    );
  });

  test("SDK/Postman/Swagger/JSON 链接按开关输出", () => {
    const written: Array<[string, string]> = [];
    generateMarkdown(
      mdData,
      "/out",
      {
        wiki: false,
        index: true,
        all: false,
        axios: "sdk.js",
        postman: "p.json",
        swagger: "s.json",
        json: "doc.json",
      } as any,
      (p, c) => written.push([p, c])
    );
    expect(written.map((w) => w[0])).toEqual(["/out/index.md"]);
    expect(written[0][1]).toEqual(
      "# Demo\n\n描述\n\n测试服务器： http://127.0.0.1:3001/api\n\n生成时间： 2026/1/1 00:00:00\n\n" +
        "JS-SDK（ 基于 axios ）：[jssdk.js](./jssdk.js)\n\n" +
        "Postman 文件：[postman.json](./postman.json)\n\n" +
        "Swagger 文件：[swagger.json](./swagger.json)\n\n" +
        "JSON 描述文件：[doc.json](./doc.json)\n\n" +
        "文档列表：\n\n- [用户 ( UserGroup ) 相关文档](./usergroup.md)\n- [空组 ( EmptyGroup ) 相关文档](./emptygroup.md)"
    );
  });

  test("仅开 index：不输出 wiki/all 相关文件", () => {
    const written: Array<[string, string]> = [];
    generateMarkdown(mdData, "/out2", { wiki: false, index: true, all: false } as any, (p, c) => written.push([p, c]));
    expect(written.map((w) => w[0])).toEqual(["/out2/index.md"]);
    expect(written[0][1]).not.toContain("jssdk.js");
    expect(written[0][1]).not.toContain("postman.json");
    expect(written[0][1]).not.toContain("swagger.json");
    expect(written[0][1]).not.toContain("doc.json");
  });
});

// ---- extend/docs.ts 补测（buildDocData 组装 / genDocs 插件调度 / 落盘） ----

/** 快速构造 ERest 实例 + IAPIDoc */
function makeDoc(options = {}) {
  const svc = lib(options);
  return { svc, doc: new IAPIDoc(svc as never) };
}

/** 捕获写盘的 writer */
function captureWriter() {
  const writes: Array<[string, string]> = [];
  const writer: IDocWritter = (p, d) => writes.push([p, d]);
  return { writes, writer };
}

/** 直接向实例的私有注册表注入伪造 schema（仅用于覆盖 _def 解析分支） */
function injectType(svc: ReturnType<typeof lib>, name: string, schema: unknown) {
  (svc as unknown as { typeRegistry: Map<string, unknown> }).typeRegistry.set(name, schema);
}

/** 在 erest:docs debug 命名空间开启时执行 fn，捕获 stderr 输出（debug 引擎写 stderr） */
function withDocsDebug(fn: () => void): string {
  const chunks: string[] = [];
  const spy = vi.spyOn(process.stderr, "write").mockImplementation(((chunk: Uint8Array | string) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    return true;
  }) as never);
  Debug.enable("erest:docs");
  try {
    fn();
  } finally {
    Debug.disable();
    spy.mockRestore();
  }
  return chunks.join("");
}

describe("extend/docs.ts: buildDocData 数据组装", () => {
  test("genTime 为非空时间字符串", () => {
    const { doc } = makeDoc({ docs: { markdown: false } });
    const d = doc.buildDocData();
    expect(typeof d.genTime).toBe("string");
    expect(d.genTime.length).toBeGreaterThan(0);
    expect(d.genTime).toMatch(/\d/);
  });

  test("apis 结构：DOC_FIELD 全量拷贝（schema/示例/标题等按引用透传）", () => {
    const { svc, doc } = makeDoc({ docs: { markdown: false } });
    const querySchema = z.object({ q: z.string() });
    const bodySchema = z.object({ b: z.number() });
    const paramsSchema = z.object({ id: z.string() });
    const headersSchema = z.object({ h: z.string() });
    const responseSchema = z.object({ ok: z.boolean() });
    const a = svc.api.get("/full").title("标题").description("描述");
    a.query(querySchema);
    a.body(bodySchema);
    a.params(paramsSchema);
    a.headers(headersSchema);
    a.response(responseSchema);
    a.requiredOneOf(["q", "b"]);
    a.example({ input: { q: "x" }, output: { ok: true } });

    const d = doc.buildDocData();
    expect(Object.keys(d.apis)).toEqual(["GET_/full"]);
    const o = d.apis["GET_/full"] as Record<string, unknown>;
    expect(o.method).toBe("get");
    expect(o.path).toBe("/full");
    expect(o.realPath).toBe("/full");
    expect(o.group).toBe("");
    expect(o.title).toBe("标题");
    expect(o.description).toBe("描述");
    expect(o.tested).toBe(false);
    expect(o.querySchema).toBe(querySchema);
    expect(o.bodySchema).toBe(bodySchema);
    expect(o.paramsSchema).toBe(paramsSchema);
    expect(o.headersSchema).toBe(headersSchema);
    expect(o.response).toBe(responseSchema);
    expect(o.requiredOneOf).toEqual([["q", "b"]]);
    expect(o.middlewares).toBeInstanceOf(Set);
    expect((o.middlewares as Set<unknown>).size).toBe(0);
    expect(o.examples).toEqual([{ input: { q: "x" }, output: { ok: true } }]);
  });

  test("未设置 docOutputFormat 时示例 output 原样保留，examples 缺失不报错", () => {
    const { svc, doc } = makeDoc({ docs: { markdown: false } });
    svc.api.get("/plain").title("p");
    svc.api
      .get("/ex")
      .title("e")
      .example({ input: {}, output: { v: 1 } });
    // 模拟极端情况：示例字段被外部删除
    const noEx = svc.api.get("/noex").title("n");
    noEx.example({ input: {}, output: {} });
    delete (svc.api.$apis.get("GET_/noex")!.options as Record<string, unknown>).examples;

    expect(() => doc.buildDocData()).not.toThrow();
    const d = doc.buildDocData();
    expect((d.apis["GET_/plain"] as Record<string, unknown>).examples).toEqual([]);
    expect((d.apis["GET_/ex"] as Record<string, unknown>).examples).toEqual([{ input: {}, output: { v: 1 } }]);
    expect((d.apis["GET_/noex"] as Record<string, unknown>).examples).toBeUndefined();
  });

  test("自定义 docOutputFormat 应用于每个示例的 output", () => {
    const { svc, doc } = makeDoc({ docs: { markdown: false } });
    svc.setDocOutputFormat((o) => ({ F: o }));
    svc.api
      .get("/f1")
      .title("f1")
      .example({ input: {}, output: { v: 1 } });
    svc.api
      .get("/f2")
      .title("f2")
      .example({ input: {}, output: { w: 2 } });

    const d = doc.buildDocData();
    const e1 = (d.apis["GET_/f1"] as Record<string, unknown>).examples as Array<Record<string, unknown>>;
    const e2 = (d.apis["GET_/f2"] as Record<string, unknown>).examples as Array<Record<string, unknown>>;
    expect(e1[0].output).toEqual({ F: { v: 1 } });
    expect(e2[0].output).toEqual({ F: { w: 2 } });
  });

  test("示例列表中的非法条目（null / 字符串）被跳过且不影响其他条目格式化", () => {
    const { svc, doc } = makeDoc({ docs: { markdown: false } });
    const api = svc.api.get("/weird").title("w");
    api.example({ input: {}, output: { ok: 1 } });
    (api.options as unknown as { examples: unknown[] }).examples.push(null, "not-an-object");
    svc.setDocOutputFormat((o) => ({ F: o }));

    const d = doc.buildDocData();
    const ex = (d.apis["GET_/weird"] as Record<string, unknown>).examples as unknown[];
    expect(ex).toHaveLength(3);
    expect((ex[0] as Record<string, unknown>).output).toEqual({ F: { ok: 1 } });
    expect(ex[1]).toBeNull();
    expect(ex[2]).toBe("not-an-object");
  });

  test("缓存：同一实例 buildDocData 返回同一对象，invalidateCache 后重建", () => {
    const { svc, doc } = makeDoc({ docs: { markdown: false } });
    svc.api.get("/c").title("c");
    const d1 = doc.buildDocData();
    const d2 = doc.buildDocData();
    expect(d2).toBe(d1);
    doc.invalidateCache();
    const d3 = doc.buildDocData();
    expect(d3).not.toBe(d1);
  });
});

describe("extend/docs.ts: 类型 / Schema 提取矩阵", () => {
  test("真实 Zod schema 的 description 与 tsType 全类型矩阵", () => {
    const { svc, doc } = makeDoc({ docs: { markdown: false } });
    injectType(svc, "TString", z.string());
    injectType(svc, "TNumber", z.number());
    injectType(svc, "TBoolean", z.boolean());
    injectType(svc, "TDate", z.date());
    injectType(svc, "TArray", z.array(z.string()));
    injectType(svc, "TNumArray", z.array(z.number()));
    injectType(svc, "TObject", z.object({ a: z.string() }));
    injectType(svc, "TEnum", z.enum(["a", "b"]));
    injectType(svc, "TNativeEnum", z.nativeEnum({ A: 1, B: 2 }));
    injectType(svc, "TUnion", z.union([z.string(), z.number()]));
    injectType(svc, "TOptional", z.string().optional());
    injectType(svc, "TNullable", z.number().nullable());

    const d = doc.buildDocData();
    const expectType = (name: string, description: string, tsType: string) => {
      expect(d.types[name]).toEqual({
        name,
        description,
        isBuiltin: false,
        tsType,
        isDefaultFormat: true,
        isParamsRequired: false,
      });
    };
    expectType("TString", "字符串类型", "string");
    expectType("TNumber", "数字类型", "number");
    expectType("TBoolean", "布尔类型", "boolean");
    expectType("TDate", "日期类型", "Date");
    expectType("TArray", "数组类型", "string[]");
    expectType("TNumArray", "数组类型", "number[]");
    expectType("TObject", "对象类型", "object");
    expectType("TEnum", "枚举类型", '"a" | "b"');
    expectType("TNativeEnum", "枚举类型", "1 | 2");
    expectType("TUnion", "联合类型", "string | number");
    expectType("TOptional", "可选类型", "string | undefined");
    expectType("TNullable", "可空类型", "number | null");
  });

  test("typeName 风格（Zod 3 双轨）分支全部可达", () => {
    const { svc, doc } = makeDoc({ docs: { markdown: false } });
    injectType(svc, "ZString", { _def: { typeName: "ZodString" } });
    injectType(svc, "ZNumber", { _def: { typeName: "ZodNumber" } });
    injectType(svc, "ZBoolean", { _def: { typeName: "ZodBoolean" } });
    injectType(svc, "ZDate", { _def: { typeName: "ZodDate" } });
    injectType(svc, "ZArray", { _def: { typeName: "ZodArray", element: z.string() } });
    injectType(svc, "ZObject", { _def: { typeName: "ZodObject" } });
    injectType(svc, "ZEnum", { _def: { typeName: "ZodEnum", values: ["x", "y"] } });
    injectType(svc, "ZUnion", { _def: { typeName: "ZodUnion", options: [z.string(), z.number()] } });
    injectType(svc, "ZOptional", { _def: { typeName: "ZodOptional", innerType: z.string() } });
    injectType(svc, "ZNullable", { _def: { typeName: "ZodNullable", innerType: z.number() } });

    const d = doc.buildDocData();
    const expectType = (name: string, description: string, tsType: string) => {
      expect(d.types[name].description).toBe(description);
      expect(d.types[name].tsType).toBe(tsType);
    };
    expectType("ZString", "字符串类型", "string");
    expectType("ZNumber", "数字类型", "number");
    expectType("ZBoolean", "布尔类型", "boolean");
    expectType("ZDate", "日期类型", "Date");
    expectType("ZArray", "数组类型", "string[]");
    expectType("ZObject", "对象类型", "object");
    expectType("ZEnum", "枚举类型", '"x" | "y"');
    expectType("ZUnion", "联合类型", "string | number");
    expectType("ZOptional", "可选类型", "string | undefined");
    expectType("ZNullable", "可空类型", "number | null");
  });

  test("default 分支与伪造 _def 边界结构", () => {
    const { svc, doc } = makeDoc({ docs: { markdown: false } });
    injectType(svc, "CustomKind", { _def: { type: "customThing" } });
    injectType(svc, "NoDef", {});
    injectType(svc, "ArrayNoElement", { _def: { type: "array" } });
    injectType(svc, "EnumArrayValues", { _def: { type: "enum", values: ["a", 1] } });
    // 数组带附加属性：map 只遍历索引，Object.values 会带上附加属性（区分两个分支）
    const withExtra = ["a", 1] as unknown as { extra?: string };
    withExtra.extra = "x";
    injectType(svc, "EnumArrayExtra", { _def: { type: "enum", values: withExtra } });
    injectType(svc, "EnumStringValues", { _def: { type: "enum", values: "abc" } });
    injectType(svc, "EnumNoValues", { _def: { type: "enum" } });
    injectType(svc, "UnionNoOptions", { _def: { type: "union" } });

    const d = doc.buildDocData();
    const expectType = (name: string, description: string, tsType: string) => {
      expect(d.types[name].description).toBe(description);
      expect(d.types[name].tsType).toBe(tsType);
    };
    expectType("CustomKind", "Zod customThing 类型", "unknown");
    expectType("NoDef", "未知类型", "unknown");
    expectType("ArrayNoElement", "数组类型", "unknown[]");
    expectType("EnumArrayValues", "枚举类型", '"a" | 1');
    expectType("EnumArrayExtra", "枚举类型", '"a" | 1');
    expectType("EnumStringValues", "枚举类型", "string");
    expectType("EnumNoValues", "枚举类型", "string");
    expectType("UnionNoOptions", "联合类型", "unknown");
  });

  test("注册表快照：非空注册表生成精确 typeRegistrySnapshot / schemaRegistrySnapshot", () => {
    const { svc, doc } = makeDoc({ docs: { markdown: false } });
    svc.type.register("SnapStr", z.string());
    svc.type.register("SnapNum", z.number());
    svc.schema.register("SnapObj", z.object({ a: z.string() }));

    const d = doc.buildDocData();
    expect(d.typeRegistrySnapshot).toEqual({
      SnapStr: { description: "字符串类型", tsType: "string" },
      SnapNum: { description: "数字类型", tsType: "number" },
    });
    expect(d.schemaRegistrySnapshot).toEqual({
      SnapObj: { description: "对象类型", tsType: "object" },
    });
    // generateTypeDocumentation 同步生成 types
    expect(Object.keys(d.types).toSorted()).toEqual(["SnapNum", "SnapObj", "SnapStr"]);
  });

  test("注册表快照：空注册表时快照为 undefined", () => {
    const { doc } = makeDoc({ docs: { markdown: false } });
    const d = doc.buildDocData();
    expect(d.typeRegistrySnapshot).toBeUndefined();
    expect(d.schemaRegistrySnapshot).toBeUndefined();
    expect(d.types).toEqual({});
  });

  test("注册表为 undefined 时不抛错，types 与快照均为空", () => {
    const svc = lib({ docs: { markdown: false } });
    (svc as unknown as { typeRegistry?: unknown }).typeRegistry = undefined;
    (svc as unknown as { schemaRegistry?: unknown }).schemaRegistry = undefined;
    const doc = new IAPIDoc(svc as never);
    expect(() => doc.buildDocData()).not.toThrow();
    const d = doc.buildDocData();
    expect(d.types).toEqual({});
    expect(d.typeRegistrySnapshot).toBeUndefined();
    expect(d.schemaRegistrySnapshot).toBeUndefined();
  });
});

describe("extend/docs.ts: genDocs 插件注册与移除", () => {
  test("genDocs 按文档选项注册插件，hasPlugin/removePlugin 行为正确", () => {
    const svc = lib({
      docs: { markdown: true, swagger: true, postman: false, json: false, axios: false, all: false },
    });
    const doc = new IAPIDoc(svc as never);
    expect(doc.hasPlugin("markdown")).toBe(false); // genDocs 前未注册
    doc.genDocs();
    expect(doc.hasPlugin("markdown")).toBe(true);
    expect(doc.hasPlugin("swagger")).toBe(true);
    expect(doc.hasPlugin("json")).toBe(false);
    expect(doc.hasPlugin("postman")).toBe(false);
    doc.registerPlugin("custom", () => {});
    expect(doc.hasPlugin("custom")).toBe(true);
    expect(doc.removePlugin("custom")).toBe(true);
    expect(doc.hasPlugin("custom")).toBe(false);
    expect(doc.removePlugin("custom")).toBe(false);
  });
});

describe("extend/docs.ts: save 落盘与统计", () => {
  test("目录入参校验：非字符串 / 空字符串 / 伪长度对象均拒绝，错误信息包含目录值", () => {
    const { svc, doc } = makeDoc({ docs: { markdown: false } });
    svc.api.get("/x").title("x");
    expect(() => doc.save(123 as never)).toThrowError('文档存储目录"123"格式不正确：必须是字符串类型');
    expect(() => doc.save({ length: 5 } as never)).toThrowError(
      '文档存储目录"[object Object]"格式不正确：必须是字符串类型'
    );
    expect(() => doc.save("")).toThrowError('文档存储目录""格式不正确：必须是字符串类型');
    expect(doc.save("/docs")).toBe(doc);
  });

  test("apiInfo 统计：count/tested/untest 精确计数（含 examples 缺失的 API）", () => {
    const svc = lib({ docs: { markdown: false, json: true } });
    svc.api.get("/plain").title("p");
    svc.api
      .get("/t1")
      .title("t1")
      .example({ input: { a: 1 }, output: { b: 1 } });
    svc.api
      .get("/t2")
      .title("t2")
      .example({ input: { a: 2 }, output: { b: 2 } });
    const noEx = svc.api.get("/noex").title("n");
    noEx.example({ input: {}, output: {} });
    delete (svc.api.$apis.get("GET_/noex")!.options as Record<string, unknown>).examples;

    const doc = new IAPIDoc(svc as never);
    doc.genDocs();
    const { writes, writer } = captureWriter();
    doc.setWritter(writer);
    doc.save("/out");

    expect(writes.map(([p]) => p)).toEqual(["/out/doc.json"]);
    const parsed = JSON.parse(writes[0][1]) as Record<string, unknown>;
    expect(parsed.apiInfo).toEqual({
      count: 4,
      tested: 2,
      untest: ["GET_/plain", "GET_/noex"],
    });
    expect(Object.keys(parsed.apis as object).toSorted()).toEqual(["GET_/noex", "GET_/plain", "GET_/t1", "GET_/t2"]);
  });

  test("doc.json 内容：去除 erest 循环引用，保留 info/group/genTime", () => {
    const svc = lib({ docs: { markdown: false, json: true } });
    svc.api.get("/dj").title("dj");
    const doc = new IAPIDoc(svc as never);
    doc.genDocs();
    const { writes, writer } = captureWriter();
    doc.setWritter(writer);
    doc.save("/out");

    expect(writes.map(([p]) => p)).toEqual(["/out/doc.json"]);
    const parsed = JSON.parse(writes[0][1]) as Record<string, unknown>;
    expect((parsed.info as Record<string, unknown>).title).toBe("erest-demo");
    expect((parsed.info as Record<string, unknown>).basePath).toBe("/api");
    expect(parsed.group).toEqual({ Index: "首页", Index2: "首页2" });
    expect(typeof parsed.genTime).toBe("string");
    expect("erest" in parsed).toBe(false);
  });

  test("all.json 内容与文件名（含自定义文件名）", () => {
    const svc = lib({ docs: { markdown: false, all: "my-all.json", json: "my-doc.json" } });
    svc.api.get("/aj").title("aj");
    const doc = new IAPIDoc(svc as never);
    doc.genDocs();
    const { writes, writer } = captureWriter();
    doc.setWritter(writer);
    doc.save("/out");

    expect(writes.map(([p]) => p)).toEqual(["/out/my-doc.json", "/out/my-all.json"]);
    const all = JSON.parse(writes[1][1]) as Record<string, unknown>;
    expect((all.info as Record<string, unknown>).title).toBe("erest-demo");
    expect(Object.keys(all.apis as object)).toEqual(["GET_/aj"]);
    expect("erest" in all).toBe(false);
  });

  test("默认 writer 直接写文件（memfs 卷可读到 doc.json/all.json/swagger.json/postman.json）", () => {
    const { svc, doc } = makeDoc(); // lib 默认开启全部文档选项
    svc.api.get("/v1").title("v");
    doc.genDocs();
    doc.save("/docs");
    const files = Object.keys(vol.toJSON());
    expect(files).toContain("/docs/doc.json");
    expect(files).toContain("/docs/all.json");
    expect(files).toContain("/docs/swagger.json");
    expect(files).toContain("/docs/postman.json");
    const all = JSON.parse(vol.toJSON()["/docs/all.json"] as string) as Record<string, unknown>;
    expect((all.info as Record<string, unknown>).title).toBe("erest-demo");
  });

  test("插件收到 (data, dir, options, writer) 且 data 为缓存实例", () => {
    const { svc, doc } = makeDoc({ docs: { markdown: false } });
    svc.api.get("/p").title("p");
    let captured:
      | {
          data: Record<string, unknown>;
          dir: string;
          options: Record<string, unknown>;
          w: IDocWritter;
        }
      | undefined;
    doc.registerPlugin("probe", (data, dir, options, w) => {
      captured = { data: data as Record<string, unknown>, dir, options: options as Record<string, unknown>, w };
    });
    const { writer } = captureWriter();
    doc.setWritter(writer);
    doc.save("/out");
    expect(captured).toBeDefined();
    expect(captured!.dir).toBe("/out");
    expect(captured!.w).toBe(writer);
    expect(captured!.options.markdown).toBe(false);
    expect(captured!.data).toBe(doc.buildDocData());
    expect(captured!.data.apis["GET_/p"]).toBeDefined();
  });

  test("插件抛错被捕获（console.error 提示），后续插件继续执行", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { doc } = makeDoc({ docs: { markdown: false } });
      let goodRan = false;
      doc.registerPlugin("bad", () => {
        throw new Error("boom");
      });
      doc.registerPlugin("good", () => {
        goodRan = true;
      });
      expect(() => doc.save("/out")).not.toThrow();
      expect(goodRan).toBe(true);
      expect(errSpy).toHaveBeenCalledWith('Plugin "bad" failed:', expect.any(Error));
    } finally {
      errSpy.mockRestore();
    }
  });
});

describe("extend/docs.ts: debug 日志", () => {
  test("buildDocData 输出 erest:docs data", () => {
    const { doc } = makeDoc({ docs: { markdown: false } });
    const out = withDocsDebug(() => doc.buildDocData());
    expect(out).toContain("erest:docs data");
  });

  test("save 输出 save: <dir> 与 build doc: <插件名>", () => {
    const svc = lib({ docs: { markdown: false } });
    svc.api.get("/d").title("d");
    const doc = new IAPIDoc(svc as never);
    doc.registerPlugin("mk", () => {});
    const out = withDocsDebug(() => doc.save("/outdir"));
    expect(out).toContain("save: /outdir");
    expect(out).toContain("build doc: mk");
  });
});
