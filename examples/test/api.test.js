/**
 * 测试集成（演示 erest 的 initTest + api.test 能力）。
 *
 * 用 Express 作为测试载体（initTest 对三框架均支持，这里选最通用的）。
 * 用例覆盖：success / error（校验失败、鉴权失败）/ takeExample（测试结果回填文档示例）。
 *
 * 运行：npm test
 */
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ERest from "erest";
import { ExpressAdapter } from "erest-express";
import { API_INFO, GROUPS, registerApi } from "../src/api.js";
import { createStore } from "../src/store.js";
import { authBefore, adminBefore, logMiddleware, timingBefore } from "../src/hooks.js";

let app;
let api;
let store;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  store = createStore();
  api = new ERest({ info: API_INFO, groups: GROUPS, forceGroup: true });

  registerApi(api, store, {
    authBefore: authBefore(store),
    adminBefore: adminBefore(),
    logMiddleware: logMiddleware(),
    timingBefore: timingBefore(),
  });

  api.bind({ adapter: new ExpressAdapter(), app, router: express.Router });

  // 错误处理中间件（initTest 用 supertest，需要错误以响应体返回）
  app.use((err, _req, res, _next) => {
    res.status(err.statusCode || err.status || 400).json({ error: err.message });
  });

  // 初始化测试系统（接收 express app）
  api.initTest(app);
});

afterAll(() => {
  /* express app 无需显式关闭 */
});

// ============ public 组（无需鉴权）============
describe("public 组", () => {
  it("GET /public/posts 返回已发布文章列表", async () => {
    const ret = await api.test.get("/public/posts").success();
    expect(ret.posts).toBeInstanceOf(Array);
    expect(ret.posts.length).toBeGreaterThan(0);
    expect(ret.posts[0]).toHaveProperty("slug", "hello-erest");
  });

  it("GET /public/posts/:slug 返回文章详情", async () => {
    const ret = await api.test.get("/public/posts/hello-erest").success();
    expect(ret.post.title).toBe("Hello ERest");
  });

  it("GET /public/posts/:slug 不存在时失败", async () => {
    const err = await api.test.get("/public/posts/not-exist").error();
    expect(err).toBeInstanceOf(Error);
  });
});

// ============ post 组（需登录）============
describe("post 组（需登录）", () => {
  it("无 token 时 GET /posts/posts 失败（鉴权）", async () => {
    const err = await api.test.get("/posts/posts").error();
    expect(err).toBeInstanceOf(Error);
  });

  it("带 user-token 时 GET /posts/posts 成功", async () => {
    const ret = await api.test.get("/posts/posts").headers({ "X-Admin-Token": "user-token" }).success();
    expect(ret.posts).toBeInstanceOf(Array);
  });

  it("带 user-token 时 POST /posts/posts 创建文章", async () => {
    const ret = await api.test
      .post("/posts/posts")
      .headers({ "X-Admin-Token": "user-token" })
      .input({ slug: "new-post", title: "新文章", content: "内容" })
      .takeExample("创建文章")
      .success();
    expect(ret.post).toHaveProperty("slug", "new-post");
  });

  it("POST /posts/posts slug 非法时失败（校验）", async () => {
    const err = await api.test
      .post("/posts/posts")
      .headers({ "X-Admin-Token": "user-token" })
      .input({ slug: "Invalid Slug!", title: "x", content: "y" })
      .error();
    expect(err).toBeInstanceOf(Error);
  });

  it("PUT /posts/posts/:id 更新文章", async () => {
    const ret = await api.test
      .put("/posts/posts/1")
      .input({ title: "更新标题" })
      .headers({ "X-Admin-Token": "user-token" })
      .success();
    expect(ret.post.title).toBe("更新标题");
  });
});

// ============ admin 组（需管理员）============
describe("admin 组（需管理员）", () => {
  it("user-token 访问 /admin/users 失败（权限不足）", async () => {
    const err = await api.test.get("/admin/users").headers({ "X-Admin-Token": "user-token" }).error();
    expect(err).toBeInstanceOf(Error);
  });

  it("admin-token 访问 /admin/users 成功", async () => {
    const ret = await api.test
      .get("/admin/users")
      .headers({ "X-Admin-Token": "admin-token" })
      .takeExample("用户列表")
      .success();
    expect(ret.users).toBeInstanceOf(Array);
    expect(ret.users.length).toBeGreaterThan(0);
  });

  it("admin-token 访问 /admin/stats 返回统计", async () => {
    const ret = await api.test.get("/admin/stats").headers({ "X-Admin-Token": "admin-token" }).success();
    expect(ret).toHaveProperty("users");
    expect(ret).toHaveProperty("posts");
  });

  it("define 定义的 DELETE /admin/users/:id 可访问", async () => {
    // define 路由未走 registerTyped，直接验证可访问
    const ret = await api.test.delete("/admin/users/1").headers({ "X-Admin-Token": "admin-token" }).success();
    expect(ret).toHaveProperty("success", true);
  });
});
