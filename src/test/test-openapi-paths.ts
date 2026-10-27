import SwaggerParser from "@apidevtools/swagger-parser";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import lib from "./lib";

describe("OpenAPI 路径模板与参数保持一致", () => {
  test.each([
    { route: "/users/:id", names: ["id"] },
    { route: "/users/:user_2/:_item3", names: ["user_2", "_item3"] },
    { route: "/users/:id/:part", names: ["id", "part"], params: z.object({ id: z.string().describe("Identifier") }) },
    { route: "/users/:id", names: ["id"], params: z.object({ id: z.string().optional(), unused: z.string() }) },
    { route: "/users", names: [], params: z.object({ unused: z.string() }) },
  ])("$route 即使未声明或仅部分声明 params schema 仍符合规范", async ({ route, names, params }) => {
    const service = lib();
    service.api
      .get(route)
      .group("Index")
      .title("Path")
      .registerTyped(params ? { params } : {}, () => {});
    const document = service.buildOpenAPI();
    const [template, methods] = Object.entries(document.paths)[0];
    const parameters = methods.get.parameters.filter((parameter) => parameter.in === "path");
    expect(parameters.map((parameter) => parameter.name)).toEqual(names);
    expect(parameters.every((parameter) => parameter.required)).toBe(true);
    expect(Array.from(template.matchAll(/\{([^}]+)\}/g), (match) => match[1])).toEqual(names);
    for (const parameter of parameters) {
      if (!params || !(parameter.name in params.shape)) expect(parameter.schema).toEqual({ type: "string" });
    }
    await expect(SwaggerParser.validate(JSON.parse(JSON.stringify(document)))).resolves.toBeDefined();
  });
});
