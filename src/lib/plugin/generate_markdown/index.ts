"use strict";

/**
 * @file API plugin generate-markdown
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import * as fs from "fs";
import * as path from "path";
import { plugin as debug } from "../../debug";
import { IDocOptions } from "../../index";
import { IDocGeneratePlugin, IKVObject  } from "../../interfaces";
import { ISchemaOption } from "../../schema";
import * as utils from "../../utils";

const generateMarkdown: IDocGeneratePlugin = (data: any, dir: string, options: IDocOptions) => {

  function filePath(name: string) {
    const filename = name === "Home" ? name : name.toLowerCase();
    const p = path.resolve(dir, filename + ".md");
    debug("filePath", p);
    return p;
  }

  function getGroupName(name: string) {
    return data.group[name] ? `${ data.group[name] } ( ${ name } )` : name;
  }

  const typeDoc = trimSpaces(typeDocs(data));
  const errorDoc = trimSpaces(errorDocs(data));

  if (options.wiki) {
    fs.writeFileSync(filePath("types"), typeDoc);
    fs.writeFileSync(filePath("errors"), errorDoc);
  }

  const list = schemaDocs(data);
  const indexDoc: string[] = [];
  indexDoc.push(`# ${ data.info.title }\n`);
  indexDoc.push(data.info.description + "\n");
  indexDoc.push(`测试服务器： ${ data.info.host }${ data.info.basePath }\n`);
  indexDoc.push(`生成时间： ${ data.info.version.toLocaleDateString() } ${ data.info.version.toLocaleTimeString() }\n`);
  indexDoc.push("文档列表：\n");
  const allInOneDoc = indexDoc.slice(0, indexDoc.length);
  const wikiDoc = indexDoc.slice(0, indexDoc.length);

  const wikiPath = utils.getPath("wiki", options.wiki);

  for (const item in data.group) {
    if (!data.group.hasOwnProperty(item)) { continue; }
    indexDoc.push(`- [${ data.group[item] } ( ${ item } ) 相关文档](./${ item.toLowerCase() }.md)`);
    allInOneDoc.push(`- [${ data.group[item] } ( ${ item } ) 相关](#${ item.toLowerCase() })`);
    wikiDoc.push(`- [${ data.group[item] } ( ${ item } ) 相关文档](${ wikiPath }/${ item.toLowerCase() })`);
  }
  if (options.index) {
    fs.writeFileSync(filePath("index"), trimSpaces(indexDoc.join("\n")));
  }
  if (options.wiki) {
    for (const item of list) {
      const titie = `# ${ getGroupName(item.name) } 相关文档\n\n`;
      fs.writeFileSync(filePath(item.name), titie + trimSpaces(item.content));
    }
    fs.writeFileSync(filePath("Home"), trimSpaces(wikiDoc.join("\n")));
  }

  if (options.all) {
    allInOneDoc.push(`- [类型相关文档](#types)`);
    allInOneDoc.push(`- [错误信息文档](#errors)`);
    allInOneDoc.push("\n");
    for (const item of list) {
      allInOneDoc.push(`# <a id="${ item.name.toLowerCase() }">${ getGroupName(item.name) } 相关文档</a>\n\n`);
      allInOneDoc.push(item.content);
    }
    allInOneDoc.push(`# <a id="types">类型相关文档</a>\n\n`);
    allInOneDoc.push(typeDoc);
    allInOneDoc.push(`# <a id="errors">错误信息文档</a>\n\n`);
    allInOneDoc.push(errorDoc);
    fs.writeFileSync(filePath("API文档-" + data.info.title), trimSpaces(allInOneDoc.join("\n")));
  }
};

function trimSpaces(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\n\n+/g, "\n\n").replace(/\n\s+\n/g, "\n\n");
}

function toString(str: string, defaultStr: string) {
  if (typeof str === "undefined") { return defaultStr || ""; }
  return String(str);
}

function stringOrEmpty(str: string) {
  return toString(str, "（无）");
}

function itemTF(obj: any) {
  return obj ? "是" : "否";
}

function typeDocs(data: any) {

  const defaultTypes: any[] = [];
  const customTypes: any[] = [];
  for (const name in data.types) {
    if (!data.types.hasOwnProperty(name)) { continue; }
    const info = data.types[name];
    if (info.isDefault) {
      defaultTypes.push(info);
    } else {
      customTypes.push(info);
    }
  }

  defaultTypes.sort();
  customTypes.sort();

  const typeList: string[] = [];
  typeList.push(`## 默认数据类型\n`);
  typeList.push(`类型 | 描述 | 检查 | 格式化 | 解析`);
  typeList.push(`------|----- |-----|-----|-----`);
  for (const item of defaultTypes) {
    typeList.push(`\`${ item.name }\` | ${ stringOrEmpty(item.description) } | ${ itemTF(item.checker) } ` +
        `| ${ itemTF(item.formatter) } | ${ itemTF(item.parser) }`.trim());
  }
  typeList.push(`\n## 自定义数据类型\n`);
  typeList.push(`类型 | 描述 | 检查 | 格式化 | 解析`);
  typeList.push(`------|----- |-----|-----|-----`);
  for (const item of customTypes) {
    typeList.push(`\`${ item.name }\` | ${ stringOrEmpty(item.description) } | ${ itemTF(item.checker) } ` +
        `| ${ itemTF(item.formatter) } | ${ itemTF(item.parser) }`.trim());
  }
  return typeList.join("\n") + "\n";
}

function errorDocs(data: any) {

  const errors: any[] = [];
  for (const name in data.errors) {
    if (!data.errors.hasOwnProperty(name)) { continue; }
    errors.push(Object.assign({ name }, data.errors[name]));
  }

  errors.sort((a, b) => {
    return a.code - b.code;
  });

  const errorList: string[] = [];
  errorList.push("# 错误类型");
  errorList.push(`错误 | 错误码 | 描述 `);
  errorList.push(`------|----- |-----`);
  for (const item of errors) {
    errorList.push(`\`${ stringOrEmpty(item.name) }\` | ${ item.code } | ${ stringOrEmpty(item.desc) }`.trim());
  }
  return errorList.join("\n");
}

function schemaDocs(data: any) {

  const group: IKVObject = {};

  function add(name: string, content: string) {
    if (!Array.isArray(group[name])) { group[name] = []; }
    group[name].push(content.trim());
  }

  function paramsTable(item: IKVObject) {

    const paramsList: string[] = [];
    paramsList.push(`参数名 | 位置 | 类型 | 格式化 | 必填 | 说明`);
    paramsList.push(`------|----- |-----|-------|------|-----`);
    for (const place of [ "params", "query", "body" ]) {
      for (const name in item[place]) {
        if (!item[place].hasOwnProperty(name)) { continue; }
        const info = item[place][name];
        let required = "否";
        if (item.required.has(name)) {
          required = "是";
        } else {
          for (const names of item.requiredOneOf) {
            if (names.indexOf(name) !== -1) {
              // required = `\`${ names.join('`, `') }\` 其中一个`;
              required = "选填";
              break;
            }
          }
        }
        paramsList.push(`
  \`${ stringOrEmpty(name) }\` | ${ place } | ${ stringOrEmpty(info.type) } | ${ info.format ? "是" : "否" } | ${ required } | ${ stringOrEmpty(info.comment) }
        `.trim());
      }
    }
    if (item.requiredOneOf.size > 0) {
      paramsList.push("\n选填参数：\n");
      for (const names of item.requiredOneOf) {
        paramsList.push(`- \`${ names.join("`, `") }\` 其中一个`);
      }
    }
    if (paramsList.length === 2) { return; }
    return paramsList.join("\n");
  }

  function schemaTable(item: IKVObject) {

    const schemaList: string[] = [];
    schemaList.push("参数名 | 类型 | 说明");
    schemaList.push("------|-----|-----");
    for (const name in item) {
      if (!item[name].hasOwnProperty(name)) { continue; }
      const info = item[name];
      schemaList.push(`
\`${ stringOrEmpty(name) }\` | ${ stringOrEmpty(info.type) } | ${ stringOrEmpty(info.comment) }
      `.trim());
    }

    if (schemaList.length === 2) {
      return;
    }
    return schemaList.join("\n");
  }

  function formatExampleInput(inputData: IKVObject) {
    const ret = Object.assign({}, inputData);
    for (const name in ret) {
      if (name[0] === "$") { delete ret[name]; }
    }
    return ret;
  }

  function examples(exampleList: any[]) {
    return exampleList.map((item) => {
      return `
// ${ stringOrEmpty(item.name) } - ${ item.path } ${ item.headers ? "\nheaders = " + utils.jsonStringify(item.headers, 2) : "" }
input = ${ utils.jsonStringify(formatExampleInput(item.input), 2) };
output = ${ utils.jsonStringify(item.output, 2) };
      `.trim();
    }).join("\n\n");
  }

  for (const key of Object.keys(data.schemas)) {
    const item = data.schemas[key];

    let line = `
## ${ stringOrEmpty(item.title) }

请求地址：**${ item.method.toUpperCase() }** \`${ item.path }\`
`;

    if (item.description) {
      line += "\n\n" + item.description.split("\n").map((it: string) => it.trim()).join("\n") + "\n";
    }
    const paramsDoc = paramsTable(item);
    if (paramsDoc) {
      line += `
### 参数：

${ paramsDoc }
`;
    } else {
      line += "\n参数：无参数\n";
    }

    const schemaDoc = schemaTable(item.schema);
    if (schemaDoc) {
      line += `
### 输出结果说明：

${ schemaDoc }
`;
    }

    if (item.examples.length > 0) {
      line += `
### 使用示例：

\`\`\`javascript
${ examples(item.examples) }
\`\`\`
      `;
    }

    add(item.group, line.trim());
  }

  const list: Array<{name: string, content: string}> = [];
  for (const name in group) {
    if (!group.hasOwnProperty(name)) { continue; }
    list.push({
      name,
      content: group[name].join("\n\n"),
    });
  }

  return list;
}

export default generateMarkdown;
