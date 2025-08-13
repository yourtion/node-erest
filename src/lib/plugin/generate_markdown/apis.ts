import { IDocData } from "../../extend/docs";
import { APIOption, IExample, TYPE_RESPONSE } from "../../api";
import { jsonStringify } from "../../utils";
import { fieldString, itemTF, itemTFEmoji, stringOrEmpty, tableHeader } from "./utils";
import { SchemaType } from "@tuzhanai/schema-manager";
import { ISchemaType } from "../../params";

export default function apiDocs(data: IDocData) {
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

  function parseType(type: string) {
    return !type || data.typeManager.has(type)
      ? stringOrEmpty(type)
      : `[${type}](/schema#${type.replace("[]", "").toLocaleLowerCase()})`;
  }

  function paramsTable(item: APIOption<any>) {
    const paramsList: string[] = [];
    paramsList.push(tableHeader(["参数名", "位置", "类型", "格式化", "必填", "说明"]));
    // 参数输出
    for (const place of ["params", "query", "body", "headers"]) {
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
        const comment = info.type === "ENUM" ? `${info.comment} (${info.params.join(",")})` : info.comment;
        const type = parseType(info.type);
        paramsList.push(
          fieldString([stringOrEmpty(name, true), place, type, itemTF(info.format), required, stringOrEmpty(comment)])
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

  function responseTable(response?: TYPE_RESPONSE) {
    if (!response) return;
    if (typeof response === "string") {
      return `[${response}](/schema#${response.replace("[]", "").toLocaleLowerCase()})`;
    }
    // FIXME: 处理更多返回类型
    if (response instanceof SchemaType || typeof response.type === "string") return;
    const paramsList: string[] = [];
    paramsList.push(tableHeader(["参数名", "类型", "必填", "说明"]));
    // 参数输出
    for (const name in response) {
      const info = (response as Record<string, ISchemaType>)[name];
      const comment = info.type === "ENUM" ? `${info.comment} (${info.params.join(",")})` : info.comment;
      const type = parseType(info.type);
      paramsList.push(fieldString([stringOrEmpty(name, true), type, itemTF(info.required), stringOrEmpty(comment)]));
    }

    // 没有参数
    if (paramsList.length === 1) return;

    return paramsList.join("\n");
  }

  function formatExampleInput(inputData: Record<string, any>) {
    const ret = Object.assign({}, inputData);
    for (const name in ret) {
      if (name[0] === "$") delete ret[name];
    }
    return ret;
  }

  function formatExample(str: string, data: Record<string, any>) {
    return str
      .split("\n")
      .map((s) => {
        const r = s.match(/"(.*)"\:/);
        if (r && r[1] && data[r[1]] && data[r[1]].comment) {
          return s + " \t// " + data[r[1]].comment;
        }
        return s;
      })
      .join("\n");
  }

  function examples(exampleList: IExample[], response?: SchemaType | ISchemaType) {
    return exampleList
      .map((item) => {
        const title = `// ${stringOrEmpty(item.name)} - ${item.path} `;
        const header = item.headers ? "\nheaders = " + jsonStringify(item.headers, 2) + "\n" : "";
        const input = item.input && `input = ${jsonStringify(formatExampleInput(item.input), 2)};`;
        let outString = jsonStringify(item.output!, 2);
        // FIXME: 处理更多返回类型
        if (response && (response as any).fields) {
          outString = formatExample(outString, (response as any).fields);
        }
        const output = `output = ${outString};`;
        return `${title}\n${header}${input}\n${output}`.trim();
      })
      .join("\n\n");
  }

  for (const item of Object.values(data.apis)) {
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

    const responseDoc = responseTable(item.response);
    if (responseDoc) {
      line.push("\n### 返回结果：\n\n" + responseDoc);
    }

    if (item.examples.length > 0) {
      line.push("\n### 使用示例：\n");
      line.push("```javascript");
      line.push(examples(item.examples, item.responseSchema));
      line.push("\n```");
    }

    const title = `  - ${method} \`${item.path}\` - ${tit}`;
    add(item.group, line.join("\n"), title);
  }

  const list: Array<{ name: string; content: string }> = [];
  for (const [name, g] of Object.entries(group)) {
    list.push({ name, content: g.join("\n\n") });
  }

  return { list, groupTitles };
}
