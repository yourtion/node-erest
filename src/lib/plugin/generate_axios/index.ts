import * as path from "node:path";
import type { IDocOptions } from "../..";
import type { APIOption } from "../../api";
import { plugin as debug } from "../../debug";
import type { IDocData, IDocWritter } from "../../extend/docs";
import * as utils from "../../utils";

export default function generateAsiox(data: IDocData, dir: string, options: IDocOptions, writter: IDocWritter) {
  debug("generateAsiox: %s - %o", dir, options);

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

  function getFuncParams(req: APIOption<unknown>) {
    const parseData = req.method === "get" ? req.query : req.body;
    const dataKeys = Object.keys(parseData as Record<string, unknown>);
    if (!dataKeys.length) {
      return "";
    }
    return `{ ${dataKeys.join(", ")} }`;
  }

  function hasUrlParam(path: string) {
    return /:[a-z]+/i.test(path);
  }

  function getReqSendPath(path: string) {
    if (hasUrlParam(path)) {
      return `\`${path.replace(/:([a-z]+)/gi, "\\$\\{$1\\}")}\``;
    }
    return `'${path}'`;
  }

  function getPathParams(req: APIOption<unknown>) {
    if (req.params) {
      const params = Object.keys(req.params as Record<string, unknown>)
        .map((key) => `${key},`)
        .join("");
      return params;
    }
    return "";
  }

  function getReqSendData(req: APIOption<unknown>) {
    const isGetReq = req.method === "get";
    const parseData = isGetReq ? req.query : req.body;
    const dataKeys = Object.keys(parseData as Record<string, unknown>);
    if (!dataKeys.length) {
      return "";
    }
    if (isGetReq) {
      return `{
        params: { ${dataKeys.join(", ")} }
      }`;
    }
    return `{ ${dataKeys.join(", ")} }`;
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
      }),
      ${request.join(",\n")}
    };

    export default api;
  `;

  const filename = utils.getPath("jssdk.js", options.swagger);

  writter(path.resolve(dir, filename), template);
}
