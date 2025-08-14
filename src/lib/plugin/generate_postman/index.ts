import * as path from "node:path";
import type { IDocOptions } from "../..";
import { plugin as debug } from "../../debug";
import type { IDocData, IDocWritter } from "../../extend/docs";
import * as utils from "../../utils";

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
      for (const sKey in item.body as Record<string, unknown>) {
        req.request.body.urlencoded?.push({
          key: sKey,
          description: (item.body as Record<string, { comment?: string }>)[sKey].comment,
        });
      }
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

  const filename = utils.getPath("postman.json", options.swagger);

  writter(path.resolve(dir, filename), JSON.stringify(postman, null, "  "));
}
