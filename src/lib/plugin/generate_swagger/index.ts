"use strict";

/**
 * @file API plugin generate-swagger
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import * as fs from "fs";
import * as path from "path";
import { IDocOptions } from "../../index";
import { IDocGeneratePlugin, IKVObject } from "../../interfaces";
import { ISchemaOption } from "../../schema";
import * as utils from "../../utils";

interface ISwaggerResult {
  swagger: string;
  info: any;
  host: string;
  basePath: string;
  schemes: string[];
  tags: any[];
  definitions: any;
  paths: any;
}

interface ISwaggerResultParams {
  name: string;
  in: string;
  description: string;
  type: string;
  required: boolean;
  example: any;
  enum?: string[];
  items?: any;
  format?: string;
}

const generateSwagger: IDocGeneratePlugin = (data: any, dir: string, options: IDocOptions) => {

  const result: ISwaggerResult = {
    swagger: "2.0",
    info: {
      title: data.info.title,
      description: data.info.description,
      version: data.info.version || "1.0.0",
      // termsOfService: 'http://swagger.io/terms/',
      // contact: {
      //   email: 'yourtion@gmail.com',
      // },
      // license: {
      //   name: 'Apache 2.0',
      //   url: 'http://www.apache.org/licenses/LICENSE-2.0.html',
      // },
    },
    host: data.info.host.replace("http://", "").replace("https://", ""),
    basePath: data.info.basePath,
    schemes: [ "http" ],
    tags: [],
    definitions: {},
    paths: {},
  };

  for (const k in data.group) {
    if (!data.group.hasOwnProperty(k)) { continue; }
    result.tags.push({ name: k, description: data.group[k] });
  }
  result.tags = result.tags.sort((a, b) => a.name > b.name ? 1 : -1);

  const paths = result.paths;
  const schemas = data.schemas;
  for (const key in schemas) {
    if (!schemas.hasOwnProperty(key)) { continue; }
    const schema = schemas[key];
    const pathArray: string[] = [];
    for (const p of schema.path.split("/")) {
      if (p.indexOf(":") === 0) {
        pathArray.push(`{${ p.substr(1, p.length) }}`);
      } else {
        pathArray.push(p);
      }
    }
    const newPath = pathArray.join("/");
    if (!paths[newPath]) {
      paths[newPath] = {};
    }
    const sc = paths[newPath];
    sc[schema.method] = {
      tags: [ schema.group ],
      summary: schema.title,
      description: schema.description || "",
      consumes: [
        "application/json",
      ],
      produces: [
        "application/json",
      ],
      responses: {
        200: {
          description: "请求成功",
        },
      },
    };

    sc[schema.method].parameters = [];
    const bodySchema: IKVObject = {};
    let example = schema.examples && schema.examples[0];
    if (schema.examples && schema.examples.length > 1) {
      for (const item of schema.examples) {
        if (item.output.success) {
          example = item;
          break;
        }
      }
    }
    example = example || { input: {}, output: {}};
    for (const place of [ "params", "query", "body" ]) {
      for (const sKey in schema[place]) {
        if (!schema[place].hasOwnProperty(sKey)) { continue; }
        const obj: ISwaggerResultParams = {
          name: sKey,
          in: place === "params" ? "path" : place,
          description: schema[place][sKey].comment,
          type: schema[place][sKey].type.toLowerCase(),
          required: schema[place][sKey].required,
          example: example.input[sKey],
        };
        if (schema.required.has(sKey)) {
          obj.required = true;
        }
        if (schema[place][sKey].type === "ENUM") {
          obj.type = "string";
          obj.enum = schema[place][sKey].params;
        }
        if (schema[place][sKey].type === "IntArray") {
          obj.type = "array";
          obj.items = { type: "integer" };
        }
        if (schema[place][sKey].type === "Date") {
          obj.type = "string";
          obj.format = "date";
        }
        if (place === "body") {
          delete obj.in;
          delete obj.name;
          delete obj.required;
          bodySchema[sKey] = obj;
        }else {
          sc[schema.method].parameters.push(obj);
        }
      }
    }

    sc[schema.method].responses[200].example = example.output;
    if (schema.method === "post" && schema.body) {
      const required = schema.required && [ ...schema.required ].filter((it) => Object.keys(bodySchema).indexOf(it) > -1);
      sc[schema.method].parameters.push({
        in: "body",
        name: "body",
        description: "请求体",
        required: true,
        schema: {
          type: "object",
          required,
          properties: bodySchema,
        },
      });
    }
  }

  const filename = utils.getPath("swagger.json", options.swagger);

  fs.writeFileSync(path.resolve(dir, filename), JSON.stringify(result, null, "  "));
};

export default generateSwagger;
