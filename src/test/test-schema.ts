import { apiAll, apiDelete, apiPost, hook, nameParams } from "./helper";
import lib from "./lib";
import { GROUPS, INFO } from "./lib";

const apiService = lib();
const api = apiService.api;
const deleteApi = apiDelete(api);

test("Schema - init", () => {
  const schema = api.$schemas.get("DELETE_/index/:name")!;
  expect(schema.key).toBe("DELETE_/index/:name");
  expect(schema.options.method).toBe("delete");
  expect(schema.options.path).toBe("/index/:name");
  expect(schema.options.title).toBe("Delete");
  expect(schema.options.group).toBe("Index");
  expect(schema.options.required.size).toBe(1);
  expect(schema.options.params.name).toEqual(nameParams);
  expect(schema.options._params.get("name")).toEqual(nameParams);
  expect(schema.options.handler!.name).toBe("del");
});

test("Schema - modify", () => {
  deleteApi.title("newTitle");
  deleteApi.description("Yourtion");
  const example = {
    input: { a: "b" },
    output: { name: "d" },
  };
  const outSchema = { name: nameParams };
  deleteApi.example(example);
  deleteApi.schema(outSchema);
  deleteApi.requiredOneOf(["name", "age"]);
  deleteApi.required(["name"]);
  deleteApi.required(["name"]);
  const schema = api.$schemas.get("DELETE_/index/:name")!;
  expect(schema.options.title).toBe("newTitle");
  expect(schema.options.description).toBe("Yourtion");
  expect(schema.options.examples.length).toBe(1);
  expect(schema.options.examples[0]).toEqual(example);
  expect(schema.options.schema).toEqual(outSchema);
  expect(schema.options.requiredOneOf.length).toBe(1);
  expect(schema.options.required.size).toBe(1);
});
