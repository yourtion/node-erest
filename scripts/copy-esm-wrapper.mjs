/**
 * 构建后步骤：将 ESM 互操作入口复制到 dist/lib/。
 *
 * tsc 不处理 .mjs 文件，故需手动拷贝 src/lib/esm-wrapper.mjs → dist/lib/esm-wrapper.mjs，
 * 使 package.json 的 exports["."].import 条件能解析到它。
 */
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const files = [
  ["src/lib/esm-wrapper.mjs", "dist/lib/esm-wrapper.mjs"],
  ["src/lib/esm-wrapper.d.mts", "dist/lib/esm-wrapper.d.mts"],
];

await mkdir(resolve(root, "dist/lib"), { recursive: true });
for (const [src, dest] of files) {
  await copyFile(resolve(root, src), resolve(root, dest));
  console.log(`copied ${src} → ${dest}`);
}
