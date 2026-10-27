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
    return name.replace(/\/[a-z_]/gi, (match) => {
      return match.slice(1).toUpperCase();
    });
  }

  function rmPathParam(path: string) {
    return utils.mapPathParams(path, (name) => name);
  }

  function getReqFuncName(req: APIOption<unknown>) {
    return `${req.method}${slashToCamel(rmPathParam(req.realPath))}`;
  }

  // Stage 1：从预编译的 Zod schema 提取字段名（替代旧 ISchemaType Record 的 keys）
  function schemaFieldNames(schema: unknown): string[] {
    if (!schema) return [];
    return Object.keys(resolveZodShape(schema) ?? {});
  }

  function usesQueryInput(req: APIOption<unknown>) {
    return req.method === "get" || req.method === "delete";
  }

  // 所有函数形参共用同一命名空间，保留普通字段名，仅在冲突或非法绑定时使用别名。
  function uniqueBinding(key: string, used: Set<string>) {
    const reserved = new Set(
      "await break case catch class const continue debugger default delete do else enum export extends false finally for function if implements import in instanceof interface let new null package private protected public return static super switch this throw true try typeof var void while with yield arguments eval".split(
        " "
      )
    );
    let name = key.replace(/[^a-z0-9_$]/gi, "_");
    if (!/^[a-z_$]/i.test(name) || reserved.has(name)) name = `_${name}`;
    while (used.has(name)) name = `_${name}`;
    used.add(name);
    return name;
  }

  function pathBindings(req: APIOption<unknown>) {
    const used = new Set<string>();
    // 保持已生成 SDK 的位置参数契约：已声明字段顺序不变，遗漏的路径参数追加在后。
    const keys = new Set([...schemaFieldNames(req.paramsSchema), ...utils.getPathParamNames(req.realPath)]);
    return new Map([...keys].map((key) => [key, uniqueBinding(key, used)]));
  }

  function inputBindings(req: APIOption<unknown>) {
    const used = new Set(pathBindings(req).values());
    const keys = schemaFieldNames(usesQueryInput(req) ? req.querySchema : req.bodySchema);
    return new Map(keys.map((key) => [key, uniqueBinding(key, used)]));
  }

  function inputFields(req: APIOption<unknown>) {
    return [...inputBindings(req)].map(([key, binding]) =>
      key === binding ? key : `${JSON.stringify(key)}: ${binding}`
    );
  }

  function queryArgument(req: APIOption<unknown>) {
    const used = new Set([...pathBindings(req).values(), ...inputBindings(req).values()]);
    return uniqueBinding("query", used);
  }

  function getFuncParams(req: APIOption<unknown>) {
    const fields = inputFields(req);
    const params = fields.length ? [`{ ${fields.join(", ")} } = {}`] : [];
    if (!usesQueryInput(req) && schemaFieldNames(req.querySchema).length) params.push(`${queryArgument(req)} = {}`);
    return params.join(", ");
  }

  function getReqSendPath(req: APIOption<unknown>) {
    const bindings = pathBindings(req);
    if (bindings.size) return `\`${utils.mapPathParams(req.realPath, (name) => "${" + bindings.get(name) + "}")}\``;
    return `'${req.realPath}'`;
  }

  function getPathParams(req: APIOption<unknown>) {
    return [...pathBindings(req).values()].map((binding) => `${binding},`).join("");
  }

  function getReqSendData(req: APIOption<unknown>) {
    const isQueryReq = usesQueryInput(req);
    const dataKeys = inputFields(req);
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

  const baseURL = `${data.info.host || ""}${data.info.basePath || ""}`;

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
        ${getReqSendPath(req)}
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
