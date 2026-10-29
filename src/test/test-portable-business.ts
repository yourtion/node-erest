/** Reuse the actual blog business package; only framework host wiring changes. */
import { describe, expect, it } from "vitest";
import ERest from "erest";
import { frameworks, listen } from "./frameworks.js";
import { registerApi, API_INFO, GROUPS } from "../../examples/src/api.js";
import { createStore } from "../../examples/src/store.js";
import { authBefore, adminBefore, logMiddleware, timingBefore } from "../../examples/src/hooks.js";

const user = { "X-Admin-Token": "user-token" };
const admin = { "X-Admin-Token": "admin-token" };
const jsonUser = { ...user, "content-type": "application/json" };
const cases = [
  { title: "public list", path: "/public/posts", status: 200, expected: { posts: [{ slug: "hello-erest" }] } },
  {
    title: "public detail",
    path: "/public/posts/hello-erest",
    status: 200,
    expected: { post: { title: "Hello ERest" } },
  },
  { title: "missing post", path: "/public/posts/not-exist", status: 404, expected: { code: "NOT_FOUND" } },
  { title: "authentication", path: "/posts/posts", status: 401, expected: { code: "PERMISSION_DENIED" } },
  {
    title: "authenticated list",
    path: "/posts/posts?slug=hello-erest",
    init: { headers: user },
    status: 200,
    expected: { posts: [{ slug: "hello-erest" }] },
  },
  {
    title: "requiredOneOf",
    path: "/posts/posts",
    init: { headers: user },
    status: 400,
    expected: { code: "MISSING_PARAM" },
  },
  {
    title: "create",
    path: "/posts/posts",
    init: {
      method: "POST",
      headers: jsonUser,
      body: JSON.stringify({ slug: "contract-post", title: "Contract", content: "body" }),
    },
    status: 201,
    expected: { post: { id: 2, slug: "contract-post", title: "Contract" } },
  },
  {
    title: "invalid create",
    path: "/posts/posts",
    init: {
      method: "POST",
      headers: jsonUser,
      body: JSON.stringify({ slug: "Invalid Slug!", title: "x", content: "y" }),
    },
    status: 400,
    expected: { code: "INVALID_PARAM" },
  },
  {
    title: "update",
    path: "/posts/posts/1",
    init: { method: "PUT", headers: jsonUser, body: JSON.stringify({ title: "Updated" }) },
    status: 200,
    expected: { post: { id: 1, title: "Updated" } },
  },
  {
    title: "authorization",
    path: "/admin/users",
    init: { headers: user },
    status: 403,
    expected: { code: "PERMISSION_DENIED" },
  },
  {
    title: "admin users",
    path: "/admin/users",
    init: { headers: admin },
    status: 200,
    expected: {
      users: [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ],
    },
  },
  {
    title: "admin stats",
    path: "/admin/stats",
    init: { headers: admin },
    status: 200,
    expected: { users: 2, posts: 1, published: 1 },
  },
  {
    title: "declarative delete",
    path: "/admin/users/1",
    init: { method: "DELETE", headers: admin },
    status: 200,
    expected: { success: true, deleted: 1 },
  },
];

describe.each(frameworks)("unchanged blog business: $name", (framework) => {
  it.each(cases)("$title", async ({ path, init, status, expected }) => {
    const store = createStore();
    const service = new ERest({ info: API_INFO, groups: GROUPS, forceGroup: true });
    registerApi(service, store, {
      authBefore: authBefore(store),
      adminBefore: adminBefore(),
      logMiddleware: logMiddleware(),
      timingBefore: timingBefore(),
    });
    const host = await listen(framework.server(service, true));
    try {
      const res = await host.request(path, init);
      expect(res.status).toBe(status);
      expect(res.headers.get("content-type")?.split(";")[0]).toBe("application/json");
      expect(await res.json()).toMatchObject(expected);
    } finally {
      await host.close();
    }
  });
});
