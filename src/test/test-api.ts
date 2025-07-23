import * as os from "node:os";
import { apiDelete, build, nameParams, TYPES } from "../test/helper";
import lib from "../test/lib";

const apiService = lib();
const api = apiService.api;
const deleteApi = apiDelete(api);
apiService.genDocs(os.tmpdir());

test("API - 初始化", () => {
  const apiInfo = api.$apis.get("DELETE_/index/:name");
  expect(apiInfo?.key).toBe("DELETE_/index/:name");
  expect(apiInfo?.options.method).toBe("delete");
  expect(apiInfo?.options.path).toBe("/index/:name");
  expect(apiInfo?.options.title).toBe("Delete");
  expect(apiInfo?.options.group).toBe("Index");
  expect(apiInfo?.options.params.name).toEqual(nameParams);
  expect(apiInfo?.options._allParams.get("name")).toEqual(nameParams);
  expect(apiInfo?.options.handler?.name).toBe("del");
});

test("API - 更新信息", () => {
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

  const apiInfo = api.$apis.get("DELETE_/index/:name");
  expect(apiInfo?.options.title).toBe("newTitle");
  expect(apiInfo?.options.description).toBe("Yourtion");
  expect(apiInfo?.options.examples.length).toBe(1);
  expect(apiInfo?.options.examples[0]).toEqual(example);
  expect(apiInfo?.options.response).toEqual(outSchema);
});
