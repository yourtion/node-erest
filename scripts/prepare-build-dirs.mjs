/**
 * 构建前步骤：预创建产物目录并写入 package.json 声明模块格式。
 *
 * 根 package.json 为 "type": "module"（让 src/ 源码被 NodeNext 判定为 ESM，
 * 从而 ESM 构建输出真 ESM 且相对导入带 .js 扩展名）。
 * 因此 CJS 产物目录必须显式声明 "type": "commonjs"，否则被根的 module 误判。
 *
 * 必须在两次 tsc 编译之前执行。
 */
import { writeFileSync, mkdirSync } from "node:fs";

// CJS 产物：显式 commonjs（覆盖根的 type:module）
mkdirSync("dist/lib", { recursive: true });
writeFileSync("dist/lib/package.json", '{"type":"commonjs"}\n');
console.log("prepared dist/lib/package.json (commonjs)");

// ESM 产物：与根一致 module（冗余但明确）
mkdirSync("dist/esm", { recursive: true });
writeFileSync("dist/esm/package.json", '{"type":"module"}\n');
console.log("prepared dist/esm/package.json (module)");
