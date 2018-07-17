import { IDocData } from "../../extend/docs";
import { APIOption, IExample } from "../../api";
import { jsonStringify } from "../../utils";
import { fieldString, itemTF, itemTFEmoji, stringOrEmpty, tableHeader } from "./utils";

function paramsTable(item: APIOption<any>) {
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
      const comment =
        info.type === "ENUM" ? `${info.comment} (${info.params.join(",")})` : info.comment;
      paramsList.push(
        fieldString([
          stringOrEmpty(name, true),
          place,
          stringOrEmpty(info.type),
          itemTF(info.format),
          required,
          stringOrEmpty(comment),
        ])
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

function responseTable(apis: Record<string, APIOption<any>>) {
  const schemaList: string[] = [];
  schemaList.push(tableHeader(["参数名", "类型", "说明"]));
  for (const name in apis) {
    const info = apis[name];
    const comment =
      info.type === "ENUM" ? `${info.comment} (${info.params.join(",")})` : info.comment;
    schemaList.push(
      fieldString([stringOrEmpty(name, true), stringOrEmpty(info.type), stringOrEmpty(comment)])
    );
  }
  if (schemaList.length === 1) {
    return;
  }
  return schemaList.join("\n");
}

function formatExampleInput(inputData: Record<string, any>) {
  const ret = Object.assign({}, inputData);
  for (const name in ret) {
    if (name[0] === "$") delete ret[name];
  }
  return ret;
}

function examples(exampleList: IExample[]) {
  return exampleList
    .map(item => {
      const title = `// ${stringOrEmpty(item.name)} - ${item.path} `;
      const header = item.headers ? "\nheaders = " + jsonStringify(item.headers, 2) + "\n" : "";
      const input = item.input && `input = ${jsonStringify(formatExampleInput(item.input), 2)};`;
      const output = `output = ${jsonStringify(item.output!, 2)};`;
      return `${title}\n${header}${input}\n${output}`.trim();
    })
    .join("\n\n");
}

export default function schemaDocs(data: IDocData) {
  const group: Record<string, string[]> = {};
  const groupTitles: Record<string, string[]> = {};

  function add(name: string, content: string, title: string) {
    if (!Array.isArray(group[name])) {
      group[name] = [];
      groupTitles[name] = [];
    }
    group[name].push(content.trim());
    groupTitles[name].push(title);
  }

  for (const key of Object.keys(data.schemas)) {
    const item = data.schemas[key];
    const tested = itemTFEmoji(item.tested);
    const tit = stringOrEmpty(item.title);
    const method = item.method.toUpperCase();

    const line = [`## ${tit} ${tested}`];
    line.push(`\n请求地址：**${method}** \`${item.realPath}\``);

    if (item.description) {
      line.push(
        item.description
          .split("\n")
          .map((it: string) => it.trim())
          .join("\n")
      );
    }

    const paramsDoc = paramsTable(item);
    if (paramsDoc) {
      line.push("\n### 参数：\n\n" + paramsDoc);
    } else {
      line.push("\n参数：无参数");
    }

    const responseDoc = responseTable(item.response!);
    if (responseDoc) {
      line.push("\n### 输出结果说明：\n" + responseDoc);
    }

    if (item.examples.length > 0) {
      line.push("\n### 使用示例：\n");
      line.push("```javascript");
      line.push(examples(item.examples));
      line.push("\n```");
    }

    const title = `  - ${method} \`${item.path}\` - ${tit}`;
    add(item.group!, line.join("\n"), title);
  }

  const list: Array<{ name: string; content: string }> = [];
  for (const name in group) {
    list.push({
      name,
      content: group[name].join("\n\n"),
    });
  }

  return { list, groupTitles };
}
