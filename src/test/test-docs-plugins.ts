/**
 * @file 文档插件回归测试
 * @author Yourtion Guo <yourtion@gmail.com>
 *
 * 验证各文档生成插件解析到正确的输出文件名（避免互相覆盖）。
 * 回归：generate_postman 此前误用 options.swagger 作为文件名，导致 postman.json
 * 内容被写入 swagger.json（与 swagger 插件冲突、互相覆盖）。
 */
import { describe, expect, test } from "vitest";
import { z } from "zod";
import generateAxios from "../lib/plugin/generate_axios";
import generatePostman from "../lib/plugin/generate_postman";
import generateSwagger from "../lib/plugin/generate_swagger";

describe("文档插件文件名解析", () => {
  // 构造最小可用 docData（插件实际只读少量字段）
  const docData = {
    info: { title: "t", description: "d", host: "http://x", basePath: "" },
    group: {},
    apis: {},
    types: {},
  } as any;

  test("postman 插件应使用 options.postman 作为文件名（而非 options.swagger）", () => {
    const written: string[] = [];
    const writer = (p: string) => written.push(p);

    generatePostman(docData, "/out", { postman: "postman.json", swagger: "swagger.json" } as any, writer);
    expect(written).toHaveLength(1);
    expect(written[0]).toContain("postman.json");
    // 关键：不应写入 swagger.json（回归 bug 的表现）
    expect(written[0]).not.toContain("swagger.json");
  });

  test("swagger 插件应使用 options.swagger 作为文件名", () => {
    const written: string[] = [];
    const writer = (p: string) => written.push(p);

    generateSwagger(docData, "/out", { swagger: "swagger.json", postman: "postman.json" } as any, writer);
    expect(written).toHaveLength(1);
    expect(written[0]).toContain("swagger.json");
  });

  test("axios 插件应使用 options.axios 作为文件名", () => {
    const written: string[] = [];
    const writer = (p: string) => written.push(p);

    generateAxios(docData, "/out", { axios: "sdk.js" } as any, writer);
    expect(written).toHaveLength(1);
    expect(written[0]).toContain("sdk.js");
  });

  test("postman 默认文件名为 postman.json（未指定时）", () => {
    const written: string[] = [];
    const writer = (p: string) => written.push(p);

    generatePostman(docData, "/out", { postman: true } as any, writer);
    expect(written[0]).toContain("postman.json");
  });
});

describe("axios SDK 路径参数生成（issue #27）", () => {
  function captureAxios(api: Record<string, unknown>) {
    let captured = "";
    const writer = (_p: string, data: string) => (captured = data);
    generateAxios(
      {
        info: { title: "t", description: "d", host: "http://x", basePath: "" },
        group: {},
        types: {},
        apis: { "get_/posts/:id": { method: "get", title: "t", ...api } },
      } as any,
      "/out",
      { axios: "sdk.js" } as any,
      writer
    );
    return captured;
  }

  test("声明了 paramsSchema 时，路径参数出现在函数签名里", () => {
    const sdk = captureAxios({
      realPath: "/posts/:id",
      paramsSchema: z.object({ id: z.number() }),
    });
    // 函数签名应包含 id 参数
    expect(sdk).toMatch(/getPostsId\(\s*id/);
    // 请求路径应使用模板插值（生成器把 :id 转成 ${id}，输出带转义反斜杠）
    expect(sdk).toContain("/posts/");
    expect(sdk).toContain("id\\}");
  });

  test("路径含 :id 但未声明 paramsSchema 时，签名仍应补全路径参数（避免生成引用未定义变量的坏代码）", () => {
    const sdk = captureAxios({
      realPath: "/posts/:id",
      // 没有 paramsSchema
    });
    expect(sdk).toMatch(/getPostsId\(\s*id/);
    expect(sdk).toContain("/posts/");
    expect(sdk).toContain("id\\}");
  });

  test("无路径参数时，签名不含多余的路径参数", () => {
    const sdk = captureAxios({
      realPath: "/posts",
    });
    expect(sdk).toMatch(/getPosts\(\s*\)/);
    expect(sdk).toContain("'/posts'");
  });
});
