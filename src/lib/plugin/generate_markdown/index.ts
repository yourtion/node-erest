/**
 * @file API plugin generate-markdown
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import * as fs from "fs";
import * as path from "path";
import { plugin as debug } from "../../debug";
import { IDocData } from "../../extend/docs";
import { IDocOptions } from "../../index";
import { IDocGeneratePlugin, IKVObject  } from "../../interfaces";
import { ISchemaOption } from "../../schema";
import * as utils from "../../utils";
import errorDocs from "./errors";
import schemaDocs from "./schemas";
import typeDocs from "./types";
import { itemTF, stringOrEmpty, trimSpaces } from "./utils";

function filePath(dir: string, name: string) {
  const filename = name === "Home" ? name : name.toLowerCase();
  const p = path.resolve(dir, filename + ".md");
  debug("filePath: %s", p);
  return p;
}

export default function generateMarkdown(data: IDocData, dir: string, options: IDocOptions) {

  debug("generateMarkdown: %s - %o", dir, options);

  function getGroupName(name: string) {
    return `${ data.group[name] } ( ${ name } )`;
  }

  const typeDoc = trimSpaces(typeDocs(data));
  const errorDoc = trimSpaces(errorDocs(data));

  if (options.wiki) {
    fs.writeFileSync(filePath(dir, "types"), typeDoc);
    fs.writeFileSync(filePath(dir, "errors"), errorDoc);
  }

  const { list, groupTitles } = schemaDocs(data);
  const indexDoc: string[] = [];
  indexDoc.push(`# ${ data.info.title }\n`);
  indexDoc.push(data.info.description + "\n");
  indexDoc.push(`测试服务器： ${ data.info.host }${ data.info.basePath }\n`);
  indexDoc.push(`生成时间： ${ data.info.version!.toLocaleDateString() } ${ data.info.version!.toLocaleTimeString() }\n`);
  indexDoc.push("文档列表：\n");
  const allInOneDoc = indexDoc.slice(0, indexDoc.length);
  const wikiDoc = indexDoc.slice(0, indexDoc.length);

  const wikiPath = utils.getPath("wiki", options.wiki);

  for (const item in data.group) {
    const group = utils.camelCase2underscore(item);
    indexDoc.push(`- [${ data.group[item] } ( ${ item } ) 相关文档](./${ item.toLowerCase() }.md)`);
    allInOneDoc.push(`- [${ data.group[item] } ( ${ item } ) 相关](#${ item.toLowerCase() })`);
    wikiDoc.push(`- [/${group} - ${ data.group[item] }相关文档](${ wikiPath }${ item.toLowerCase() })`);
    if (options.wiki && groupTitles[item]) {
      wikiDoc.push(groupTitles[item].join("\n"));
    }
  }

  if (options.index) {
    fs.writeFileSync(filePath(dir, "index"), trimSpaces(indexDoc.join("\n")));
  }

  if (options.wiki) {
    for (const item of list) {
      const titie = `# ${ getGroupName(item.name) } 相关文档\n\n`;
      fs.writeFileSync(filePath(dir, item.name), titie + trimSpaces(item.content));
    }
    fs.writeFileSync(filePath(dir, "Home"), trimSpaces(wikiDoc.join("\n")));
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
    fs.writeFileSync(filePath(dir, "API文档-" + data.info.title), trimSpaces(allInOneDoc.join("\n")));
  }
}
