import type { APIOption, IExample, TYPE_RESPONSE } from "../../api.js";
import type { IDocData } from "../../extend/docs.js";
import { isZodSchema, type SchemaType } from "../../params.js";
import { extractDocFields } from "../zod-meta.js";
import { jsonStringify } from "../../utils.js";
import { fieldString, itemTF, itemTFEmoji, stringOrEmpty, tableHeader } from "./utils.js";

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

  function paramsTable(item: APIOption<unknown>) {
    const paramsList: string[] = [];
    paramsList.push(tableHeader(["参数名", "位置", "类型", "格式化", "必填", "说明"]));

    // Stage 1：从预编译的 Zod schema 提取字段（paramsSchema/querySchema/bodySchema/headersSchema）
    const fields = [
      ...extractDocFields(item.paramsSchema, "params"),
      ...extractDocFields(item.querySchema, "query"),
      ...extractDocFields(item.bodySchema, "body"),
      ...extractDocFields(item.headersSchema, "headers"),
    ];

    for (const f of fields) {
      let required = f.required ? "是" : "否";
      if (required !== "是") {
        for (const names of item.requiredOneOf) {
          if (names.indexOf(f.name) !== -1) {
            required = "选填";
            break;
          }
        }
      }
      const comment = f.enumValues ? `${f.comment ?? ""} (${f.enumValues.join(",")})` : f.comment;
      const type = f.enumValues ? `enum` : f.type;
      paramsList.push(
        fieldString([stringOrEmpty(f.name, true), f.place, type, itemTF(undefined), required, stringOrEmpty(comment)])
      );
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
    // Stage 1：response 只支持 string 或 Zod schema
    if (!isZodSchema(response)) return;
    const fields = extractDocFields(response, "body");
    if (fields.length === 0) return;
    const paramsList: string[] = [];
    paramsList.push(tableHeader(["参数名", "类型", "必填", "说明"]));
    for (const f of fields) {
      const comment = f.enumValues ? `${f.comment ?? ""} (${f.enumValues.join(",")})` : f.comment;
      paramsList.push(fieldString([stringOrEmpty(f.name, true), f.type, itemTF(f.required), stringOrEmpty(comment)]));
    }
    if (paramsList.length === 1) return;
    return paramsList.join("\n");
  }

  function formatExampleInput(inputData: Record<string, unknown>) {
    const ret = Object.assign({}, inputData);
    for (const name in ret) {
      if (name[0] === "$") delete ret[name];
    }
    return ret;
  }

  function examples(exampleList: IExample[], _response?: SchemaType) {
    return exampleList
      .map((item) => {
        const title = `// ${stringOrEmpty(item.name)} - ${item.path} `;
        const header = item.headers ? `\nheaders = ${jsonStringify(item.headers, 2)}\n` : "";
        const input = item.input && `input = ${jsonStringify(formatExampleInput(item.input), 2)};`;
        const outString = jsonStringify(item.output || {}, 2);
        const output = `output = ${outString};`;
        return `${title}\n${header}${input}\n${output}`.trim();
      })
      .join("\n\n");
  }

  for (const item of Object.values(data.apis)) {
    const tested = itemTFEmoji(item.tested);
    const tit = stringOrEmpty(item.title as string);
    const method = (item.method as string).toUpperCase();

    const line = [`## ${tit} ${tested}`];
    line.push(`\n请求地址：**${method}** \`${item.realPath}\``);

    if (item.description) {
      line.push(
        (item.description as string)
          .split("\n")
          .map((it: string) => it.trim())
          .join("\n")
      );
    }

    const paramsDoc = paramsTable(item);
    if (paramsDoc) {
      line.push(`\n### 参数：\n\n${paramsDoc}`);
    } else {
      line.push("\n参数：无参数");
    }

    const responseDoc = responseTable(item.response);
    if (responseDoc) {
      line.push(`\n### 返回结果：\n\n${responseDoc}`);
    }

    if (item.examples.length > 0) {
      line.push("\n### 使用示例：\n");
      line.push("```javascript");
      line.push(examples(item.examples, item.responseSchema as SchemaType));
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
