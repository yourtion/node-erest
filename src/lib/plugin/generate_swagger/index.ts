/**
 * @file API plugin generate-swagger
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import * as path from "path";
import { plugin as debug } from "../../debug";
import { IDocData, IDocWritter } from "../../extend/docs";
import { IDocOptions } from "../..";
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
  required: string[] | boolean;
  example?: any;
  enum?: string[];
  items?: any;
  format?: string;
}

export default function generateSwagger(data: IDocData, dir: string, options: IDocOptions, writter: IDocWritter) {
  debug("generateSwagger: %s - %o", dir, options);

  const url = new URL(`${data.info.host || ""}${data.info.basePath || ""}`);

  const result: ISwaggerResult = {
    swagger: "2.0",
    info: {
      title: data.info.title,
      description: data.info.description,
      version: data.info.version || "1.0.0",
    },
    host: url.host,
    basePath: url.pathname,
    schemes: [url.protocol.replace(":", "")],
    tags: [],
    definitions: {},
    paths: {},
  };

  for (const k in data.group) {
    result.tags.push({ name: k, description: data.group[k] });
  }
  result.tags = result.tags.sort((a, b) => (a.name > b.name ? 1 : -1));

  const paths = result.paths;
  const schemas = data.apis;
  for (const key in schemas) {
    const schema = schemas[key];

    const newPath = key.split("_")[1].replace(/:(\w+)/, "{$1}");
    if (!paths[newPath]) {
      paths[newPath] = {};
    }
    const sc = paths[newPath];
    sc[schema.method] = {
      tags: [schema.group],
      summary: schema.title,
      description: schema.description || "",
      consumes: ["application/json"],
      produces: ["application/json"],
      responses: {
        200: {
          description: "请求成功",
        },
      },
    };

    sc[schema.method].parameters = [];
    const bodySchema: Record<string, any> = {};
    let example = schema.examples && schema.examples[0];
    if (schema.examples && schema.examples.length > 1) {
      for (const item of schema.examples) {
        if (item.output!.success) {
          example = item;
          break;
        }
      }
    }
    example = example || { input: {}, output: {} };
    for (const place of ["params", "query", "body"]) {
      for (const sKey in schema[place]) {
        const obj: ISwaggerResultParams = {
          name: sKey,
          in: place === "params" ? "path" : place,
          description: schema[place][sKey].comment,
          required: sKey === "body" ? [] : false,
          type: "string", //schema[place][sKey].type.toLowerCase(),
          example: place === "body" ? example.input![sKey] : undefined,
        };
        if (place === "params") obj.required = true;
        if (schema.required.has(sKey)) {
          if (place === "query") obj.required = true;
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
          if (schema.required.has(sKey)) {
            bodySchema.required.push(sKey)
          }
        } else {
          sc[schema.method].parameters.push(obj);
        }
      }
    }

    // sc[schema.method].responses[200].example = example.output;
    if (schema.method === "post" && schema.body) {
      const required = schema.required && [...schema.required].filter(it => Object.keys(bodySchema).indexOf(it) > -1);
      sc[schema.method].parameters.push({
        in: "body",
        name: "body",
        description: "请求体",
        required: true,
        schema: {
          type: "object",
          required: required && required.length > 0 ? required : undefined,
          properties: bodySchema,
        },
      });
    }
  }

  const filename = utils.getPath("swagger.json", options.swagger);

  writter(path.resolve(dir, filename), JSON.stringify(result, null, "  "));
}
