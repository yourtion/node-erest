import type { IDocData } from "../../extend/docs.js";
import type { IError } from "../../manager/index.js";
import { fieldString, itemTF, stringOrEmpty, tableHeader } from "./utils.js";

function errorString(item: IError) {
  return fieldString([
    stringOrEmpty(item.name, true),
    String(item.code),
    stringOrEmpty(item.description),
    itemTF(item.isShow),
    itemTF(item.isLog),
  ]);
}

export default function errorDocs(data: IDocData) {
  const errors: IError[] = [];
  data.errorManager.forEach((value: IError) => {
    errors.push(value);
  });

  errors.sort((a, b) => {
    return b.code - a.code;
  });

  const errorList: string[] = [];
  errorList.push("# 错误类型");
  errorList.push(tableHeader(["错误", "错误码", "描述", "显示", "日志"]));
  for (const item of errors) {
    errorList.push(errorString(item));
  }
  return errorList.join("\n");
}
