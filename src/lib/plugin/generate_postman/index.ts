import * as path from "path";
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
  formdat?: any[];
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
        value: data.info.host! + data.info.basePath,
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

  const groups: any = {};

  for (const [g, name] of Object.entries(data.group)) {
    groups[g] = { id: g, name, items: [] as IPostManItem[] };
  }

  for (const item of Object.values(data.apis)) {
    const req: IPostManItem = {
      name: item.title,
      request: {
        url: "{{HOST}}" + item.realPath,
        method: String(item.method).toLocaleUpperCase(),
        header: [],
      } as IPostManRequest,
    };
    req.request.header.push(getHeader());
    if (item.method === "post" || item.method === "put") {
      req.request.body = {
        mode: "urlencoded",
        urlencoded: [],
      };
      for (const sKey in item.body) {
        req.request.body.urlencoded!.push({
          key: sKey,
          description: item.body[sKey].comment,
        });
      }
    }
    groups[item.group].items.push(req);
  }

  for (const gg of Object.values(groups) as any) {
    postman.item.push({ name: gg.name, item: gg.items });
  }

  const filename = utils.getPath("postman.json", options.swagger);

  writter(path.resolve(dir, filename), JSON.stringify(postman, null, "  "));
}
