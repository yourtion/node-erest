import type { ZodType } from "zod";
import type { IDocData, IDocTypes } from "../../extend/docs";
import { isZodSchema } from "../../params";
import { fieldString, itemTF, stringOrEmpty, tableHeader } from "./utils";

export default function schemaDocs(data: IDocData) {
  function _parseType(type: string) {
    return !type || (data.typeManager as { has: (type: string) => boolean }).has(type)
      ? stringOrEmpty(type)
      : `[${type}](#${type.replace("[]", "").toLocaleLowerCase()})`;
  }

  function typeDocString(typeDoc: IDocTypes) {
    return fieldString([
      stringOrEmpty(typeDoc.name),
      _parseType(typeDoc.tsType || "unknown"),
      stringOrEmpty(typeDoc.description),
      itemTF(typeDoc.isDefaultFormat),
      stringOrEmpty(""), // 默认值暂时为空
      itemTF(!typeDoc.isParamsRequired), // 非必填参数表示可选
      stringOrEmpty(""), // 参数暂时为空
    ]);
  }

  function generateZodSchemaInfo(schemaName: string, zodSchema: ZodType): string {
    const res: string[] = [];
    res.push(`## ${schemaName}`);

    if (isZodSchema(zodSchema) && zodSchema._def) {
      const tableHead = tableHeader(["字段", "类型", "备注", "格式化", "默认值", "必填", "参数"]);
      res.push(tableHead);

      const typeName =
        (zodSchema as ZodType & { _def: { typeName?: string; type?: string; shape?: Record<string, ZodType> } })._def
          .typeName ||
        (zodSchema as ZodType & { _def: { typeName?: string; type?: string; shape?: Record<string, ZodType> } })._def
          .type;
      // 处理lazy类型
      const typeValue = (zodSchema._def as { type?: string }).type;
      if (typeName === "ZodLazy" || typeName === "lazy" || typeValue === "lazy") {
        const getter = (zodSchema._def as unknown as { getter?: () => ZodType }).getter;
        if (getter) {
          try {
            const innerSchema = getter();
            const innerTypeName =
              (innerSchema._def as { typeName?: string; type?: string }).typeName ||
              (innerSchema._def as { typeName?: string; type?: string }).type;
            if (
              (innerTypeName === "ZodObject" || innerTypeName === "object") &&
              (innerSchema as ZodType & { _def: { shape?: Record<string, ZodType> | (() => Record<string, ZodType>) } })
                ._def.shape
            ) {
              let shape = (
                innerSchema as ZodType & { _def: { shape: Record<string, ZodType> | (() => Record<string, ZodType>) } }
              )._def.shape;
              // 如果shape是函数，调用它获取实际的shape
              if (typeof shape === "function") {
                shape = shape();
              }
              for (const [fieldName, fieldSchema] of Object.entries(shape as Record<string, ZodType>)) {
                const fieldInfo = extractZodFieldInfo(fieldName, fieldSchema);
                res.push(
                  fieldString([
                    stringOrEmpty(fieldName),
                    stringOrEmpty(fieldInfo.type),
                    stringOrEmpty(fieldInfo.description),
                    itemTF(true),
                    stringOrEmpty(fieldInfo.defaultValue),
                    itemTF(fieldInfo.required),
                    stringOrEmpty(fieldInfo.params),
                  ])
                );
              }
            } else {
              // 非对象的lazy类型
              const fieldInfo = extractZodFieldInfo(schemaName, innerSchema);
              res.push(
                fieldString([
                  stringOrEmpty(schemaName),
                  stringOrEmpty(fieldInfo.type),
                  stringOrEmpty(fieldInfo.description),
                  itemTF(true),
                  stringOrEmpty(fieldInfo.defaultValue),
                  itemTF(fieldInfo.required),
                  stringOrEmpty(fieldInfo.params),
                ])
              );
            }
          } catch (_e) {
            // 如果无法解析lazy类型，显示为lazy类型
            const fieldInfo = extractZodFieldInfo(schemaName, zodSchema);
            res.push(
              fieldString([
                stringOrEmpty(schemaName),
                stringOrEmpty(fieldInfo.type),
                stringOrEmpty(fieldInfo.description),
                itemTF(true),
                stringOrEmpty(fieldInfo.defaultValue),
                itemTF(fieldInfo.required),
                stringOrEmpty(fieldInfo.params),
              ])
            );
          }
        }
      } else if (
        (typeName === "ZodObject" || typeName === "object") &&
        (zodSchema as ZodType & { _def: { shape?: Record<string, ZodType> } })._def.shape
      ) {
        const shape = (zodSchema as ZodType & { _def: { shape: Record<string, ZodType> } })._def.shape;
        for (const [fieldName, fieldSchema] of Object.entries(shape)) {
          const fieldInfo = extractZodFieldInfo(fieldName, fieldSchema);
          res.push(
            fieldString([
              stringOrEmpty(fieldName),
              stringOrEmpty(fieldInfo.type),
              stringOrEmpty(fieldInfo.description),
              itemTF(true), // 默认格式化
              stringOrEmpty(fieldInfo.defaultValue),
              itemTF(fieldInfo.required),
              stringOrEmpty(fieldInfo.params),
            ])
          );
        }
      } else {
        // 非对象类型的schema
        const fieldInfo = extractZodFieldInfo(schemaName, zodSchema);
        res.push(
          fieldString([
            stringOrEmpty(schemaName),
            stringOrEmpty(fieldInfo.type),
            stringOrEmpty(fieldInfo.description),
            itemTF(true),
            stringOrEmpty(fieldInfo.defaultValue),
            itemTF(fieldInfo.required),
            stringOrEmpty(fieldInfo.params),
          ])
        );
      }
    }

    return res.join("\n");
  }

  function extractZodFieldInfo(fieldName: string, zodSchema: ZodType) {
    const info = {
      type: "unknown",
      description: "",
      required: true,
      defaultValue: "",
      params: "",
    };

    if (!zodSchema || !zodSchema._def) {
      return info;
    }

    // 首先尝试获取describe信息
    const zodSchemaWithDescription = zodSchema as ZodType & { description?: string };
    if (zodSchemaWithDescription.description) {
      info.description = zodSchemaWithDescription.description;
    }

    const typeName =
      (zodSchema._def as { typeName?: string; type?: string }).typeName ||
      (zodSchema._def as { typeName?: string; type?: string }).type;

    const typeValue = (zodSchema.def as { type?: string }).type;
    switch (typeName) {
      case "ZodString":
      case "string":
        info.type = "string";
        if (!info.description) info.description = "字符串类型";
        break;
      case "ZodNumber":
      case "number":
        info.type = "number";
        if (!info.description) info.description = "数字类型";
        break;
      case "ZodBoolean":
      case "boolean":
        info.type = "boolean";
        if (!info.description) info.description = "布尔类型";
        break;
      case "ZodDate":
      case "date":
        info.type = "Date";
        if (!info.description) info.description = "日期类型";
        break;
      case "ZodArray":
      case "array": {
        const typeField = (zodSchema._def as unknown as { type?: ZodType }).type;
        const innerType = typeField ? extractZodFieldInfo("", typeField) : { type: "unknown" };
        info.type = `${innerType.type}[]`;
        if (!info.description) info.description = "数组类型";
        break;
      }
      case "ZodObject":
      case "object":
        info.type = "object";
        if (!info.description) info.description = "对象类型";
        break;
      case "ZodEnum":
      case "enum":
        info.type = "enum";
        if (!info.description) info.description = "枚举类型";
        if ((zodSchema._def as { values?: unknown }).values) {
          const values = (zodSchema._def as unknown as { values: unknown }).values;
          info.params = Array.isArray(values) ? values.join(", ") : String(values);
        }
        break;
      case "ZodOptional":
      case "optional": {
        const innerInfo = extractZodFieldInfo(
          fieldName,
          (zodSchema._def as unknown as { innerType: ZodType }).innerType
        );
        info.type = innerInfo.type;
        info.description = info.description || innerInfo.description;
        info.required = false;
        info.params = innerInfo.params;
        break;
      }
      case "ZodDefault":
      case "default": {
        const defaultInnerInfo = extractZodFieldInfo(
          fieldName,
          (zodSchema._def as unknown as { innerType: ZodType }).innerType
        );
        info.type = defaultInnerInfo.type;
        info.description = info.description || defaultInnerInfo.description;
        info.required = false;
        const defValue = (zodSchema._def as { defaultValue?: unknown }).defaultValue;
        if (typeof defValue === "function") {
          try {
            info.defaultValue = String(defValue());
          } catch (_e) {
            info.defaultValue = "[default value]";
          }
        } else {
          info.defaultValue = String(defValue || "");
        }
        info.params = defaultInnerInfo.params;
        break;
      }
      case "ZodUnion":
      case "union": {
        const options = (zodSchema._def as unknown as { options: ZodType[] }).options;
        if (options && options.length > 0) {
          const types = options.map((opt) => extractZodFieldInfo("", opt).type);
          info.type = types.join(" | ");
        } else {
          info.type = "union";
        }
        if (!info.description) info.description = "联合类型";
        break;
      }
      case "ZodLazy":
      case "lazy": {
        // 检查是否为lazy类型
        if (typeValue === "lazy" || typeName === "ZodLazy" || typeName === "lazy") {
          // 对于lazy类型，尝试获取内部的getter函数返回的schema
          const getter = (zodSchema.def as unknown as { getter?: () => ZodType }).getter;
          if (getter) {
            try {
              const innerSchema = getter();
              const innerInfo = extractZodFieldInfo(fieldName, innerSchema);
              info.type = innerInfo.type;
              info.description = info.description || innerInfo.description;
              info.params = innerInfo.params;
            } catch (_e) {
              info.type = "lazy";
              if (!info.description) info.description = "延迟类型";
            }
          } else {
            info.type = "lazy";
            if (!info.description) info.description = "延迟类型";
          }
        }
        break;
      }
      default:
        info.type = typeName ? typeName.replace("Zod", "").toLowerCase() : "unknown";
        if (!info.description) info.description = `${typeName} 类型`;
    }

    return info;
  }

  const schemaList: string[] = [];
  schemaList.push("# 数据类型");

  // 生成注册的类型文档
  if (data.types && Object.keys(data.types).length > 0) {
    schemaList.push("\n## 注册类型");
    const tableHead = tableHeader(["类型名", "TypeScript类型", "描述", "格式化", "默认值", "可选", "参数"]);
    schemaList.push(tableHead);

    for (const typeDoc of Object.values(data.types)) {
      schemaList.push(typeDocString(typeDoc));
    }
  }

  // 生成Schema文档
  const schemaManager = data.schema as { get?: (name: string) => ZodType | undefined; has?: (name: string) => boolean };
  if (schemaManager) {
    // 从erest实例中获取schemaRegistry
    let schemaRegistry: Map<string, ZodType> | null = null;

    if (data.erest && (data.erest as { schemaRegistry?: Map<string, ZodType> }).schemaRegistry instanceof Map) {
      schemaRegistry = (data.erest as { schemaRegistry: Map<string, ZodType> }).schemaRegistry;
    } else {
      // 尝试从schemaManager的属性中找到Map实例
      for (const prop in schemaManager) {
        if ((schemaManager as Record<string, unknown>)[prop] instanceof Map) {
          schemaRegistry = (schemaManager as Record<string, Map<string, ZodType>>)[prop];
          break;
        }
      }
    }

    if (schemaRegistry instanceof Map && schemaRegistry.size > 0) {
      schemaList.push("\n## Schema定义");
      for (const [schemaName, zodSchema] of schemaRegistry.entries()) {
        schemaList.push(generateZodSchemaInfo(schemaName, zodSchema));
      }
    }
  }

  return schemaList.join("\n");
}
