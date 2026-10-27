import { describe, expect, test } from "vitest";
import lib from "./lib";

function authCheck() {}
function logRequest() {}

function registeredMarkdown(middlewares: unknown[]) {
  const service = lib({ docs: { markdown: true, all: true, wiki: false } });
  service.api
    .get("/middleware")
    .group("Index")
    .title("Middleware")
    .middlewares(...middlewares)
    .register(() => {});
  service.buildSwagger();
  const files = new Map<string, string>();
  service.setDocWritter((path, content) => files.set(path, content));
  service.genDocs("/docs", false);
  return [...files]
    .filter(([path]) => path.endsWith(".md"))
    .map(([, content]) => content)
    .join("\n");
}

describe("真实路由中间件注册到 Markdown（#197 / #4）", () => {
  test("按注册顺序输出具名中间件，重复函数只出现一次", () => {
    const content = registeredMarkdown([authCheck, logRequest, authCheck]);
    expect(content).toContain("中间件：`authCheck`, `logRequest`");
  });
  test("没有中间件时省略该行", () => {
    expect(registeredMarkdown([])).not.toContain("中间件：");
  });
  test("真正的无名函数不会被变量名推断掩盖", () => {
    const anonymousMiddleware = [function () {}][0];
    expect(anonymousMiddleware.name).toBe("");
    expect(registeredMarkdown([anonymousMiddleware])).not.toContain("中间件：");
  });
  test("混合具名、真正无名和 Function 构造器中间件", () => {
    const anonymousMiddleware = [function () {}][0];
    const constructorMiddleware = new Function("");
    expect(constructorMiddleware.name).toBe("anonymous");
    expect(registeredMarkdown([anonymousMiddleware, authCheck, constructorMiddleware, logRequest])).toContain(
      "中间件：`authCheck`, `logRequest`"
    );
  });
  test("推断出有效变量名的函数仍会展示", () => {
    const inferredMiddleware = function () {};
    expect(inferredMiddleware.name).toBe("inferredMiddleware");
    expect(registeredMarkdown([inferredMiddleware])).toContain("中间件：`inferredMiddleware`");
  });
});
