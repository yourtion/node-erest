import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 测试文件在 test/ 目录
    include: ['test/**/*.test.js'],
    // initTest 内部用 Node 18+ 内置 fetch（v3 起不再依赖 supertest），需在 node 环境运行
    environment: 'node',
  },
});
