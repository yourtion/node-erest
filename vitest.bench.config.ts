import { defineConfig } from "vitest/config";

// Bench 配置：独立于常规测试，仅在 `pnpm run bench` 时运行
// 默认 test:lib 的 include 是 src/test/test*.ts，不会匹配本目录
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/bench/**/*.bench.ts"],
  },
});
