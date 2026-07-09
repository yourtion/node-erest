import * as path from "node:path";
import { plugin as debug } from "../../debug.js";
import type { IDocData, IDocWritter } from "../../extend/docs.js";
import type { IDocOptions } from "../../index.js";
import { extractDocFields, type DocField } from "../zod-meta.js";
import * as utils from "../../utils.js";

/** 按 Zod 推断类型生成 Postman 示例占位值 */
function sampleValue(f: DocField): unknown {
  if (f.enumValues && f.enumValues.length > 0) return f.enumValues[0];
  switch (f.type) {
    case "number":
      return 0;
    case "boolean":
      return false;
    case "array":
      return [];
    case "object":
      return {};
    case "date":
      return "2024-01-01T00:00:00Z";
    default:
      return "";
  }
}

interface IPostManHeader {
  key: string;
  value: string;
  description?: string;
}

interface IPostManRequest {
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  header: IPostManHeader[];
  body?: IPostManRequestBody;
}

interface IPostManRequestBody {
  mode: "raw" | "urlencoded" | "formdata" | "file";
  raw?: string;
  urlencoded?: IPostManUrlEncodedParameter[];
  formdata?: unknown[];
  disabled?: boolean;
}

interface IPostManUrlEncodedParameter {
  key: string;
  value?: string;
  disabled?: boolean;
  description?: string;
}

interface IPostManFolders {
  name: string;
  description?: string;
  item: IPostManItem[];
}

interface IPostManItem {
  name: string;
  request: IPostManRequest;
  response?: IPostManExampleResponse[];
}

interface IPostManExampleResponse {
  name: string;
  status: string;
  code: number;
  body: string;
}

export default function generatePostman(data: IDocData, dir: string, options: IDocOptions, writter: IDocWritter) {
  debug("generatePostman: %s - %o", dir, options);

  function getHeader() {
    return {
      key: "Content-Type",
      value: "application/json",
    };
  }

  const postman = {
    variables: [
      {
        enabled: true,
        key: "HOST",
        value: (data.info.host || "") + data.info.basePath,
        type: "text",
      },
    ],
    info: {
      name: data.info.title,
      _postman_id: "",
      description: data.info.description,
      schema: "https://schema.getpostman.com/json/collection/v2.0.0/collection.json",
    },
    item: [] as IPostManFolders[],
  };

  const groups: Record<string, { id: string; name: string; items: IPostManItem[] }> = {};

  for (const [g, name] of Object.entries(data.group)) {
    groups[g] = { id: g, name, items: [] };
  }

  for (const item of Object.values(data.apis)) {
    const req: IPostManItem = {
      name: item.title as string,
      request: {
        url: `{{HOST}}${item.realPath}`,
        method: String(item.method).toUpperCase() as "GET" | "POST" | "PUT" | "DELETE",
        header: [],
      } as IPostManRequest,
    };
    req.request.header.push(getHeader());
    if (item.method === "post" || item.method === "put") {
      req.request.body = {
        mode: "urlencoded",
        urlencoded: [],
      };
      // Stage 1：从预编译的 Zod bodySchema 提取字段名
      const bodyShape = (item.bodySchema as { _def?: { shape?: Record<string, unknown> } })?._def?.shape;
      if (bodyShape) {
        for (const sKey of Object.keys(bodyShape)) {
          req.request.body.urlencoded?.push({
            key: sKey,
            description: "",
          });
        }
      }
    }

    // 有 responseSchema 时，生成示例响应（issue #6）
    const responseFields = extractDocFields(item.responseSchema, "body");
    if (responseFields.length > 0) {
      const sample: Record<string, unknown> = {};
      for (const f of responseFields) {
        sample[f.name] = sampleValue(f);
      }
      req.response = [
        {
          name: "成功",
          status: "OK",
          code: 200,
          body: JSON.stringify(sample, null, 2),
        },
      ];
    }

    // Create group if it doesn't exist
    if (!groups[item.group]) {
      groups[item.group] = { id: item.group, name: item.group, items: [] };
    }

    groups[item.group].items.push(req);
  }

  for (const gg of Object.values(groups)) {
    postman.item.push({ name: gg.name, item: gg.items });
  }

  const filename = utils.getPath("postman.json", options.postman);

  writter(path.resolve(dir, filename), JSON.stringify(postman, null, "  "));
}
