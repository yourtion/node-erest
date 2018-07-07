import { apiDelete, build, nameParams, TYPES } from "./helper";
import lib from "./lib";

const apiService = lib();
const api = apiService.api;
const deleteApi = apiDelete(api);
apiService.genDocs("/tmp/");

test("Schema - init", () => {
  const schema = api.$apis.get("DELETE_/index/:name")!;
  expect(schema.key).toBe("DELETE_/index/:name");
  expect(schema.options.method).toBe("delete");
  expect(schema.options.path).toBe("/index/:name");
  expect(schema.options.title).toBe("Delete");
  expect(schema.options.group).toBe("Index");
  // expect(schema.options.required.size).toBe(1);
  expect(schema.options.params.name).toEqual(nameParams);
  expect(schema.options._allParams.get("name")).toEqual(nameParams);
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
  deleteApi.response(outSchema);
  deleteApi.query({
    numP2: build(TYPES.Number, "Number", true, 10, { max: 10, min: 0 }),
  });
  const schema = api.$apis.get("DELETE_/index/:name")!;
  expect(schema.options.title).toBe("newTitle");
  expect(schema.options.description).toBe("Yourtion");
  expect(schema.options.examples.length).toBe(1);
  expect(schema.options.examples[0]).toEqual(example);
  expect(schema.options.response).toEqual(outSchema);
});
