import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/test/test*.ts'],
    typecheck: {
      tsconfig: './tsconfig.test.json'
    },
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      thresholds: {
        branches: 80,
        functions: 95,
        lines: 80,
        statements: 80
      }
    }
  },
  resolve: {
    alias: {
      'assert': 'node:assert'
    }
  }
})