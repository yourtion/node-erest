/**
 * @file API plugin generate-markdown
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import * as path from "path";
import { plugin as debug } from "../../debug";
import { IDocData, IDocWritter } from "../../extend/docs";
import { IDocOptions } from "../..";
import * as utils from "../../utils";
import errorDocs from "./errors";
import apiDocs from "./apis";
import typeDocs from "./types";
import { trimSpaces } from "./utils";

function filePath(dir: string, name: string) {
  const filename = name === "Home" ? name : name.toLowerCase();
  const p = path.resolve(dir, filename + ".md");
  debug("filePath: %s", p);
  return p;
}

export default function generateMarkdown(data: IDocData, dir: string, options: IDocOptions, writter: IDocWritter) {
  debug("generateMarkdown: %s - %o", dir, options);

  function getGroupName(name: string) {
    return `${data.group[name]} ( ${name} )`;
  }

  const typeDoc = trimSpaces(typeDocs(data));
  const errorDoc = trimSpaces(errorDocs(data));

  if (options.wiki) {
    writter(filePath(dir, "types"), typeDoc);
    writter(filePath(dir, "errors"), errorDoc);
  }

  const { list, groupTitles } = apiDocs(data);
  const indexDoc: string[] = [];
  indexDoc.push(`# ${data.info.title}\n`);
  indexDoc.push(data.info.description + "\n");
  indexDoc.push(`测试服务器： ${data.info.host}${data.info.basePath}\n`);
  indexDoc.push(`生成时间： ${data.info.version!.toLocaleDateString()} ${data.info.version!.toLocaleTimeString()}\n`);
  indexDoc.push("文档列表：\n");
  const allInOneDoc = indexDoc.slice(0, indexDoc.length);
  const wikiDoc = indexDoc.slice(0, indexDoc.length);

  const wikiPath = utils.getPath("wiki", options.wiki);

  for (const [name, title] of Object.entries(data.group)) {
    const group = utils.camelCase2underscore(name);
    indexDoc.push(`- [${title} ( ${name} ) 相关文档](./${name.toLowerCase()}.md)`);
    allInOneDoc.push(`- [${title} ( ${name} ) 相关](#${name.toLowerCase()})`);
    wikiDoc.push(`- [/${group} - ${title}相关文档](${wikiPath}${name.toLowerCase()})`);
    if (options.wiki && groupTitles[name]) {
      wikiDoc.push(groupTitles[name].join("\n"));
    }
  }

  if (options.index) {
    writter(filePath(dir, "index"), trimSpaces(indexDoc.join("\n")));
  }

  if (options.wiki) {
    for (const item of list) {
      const titie = `# ${getGroupName(item.name)} 相关文档\n\n`;
      writter(filePath(dir, item.name), titie + trimSpaces(item.content));
    }
    writter(filePath(dir, "Home"), trimSpaces(wikiDoc.join("\n")));
  }

  if (options.all) {
    allInOneDoc.push(`- [类型相关文档](#types)`);
    allInOneDoc.push(`- [错误信息文档](#errors)`);
    allInOneDoc.push("\n");
    for (const item of list) {
      allInOneDoc.push(`# <a id="${item.name.toLowerCase()}">${getGroupName(item.name)} 相关文档</a>\n\n`);
      allInOneDoc.push(item.content);
    }
    allInOneDoc.push(`# <a id="types">类型相关文档</a>\n\n`);
    allInOneDoc.push(typeDoc);
    allInOneDoc.push(`# <a id="errors">错误信息文档</a>\n\n`);
    allInOneDoc.push(errorDoc);
    writter(filePath(dir, "API文档-" + data.info.title), trimSpaces(allInOneDoc.join("\n")));
  }
}
