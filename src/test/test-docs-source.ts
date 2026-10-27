import { describe, expect, test } from "vitest";
import lib from "./lib";

describe("公开文档的源码位置（#196 / #5）", () => {
  test("真实注册到 buildDocData 和两个 JSON writer 均不泄露绝对路径", () => {
    const service = lib({ docs: { json: true, all: true, wiki: true } });
    const route = service.api.get("/source").group("Index").title("Source");
    route.register(() => {});
    const internal = { ...route.options.sourceFile };
    expect(internal.absolute).toContain("test-docs-source.ts");
    expect(internal.relative).toBe("test-docs-source.ts");
    service.buildSwagger();
    const data = service.api.docs!.buildDocData();
    expect(Object.values(data.apis)[0].sourceFile).toEqual({ relative: internal.relative });
    service.buildSwagger();
    const files = new Map<string, string>();
    service.setDocWritter((path, content) => files.set(path, content));
    service.genDocs("/docs", false);
    for (const filename of ["/docs/doc.json", "/docs/all.json"]) {
      const content = files.get(filename)!;
      expect(content).not.toContain('"absolute"');
      expect(content).not.toContain(internal.absolute);
      expect(Object.values(JSON.parse(content).apis)[0]).toMatchObject({ sourceFile: { relative: internal.relative } });
    }
    expect([...files.values()].some((content) => content.includes("源码位置：`test-docs-source.ts`"))).toBe(true);
    expect(route.options.sourceFile).toEqual(internal);
  });

  test("未找到源码位置时 Markdown 省略该行，JSON 不含 absolute", () => {
    const service = lib({ path: "/missing-project", docs: { json: true, all: true, wiki: true } });
    service.api
      .get("/missing")
      .group("Index")
      .title("Missing")
      .register(() => {});
    service.buildSwagger();
    const files = new Map<string, string>();
    service.setDocWritter((path, content) => files.set(path, content));
    service.genDocs("/docs", false);
    expect([...files.values()].join("\n")).not.toContain("源码位置：");
    expect(files.get("/docs/doc.json")).not.toContain('"absolute"');
  });
});
