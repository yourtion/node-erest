import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // 源码模式下，adapter 内部的包名导入也必须解析到源码，避免依赖 dist。
    // 未设 ISLIB 的发布产物测试仍走 package.json 的 exports。
    alias: process.env.ISLIB
      ? [{ find: /^erest$/, replacement: fileURLToPath(new URL("./src/lib/index.ts", import.meta.url)) }]
      : [],
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/test/test*.ts"],
    setupFiles: ["src/test/setup.ts"],
    typecheck: {
      tsconfig: "./tsconfig.test.json",
    },
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      thresholds: {
        branches: 80,
        functions: 95,
        lines: 80,
        statements: 80,
      },
    },
  },
});
