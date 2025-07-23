import type { ISchemaTypeFieldInfo, ISchemaTypeFields, SchemaType } from "@tuzhanai/schema-manager";
import type { IDocData } from "../../extend/docs";
import { fieldString, itemTF, stringOrEmpty, tableHeader } from "./utils";

export default function schemaDocs(data: IDocData) {
  function parseType(type: string) {
    return !type || (data.typeManager as { has: (type: string) => boolean }).has(type)
      ? stringOrEmpty(type)
      : `[${type}](#${type.replace("[]", "").toLocaleLowerCase()})`;
  }

  function typeString(name: string, item: ISchemaTypeFieldInfo) {
    const typeInfo = typeof item.type === "string" ? item.type : item.type.name;
    const type = parseType(typeInfo);
    return fieldString([
      stringOrEmpty(name),
      type,
      stringOrEmpty(item.comment),
      itemTF(item.format),
      stringOrEmpty(item.default),
      itemTF(item.required),
      stringOrEmpty(item.params),
    ]);
  }

  function _schemaInfo(schema: SchemaType): string {
    const res: string[] = [];
    res.push(`## ${schema.name}`);
    const fields = (schema as unknown as { fields: ISchemaTypeFields }).fields;
    const tableHead = tableHeader(["字段", "类型", "备注", "格式化", "默认值", "必填", "参数"]);
    res.push(tableHead);
    for (const item of Object.keys(fields)) {
      res.push(typeString(item, fields[item]));
    }
    return res.join("\n");
  }

  const schemaList: string[] = [];
  schemaList.push("# 数据类型");
  // data.schema.forEach((value) => {
  // TODO: 需要根据新的 Zod 实现重新设计 schema 文档生成
  /*
    schemaList.push(schemaInfo(value));
  */
  // });
  return schemaList.join("\n");
}
