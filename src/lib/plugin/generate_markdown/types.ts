import { IDocData, IDocTypes } from "../../extend/docs";
import { fieldString, itemTF, stringOrEmpty, tableHeader } from "./utils";

function typeString(item: IDocTypes) {
  return fieldString([
    stringOrEmpty(item.name, true),
    stringOrEmpty(item.description),
    itemTF(item.checker),
    itemTF(item.formatter),
    itemTF(item.parser),
  ]);
}

export default function typeDocs(data: IDocData) {
  const defaultTypes: IDocTypes[] = [];
  const customTypes: IDocTypes[] = [];

  for (const info of Object.values(data.types)) {
    if (info.isBuiltin) {
      defaultTypes.push(info);
    } else {
      customTypes.push(info);
    }
  }

  defaultTypes.sort();
  customTypes.sort();

  const typeList: string[] = [];

  const tableHead = tableHeader(["类型", "描述", "检查", "格式化", "解析"]);

  typeList.push("## 默认数据类型\n");
  typeList.push(tableHead);
  for (const item of defaultTypes) {
    typeList.push(typeString(item));
  }

  typeList.push("");

  typeList.push("## 自定义数据类型\n");
  typeList.push(tableHead);
  for (const item of customTypes) {
    typeList.push(typeString(item));
  }
  return typeList.join("\n") + "\n";
}
