import { vol } from "memfs";
import { vi } from "vitest";
import { apiDelete, build, nameParams, TYPES } from "./helper";
import lib from "./lib";

describe("API 接口测试", () => {
  let apiService: ReturnType<typeof lib>;
  let api: ReturnType<typeof lib>["api"];
  let deleteApi: ReturnType<typeof apiDelete>;

  beforeEach(() => {
    // 重置虚拟文件系统
    vol.reset();
    vol.mkdirSync("/tmp", { recursive: true });

    // 初始化服务
    apiService = lib();
    api = apiService.api;
    deleteApi = apiDelete(api);

    // 使用 mock 的文档生成，不进行真实文件操作
    const genDocsSpy = vi.spyOn(apiService, "genDocs").mockImplementation(() => {
      // 模拟文档生成过程，但不写入真实文件
    });

    apiService.genDocs("/tmp");

    // 验证 genDocs 被调用
    expect(genDocsSpy).toHaveBeenCalledWith("/tmp");
  });

  test("API 接口初始化验证", () => {
    const apiInfo = api.$apis.get("DELETE_/index/:name");
    expect(apiInfo?.key).toBe("DELETE_/index/:name");
    expect(apiInfo?.options.method).toBe("delete");
    expect(apiInfo?.options.path).toBe("/index/:name");
    expect(apiInfo?.options.title).toBe("Delete");
    expect(apiInfo?.options.group).toBe("Index");
    expect((apiInfo?.options.params as any)?.name).toEqual(nameParams);
    expect(apiInfo?.options._allParams.get("name")).toEqual(nameParams);
    expect(apiInfo?.options.handler?.name).toBe("del");
  });

  test("API 接口信息更新测试", () => {
    deleteApi.title("newTitle");
    deleteApi.description("Yourtion");
    const example = {
      input: { a: "b" },
      output: { name: "d" },
    };
    const outSchema = { name: nameParams } as any;
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
});
