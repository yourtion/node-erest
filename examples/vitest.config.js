import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 测试文件在 test/ 目录
    include: ['test/**/*.test.js'],
    // initTest 内部 require supertest，需在 node 环境运行
    environment: 'node',
  },
});
