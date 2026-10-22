import * as path from "node:path";
import type { APIOption } from "../../api.js";
import { plugin as debug } from "../../debug.js";
import type { IDocData, IDocWritter } from "../../extend/docs.js";
import type { IDocOptions } from "../../index.js";
import * as utils from "../../utils.js";
import { resolveZodShape } from "../zod-meta.js";

export default function generateAxios(data: IDocData, dir: string, options: IDocOptions, writter: IDocWritter) {
  debug("generateAxios: %s - %o", dir, options);

  function slashToCamel(name: string) {
    return name.replace(/\/[a-z]/g, (match) => {
      return match.slice(1).toUpperCase();
    });
  }

  function rmPathParam(path: string) {
    return path.replace(/:([a-z]+)/gi, "$1");
  }

  function getReqFuncName(req: APIOption<unknown>) {
    return `${req.method}${slashToCamel(rmPathParam(req.realPath))}`;
  }

  // Stage 1：从预编译的 Zod schema 提取字段名（替代旧 ISchemaType Record 的 keys）
  function schemaFieldNames(schema: unknown): string[] {
    if (!schema) return [];
    return Object.keys(resolveZodShape(schema) ?? {});
  }

  function getFuncParams(req: APIOption<unknown>) {
    const dataKeys = usesQueryInput(req) ? schemaFieldNames(req.querySchema) : schemaFieldNames(req.bodySchema);
    const params = dataKeys.length ? [`{ ${dataKeys.join(", ")} } = {}`] : [];
    if (!usesQueryInput(req) && schemaFieldNames(req.querySchema).length) {
      params.push(`${queryArgument(req)} = {}`);
    }
    return params.join(", ");
  }

  function usesQueryInput(req: APIOption<unknown>) {
    return req.method === "get" || req.method === "delete";
  }

  function queryArgument(req: APIOption<unknown>) {
    const keys = [...schemaFieldNames(req.paramsSchema), ...schemaFieldNames(req.bodySchema)];
    let name = "query";
    while (keys.includes(name)) name = `_${name}`;
    return name;
  }

  function hasUrlParam(path: string) {
    return /:[a-z]+/i.test(path);
  }

  function getReqSendPath(path: string) {
    if (hasUrlParam(path)) {
      // 生成模板字符串插值（注意：替换串不能带反斜杠转义，否则 \$ 使插值退化为字面量文本）
      return `\`${path.replace(/:([a-z]+)/gi, "${$1}")}\``;
    }
    return `'${path}'`;
  }

  function getPathParams(_req: APIOption<unknown>) {
    const dataKeys = schemaFieldNames(_req.paramsSchema);
    if (!dataKeys.length) return "";
    return dataKeys.map((key) => `${key},`).join("");
  }

  function getReqSendData(req: APIOption<unknown>) {
    const isQueryReq = usesQueryInput(req);
    const dataKeys = isQueryReq ? schemaFieldNames(req.querySchema) : schemaFieldNames(req.bodySchema);
    if (isQueryReq) {
      if (!dataKeys.length) return "";
      return `{
        params: { ${dataKeys.join(", ")} }
      }`;
    }
    const body = dataKeys.length ? `{ ${dataKeys.join(", ")} }` : "";
    if (schemaFieldNames(req.querySchema).length) {
      return `${body || "undefined"}, { params: ${queryArgument(req)} }`;
    }
    return body;
  }

  const baseURL = `${data.info.host || ""}${data.info.basePath}`;

  const { apis } = data;
  const request = Object.keys(apis).map((key) => {
    const req = apis[key];
    let reqSendData = getReqSendData(req);
    if (reqSendData) {
      reqSendData = `, ${reqSendData}`;
    }
    return `
    // ${req.title}
    ${getReqFuncName(req)}(
      ${getPathParams(req)}
      ${getFuncParams(req)}) {
      return this.instance.${req.method}(
        ${getReqSendPath(req.realPath)}
        ${reqSendData})
    }`;
  });

  const template = `
    // ${data.info.title} ${data.genTime}
    import axios from 'axios';
    const BASE = "${baseURL}";

    const api = {
      instance: axios.create({
        baseURL: BASE,
        paramsSerializer: { indexes: null },
      }),
      ${request.join(",\n")}
    };

    export default api;
  `;

  const filename = utils.getPath("jssdk.js", options.axios);

  writter(path.resolve(dir, filename), template);
}
