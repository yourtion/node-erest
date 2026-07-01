/**
 * @file 文档插件回归测试
 * @author Yourtion Guo <yourtion@gmail.com>
 *
 * 验证各文档生成插件解析到正确的输出文件名（避免互相覆盖）。
 * 回归：generate_postman 此前误用 options.swagger 作为文件名，导致 postman.json
 * 内容被写入 swagger.json（与 swagger 插件冲突、互相覆盖）。
 */
import { describe, expect, test } from "vitest";
import generateAxios from "../lib/plugin/generate_axios";
import apiDocs from "../lib/plugin/generate_markdown/apis";
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

describe("markdown 源码位置展示（issue #5）", () => {
  function buildWith(sourceFile?: { relative?: string }) {
    const data = {
      info: {},
      group: { G: "G" },
      types: {},
      apis: {
        "get_/test": {
          method: "get",
          path: "/test",
          realPath: "/test",
          group: "G",
          title: "测试路由",
          examples: [],
          requiredOneOf: [],
          ...(sourceFile ? { sourceFile } : {}),
        },
      },
    } as any;
    return apiDocs(data);
  }

  test("有 sourceFile.relative 时，Markdown 输出含源码位置", () => {
    const { list } = buildWith({ relative: "src/api/user.ts" });
    const content = list[0].content;
    expect(content).toContain("src/api/user.ts");
  });

  test("无 sourceFile 时不报错，且不输出源码位置行", () => {
    const { list } = buildWith(undefined);
    const content = list[0].content;
    expect(content).not.toMatch(/源码位置/);
  });
});
