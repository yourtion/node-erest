import * as path from "path";
import { plugin as debug } from "../../debug";
import { IDocData, IDocWritter } from "../../extend/docs";
import { IDocOptions } from "../..";
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

  for (const g in data.group) {
    groups[g] = {
      id: g,
      name: data.group[g],
      items: [] as IPostManItem[],
    };
  }

  for (const key in data.apis) {
    const item = data.apis[key];
    const req: IPostManItem = {
      name: item.title,
      request: {
        url: "{{HOST}}" + item.realPath,
        method: String(item.method).toLocaleUpperCase(),
        header: [],
      } as IPostManRequest,
    };
    req.request.header.push(getHeader());
    groups[item.group].items.push(req);
  }

  for (const g in groups) {
    const gg = groups[g];
    postman.item.push({
      name: gg.name,
      item: gg.items,
    });
  }

  const filename = utils.getPath("postman.json", options.swagger);

  writter(path.resolve(dir, filename), JSON.stringify(postman, null, "  "));
}
