#!/usr/bin/env node
/**
 * 全局发布脚本：发布 erest 核心 + 各 adapter 子包到 npm。
 *
 * 根因修复：pnpm publish 默认只替换 dependencies/devDependencies/optionalDependencies
 * 里的 workspace 协议，**不处理 peerDependencies**。实测打包出的 manifest 里
 * `peerDependencies.erest` 仍是 `"workspace:^"`，npm install 会报 EUNSUPPORTEDPROTOCOL。
 *
 * 本脚本的做法：发布前把每个子包 package.json 的 peerDependencies 里 `workspace:^` /
 * `workspace:*` 替换为实际版本号写入磁盘，调用 pnpm publish 后（无论成功失败）恢复原文件。
 *
 * 用法：
 *   node scripts/publish.mjs            # 实际发布
 *   node scripts/publish.mjs --dry-run  # 预览将要发布的内容，不真正发布
 *
 * 前置：已 `pnpm run build && pnpm run build:packages`（脚本不替你构建）。
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const isDryRun = process.argv.includes("--dry-run");

/** 需要发布的子包（目录名 -> npm 包名） */
const PACKAGES = [
  { dir: "", name: "erest" }, // 核心包在根目录
  { dir: "packages/erest-express", name: "@erest/express" },
  { dir: "packages/erest-koa", name: "@erest/koa" },
  { dir: "packages/erest-leizmweb", name: "@erest/leizmweb" },
  { dir: "packages/erest-gen", name: "@erest/gen" },
];

/**
 * 把 obj 中所有值为 workspace 协议（workspace:^ / workspace:* / workspace:~）的字段
 * 替换为实际版本范围。返回 { patched, original }。
 */
function patchWorkspaceDeps(obj, coreVersion) {
  if (!obj || typeof obj !== "object") return { patched: obj, original: obj };
  const patched = { ...obj };
  const original = { ...obj };
  let changed = false;
  for (const [dep, spec] of Object.entries(obj)) {
    if (typeof spec !== "string") continue;
    const m = spec.match(/^workspace:(\^|~|\*)?(.*)$/);
    if (!m) continue;
    const range = m[1] || "^";
    // 替换为指向 erest 核心包实际版本（子包 peer/dev 的 erest 总是核心包版本）
    patched[dep] = range === "*" ? coreVersion : `${range}${coreVersion}`;
    changed = true;
  }
  return changed ? { patched, original } : { patched: obj, original: obj };
}

function run() {
  // 1. 读取核心包版本，作为所有 workspace 协议替换的目标版本
  const rootPkgPath = path.join(ROOT, "package.json");
  const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf8"));
  const coreVersion = rootPkg.version;
  console.log(`▶ 发布 erest@${coreVersion}（dry-run=${isDryRun}）`);

  // 2. 逐个处理子包：patch peerDependencies -> publish -> 还原
  const backups = []; // { pkgPath, original }
  for (const { dir, name } of PACKAGES) {
    const pkgPath = path.join(ROOT, dir, "package.json");
    const raw = readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw);

    // patch peerDependencies（pnpm 不替换的盲区）+ devDependencies（保险起见）
    const peer = patchWorkspaceDeps(pkg.peerDependencies, coreVersion);
    const dev = patchWorkspaceDeps(pkg.devDependencies, coreVersion);
    const dep = patchWorkspaceDeps(pkg.dependencies, coreVersion);

    const merged = {
      ...pkg,
      ...(peer.patched !== pkg.peerDependencies ? { peerDependencies: peer.patched } : {}),
      ...(dev.patched !== pkg.devDependencies ? { devDependencies: dev.patched } : {}),
      ...(dep.patched !== pkg.dependencies ? { dependencies: dep.patched } : {}),
    };

    backups.push({ pkgPath, original: raw });
    writeFileSync(pkgPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
  }

  // 3. 调用 pnpm publish（在 patch 状态下）
  const cwd = isDryRun ? undefined : undefined;
  const failures = [];
  try {
    for (const { dir, name } of PACKAGES) {
      const args = ["publish", "--no-git-checks", "--access", "public"];
      if (isDryRun) args.push("--dry-run");
      try {
        console.log(`\n▶ 发布 ${name} (${dir || "root"})`);
        execFileSync("pnpm", args, {
          cwd: dir ? path.join(ROOT, dir) : ROOT,
          stdio: "inherit",
        });
        console.log(`✓ ${name} 发布完成`);
      } catch (err) {
        failures.push(name);
        console.error(`✗ ${name} 发布失败:`, err.message);
      }
    }
  } finally {
    // 4. 无论成功失败，恢复所有 package.json 原文件
    console.log("\n▶ 恢复 package.json 原文件");
    for (const { pkgPath, original } of backups) {
      writeFileSync(pkgPath, original, "utf8");
    }
  }

  if (failures.length > 0) {
    console.error(`\n✗ 以下包发布失败: ${failures.join(", ")}`);
    process.exit(1);
  }
  console.log("\n✓ 全部发布完成（package.json 已还原）");
}

run();
