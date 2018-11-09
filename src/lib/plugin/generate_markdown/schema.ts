import { fieldString, itemTF, stringOrEmpty, tableHeader } from "./utils";
import { IDocData } from "../../extend/docs";
import { SchemaType, ISchemaTypeFields, ISchemaTypeFieldInfo } from "@tuzhanai/schema-manager";

export default function schemaDocs(data: IDocData) {
  const schemaList: string[] = [];
  schemaList.push("# 数据类型");
  data.schema.forEach(value => {
    schemaList.push(schemaInfo(value));
  });
  return schemaList.join("\n")
}

function typeString(name: string, item: ISchemaTypeFieldInfo) {
  return fieldString([
    stringOrEmpty(name),
    stringOrEmpty(typeof item.type ==="string" ? item.type: item.type.name),
    stringOrEmpty(item.comment),
    itemTF(item.format),
    stringOrEmpty(item.default),
    itemTF(item.required),
    stringOrEmpty(item.params),
  ]);
}

export interface ISchemaTypeFieldInfo {
  /** 数据类型 */
  type: string | SchemaType;
  /** 备注 */
  comment?: string;
  /** 是否格式化 */
  format?: boolean;
  /** 默认值 */
  default?: any;
  /** 是否必须 */
  required?: boolean;
  /** 类型参数 */
  params?: any;
}

function schemaInfo(schema: SchemaType): string {
  const res:string[] = []
  res.push(`## ${schema.name}`);
  const fields = (schema as any).fields as ISchemaTypeFields
  const tableHead = tableHeader(["字段", "类型", "备注", "格式化", "默认值", "必填", "参数"]);
  res.push(tableHead);
  for (const item of Object.keys(fields)) {
    res.push(typeString(item, fields[item]));
  }
  return res.join("\n");
}
