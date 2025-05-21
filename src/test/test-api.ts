import os from "os";
import * as z from 'zod';
import { apiDelete, build, nameParams as oldNameParams, TYPES } from "../test/helper"; // Keep oldNameParams for now if its structure is complex and used in assertions
import lib from "../test/lib";

const apiService = lib();
const api = apiService.api;
const deleteApi = apiDelete(api); // This helper likely needs to be updated to use Zod
apiService.genDocs(os.tmpdir());

// Define Zod version of nameParams for clarity in tests
const zodNameParams = z.string().min(1).describe("名称"); // Assuming nameParams was { type: "string", required: true, comment: "名称" } and non-empty

test("API - 初始化", () => {
  const apiInfo = api.$apis.get("DELETE_/index/:name")!;
  expect(apiInfo.key).toBe("DELETE_/index/:name");
  expect(apiInfo.options.method).toBe("delete");
  expect(apiInfo.options.path).toBe("/index/:name");
  expect(apiInfo.options.title).toBe("Delete");
  expect(apiInfo.options.group).toBe("Index");
  // Check if the params schema exists and its shape for 'name'
  expect(apiInfo.options.params).toBeDefined();
  expect(apiInfo.options.params?.shape.name).toBeDefined();
  // Further checks might involve instanceof z.ZodString, etc.
  // For now, let's assume the structure implies correctness if it was set via .params(z.object({ name: zodNameParams }))
  
  // _allParams stores individual ZodTypeAny, so check if 'name' exists and is a Zod type
  expect(apiInfo.options._allParams.get("name")).toBeInstanceOf(z.ZodType);
  expect(apiInfo.options.handler!.name).toBe("del");
});

test("API - 更新信息", () => {
  deleteApi.title("newTitle");
  deleteApi.description("Yourtion");
  const example = {
    input: { a: "b" },
    output: { name: "d" },
  };
  // Define Zod version of outSchema
  const zodOutSchema = z.object({ name: zodNameParams });
  deleteApi.example(example);
  deleteApi.response(zodOutSchema); // Use the Zod schema here
  deleteApi.query(z.object({
    numP2: z.number().min(0).max(10).default(10), // Assuming required:true means it needs a default or is not optional
  }));

  const apiInfo = api.$apis.get("DELETE_/index/:name")!;
  expect(apiInfo.options.title).toBe("newTitle");
  expect(apiInfo.options.description).toBe("Yourtion");
  expect(apiInfo.options.examples.length).toBe(1);
  expect(apiInfo.options.examples[0]).toEqual(example);
  // Check the response schema
  expect(apiInfo.options.response).toEqual(zodOutSchema);
  // Check the query schema
  expect(apiInfo.options.query?.shape.numP2).toBeDefined();
});
