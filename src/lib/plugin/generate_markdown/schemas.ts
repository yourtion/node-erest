import { IDocData } from "../../extend/docs";
import { IKVObject } from "../../interfaces";
import { ISchemaOption } from "../../schema";
import { jsonStringify } from "../../utils";
import { fieldString, itemTF, itemTFEmoji, stringOrEmpty, tableHeader } from "./utils";

function paramsTable(item: IKVObject) {
  const paramsList: string[] = [];
  paramsList.push(tableHeader(["参数名", "位置", "类型", "格式化", "必填", "说明"]));
  // 参数输出
  for (const place of ["params", "query", "body"]) {
    for (const name in item[place]) {
      const info = item[place][name];
      let required = item.required.has(name) ? "是" : "否";
      if (required !== "是") {
        for (const names of item.requiredOneOf) {
          if (names.indexOf(name) !== -1) {
            required = "选填";
            break;
          }
        }
      }
      paramsList.push(
        fieldString([
          stringOrEmpty(name, true),
          place,
          stringOrEmpty(info.type),
          itemTF(info.format),
          required,
          stringOrEmpty(info.comment),
        ]),
      );
    }
  }
  // 选填参数输出
  if (item.requiredOneOf.length > 0) {
    paramsList.push("\n选填参数：\n");
    for (const names of item.requiredOneOf) {
      paramsList.push(`- \`${names.join("`, `")}\` 其中一个`);
    }
  }
  // 没有参数
  if (paramsList.length === 1) {
    return;
  }
  return paramsList.join("\n");
}

function schemaTable(item: IKVObject<ISchemaOption<any, any>>) {
  const schemaList: string[] = [];
  schemaList.push(tableHeader(["参数名", "类型", "说明"]));
  for (const name in item) {
    const info = item[name];
    schemaList.push(
      fieldString([
        stringOrEmpty(name, true),
        stringOrEmpty(info.type),
        stringOrEmpty(info.comment),
      ]),
    );
  }
  if (schemaList.length === 1) {
    return;
  }
  return schemaList.join("\n");
}

function formatExampleInput(inputData: IKVObject) {
  const ret = Object.assign({}, inputData);
  for (const name in ret) {
    if (name[0] === "$") {
      delete ret[name];
    }
  }
  return ret;
}

function examples(exampleList: any[]) {
  return exampleList
    .map((item) => {
      const title = `// ${stringOrEmpty(item.name)} - ${item.path} `;
      const header = item.headers ? "\nheaders = " + jsonStringify(item.headers, 2) : "";
      const input = `input = ${jsonStringify(formatExampleInput(item.input), 2)};`;
      const output = `output = ${jsonStringify(item.output, 2)};`;
      return `${title}\n${header}\n${input}\n${output}`.trim();
    })
    .join("\n\n");
}

export default function schemaDocs(data: IDocData) {
  const group: IKVObject = {};

  function add(name: string, content: string) {
    if (!Array.isArray(group[name])) {
      group[name] = [];
    }
    group[name].push(content.trim());
  }

  for (const key of Object.keys(data.schemas)) {
    const item = data.schemas[key];

    const line = [
      `## ${key.replace("_", " ")} ${stringOrEmpty(item.title)} ${itemTFEmoji(item.tested)}`,
    ];
    line.push(`\n请求地址：**${item.method.toUpperCase()}** \`${item.path}\``);

    if (item.description) {
      line.push(
        item.description
          .split("\n")
          .map((it: string) => it.trim())
          .join("\n"),
      );
    }

    const paramsDoc = paramsTable(item);
    if (paramsDoc) {
      line.push("\n### 参数：\n\n" + paramsDoc);
    } else {
      line.push("\n参数：无参数");
    }

    const schemaDoc = schemaTable(item.schemas);
    if (schemaDoc) {
      line.push("\n### 输出结果说明：\n" + schemaDoc);
    }

    if (item.examples.length > 0) {
      line.push("\n### 使用示例：\n");
      line.push("```javascript");
      line.push(examples(item.examples));
      line.push("\n```");
    }

    add(item.group!, line.join("\n"));
  }

  const list: Array<{ name: string; content: string }> = [];
  for (const name in group) {
    list.push({
      name,
      content: group[name].join("\n\n"),
    });
  }

  return list;
}
