/**
 * 测试驱动文档生成脚本（演示 erest「测试即文档」能力）。
 *
 * 与 generate.js 的区别：
 *   - generate.js：只装配实例 + genDocs，不跑请求 → 所有 API 在文档里显示 ❌、无真实示例
 *   - 本脚本：用 test-agent 跑真实请求（.success().takeExample()）→ 文档显示 ✅ + 真实示例
 *
 * 原理（同一 ERest 实例上完成全链路）：
 *   1. .success() / .error() / .raw() 读取响应输出 → 翻转对应路由的 tested 标记 → markdown 标题显示 ✅
 *   2. .takeExample(name)（在 .success() 前调用）→ 把真实 input/headers/output 回填为该路由的示例
 *   3. genDocs() 落盘时，✅ 标记与示例数据一并写入 markdown
 *
 * 运行：npm run docs:test
 */
import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import ERest from "erest";
import { ExpressAdapter } from "@erest/express";
import { API_INFO, GROUPS, registerApi } from "../src/api.js";
import { createStore } from "../src/store.js";
import { authBefore, adminBefore, logMiddleware, timingBefore } from "../src/hooks.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "out-from-test");
mkdirSync(outDir, { recursive: true });

// 装配 ERest 实例（开启 markdown 文档生成）
const store = createStore();
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const api = new ERest({
  info: API_INFO,
  groups: GROUPS,
  forceGroup: true,
  // wiki: 每个分组生成独立 .md（public.md/post.md/admin.md）；index: 生成目录页
  docs: { markdown: true, wiki: true, index: true },
});

registerApi(api, store, {
  authBefore: authBefore(store),
  adminBefore: adminBefore(),
  logMiddleware: logMiddleware(),
  timingBefore: timingBefore(),
});

api.bind({ adapter: new ExpressAdapter(), app, router: express.Router });

// 错误处理中间件（initTest 用 fetch 驱动测试，需错误以 JSON 响应体返回）
app.use((err, _req, res, _next) => {
  res.status(err.statusCode || err.status || 400).json({ error: err.message });
});

// 初始化测试系统（接收 express app，内部 lazy listen 随机端口）
api.initTest(app);

// —— 用 test-agent 跑代表性请求，让文档通过测试变绿（✅）+ 回填真实示例 ——
// 路径用完整 group 前缀（public/ /posts/ /admin/），鉴权用 X-Admin-Token header
const examples = [
  // public 组（无鉴权）
  () => api.test.get("/public/posts").takeExample("已发布文章列表").success(),
  () => api.test.get("/public/posts/hello-erest").takeExample("文章详情").success(),
  // post 组（需 user-token）
  () =>
    api.test
      .get("/posts/posts")
      .headers({ "X-Admin-Token": "user-token" })
      .input({ status: "published" })
      .takeExample("我的文章列表")
      .success(),
  () =>
    api.test
      .post("/posts/posts")
      .headers({ "X-Admin-Token": "user-token" })
      .input({ slug: "test-driven-docs", title: "测试驱动文档", content: "测试即文档" })
      .takeExample("创建文章")
      .success(),
  // admin 组（需 admin-token）
  () => api.test.get("/admin/users").headers({ "X-Admin-Token": "admin-token" }).takeExample("用户列表").success(),
  () => api.test.get("/admin/stats").headers({ "X-Admin-Token": "admin-token" }).takeExample("统计信息").success(),
];

const results = await Promise.allSettled(examples.map((fn) => fn()));
const failures = results.filter((r) => r.status === "rejected");
if (failures.length > 0) {
  for (const f of failures) console.error("  ✗ 请求失败:", f.reason?.message || f.reason);
  process.exit(1);
}

// 生成并保存文档（onExit=false 同步落盘）
api.genDocs(outDir, false);

// 统计 ✅ 覆盖率（遍历分组 md 文件）
let testedCount = 0;
let totalApis = 0;
for (const f of readdirSync(outDir)) {
  if (!f.endsWith(".md")) continue;
  const md = readFileSync(resolve(outDir, f), "utf8");
  testedCount += (md.match(/^## .+ ✅/gm) || []).length;
  totalApis += (md.match(/^## .+ [✅❌]/gm) || []).length;
}

console.log(`测试驱动文档已生成到 ${outDir}/`);
console.log(`  - ${testedCount}/${totalApis} 个路由通过测试变绿 ✅`);
console.log("  - 示例数据来自 test-agent 真实响应（非 mock）");
console.log("\n对比：npm run docs 生成 mock 文档（全部 ❌、无示例）");
