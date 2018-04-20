import { fieldString, itemTF, stringOrEmpty, tableHeader } from "./utils";

function errorString(item: any) {
  return fieldString([
    stringOrEmpty(item.name, true),
    item.code,
    stringOrEmpty(item.description),
    itemTF(item.isShow),
    itemTF(item.isLog),
  ]);
}

export default function errorDocs(data: any) {
  const errors: any[] = [];
  data.errors.forEach((value: any) => {
    errors.push(value);
  });

  errors.sort((a, b) => {
    return a.code - b.code;
  });

  const errorList: string[] = [];
  errorList.push("# 错误类型");
  errorList.push(tableHeader(["错误", "错误码", "描述", "显示", "日志"]));
  for (const item of errors) {
    errorList.push(errorString(item));
  }
  return errorList.join("\n");
}
