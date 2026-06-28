# 设计：Biome → Oxlint + Oxfmt 迁移

- 日期：2026-06-27
- 分支：feat/refactor-v2
- 状态：已确认（方案 A），待实现

## 目标

把仓库的 lint/format 工具链从 Biome 迁移到 Oxlint + Oxfmt，重新格式化代码，并尽可能消除 `any` 类型的 lint 提示。

## 背景

- 单包库 `erest`（发布源码 `src/lib`）+ pnpm workspace 示例 `examples`
- 现状：`biome.json` 仅覆盖 `src/**/*.ts` 与 `src/**/*.js`；CI `test.yml` 用 `pnpm run check`（`biome check --write src`）做格式校验
- `any` 分布：`src/lib` 仅 1 处被注释的 `any`（无真实问题）；`src/test` 约 322 处，其中 `as any` 断言 253 处、`: any` 标注 69 处。`test-schema-coverage.ts` 单文件占 192 处，几乎全是构造 Zod `_def` 内部结构以测试文档分支。

## 选定方案：A — oxlint + oxfmt 双工具

- **Oxlint v1.71.0**（稳定）负责 lint
- **Oxfmt v0.56.0**（beta，已 100% 通过 Prettier 测试套件）负责格式化
- 移除 `@biomejs/biome`，删除 `biome.json`

### 配置决策

#### `.oxlintrc.json`

- `plugins`: `["typescript", "import", "unicorn"]`
- `categories`: 启用 `correctness`（error）、`suspicious`（warn）
- `env`: `node: true`
- 规则 `typescript/no-explicit-any`：
  - `src/lib`（发布源码）：`error`
  - `src/test`（测试）：`off` —— 测试中访问私有成员 `(app as any).typeRegistry`、构造 Zod 内部结构 `{ _def: {...} } as any` 是合理工程取舍
- 覆盖范围：`src/**`（与原 Biome 一致）+ `examples/src/**`、`examples/test/**`（纳入现有 Biome 未管的示例 `.js`）

#### `.oxfmtrc.json`

对齐 Biome 现有风格，最小化 diff：

```json
{
  "$schema": "./node_modules/oxfmt/configuration_schema.json",
  "printWidth": 120,
  "quoteStyle": "double"
}
```

> 注：`indentWidth`/`indentStyle` 用 oxfmt 默认（2 空格），与现状一致。

### `any` 清理边界（"尽力清理"）

**清理（可安全替换）：**

1. `(ctx: any)` → 导入 `Context` 类型
2. `(ctx: any, next: any)` / `(ctx, next) =>` 中间件 → 用 `Middleware` 签名（直接去掉参数标注，或写全 `Context`/`() => Promise<void>|void`）
3. 函数参数 `(data: any, options: any, writer: any)` → 收窄到实际接口或 `unknown`
4. `{ api: any }`、`Map<number, any>` 等 → 收窄到实际形状

**保留（在测试目录规则已关闭，无需豁免注释）：**

- `(app as any).typeRegistry` / `(app as any).schemaRegistry` —— 访问私有成员
- `{ _def: { typeName: "ZodString" } } as any` —— 构造 Zod 内部结构测试文档分支
- `null as any` / `undefined as any` —— 故意注入非法值触发错误分支
- `mockAPI as any` 等 mock 断言

> 既然 `no-explicit-any` 在测试目录整体关闭，这些保留的 `any` 不会触发报错；行级禁用注释只在"库代码偶发必须用 any"时才需要（当前库代码无此情况）。

## 变更清单

| # | 文件/操作 | 说明 |
|---|---|---|
| 1 | 删除 `biome.json` | — |
| 2 | `package.json` | 移除 `@biomejs/biome`；新增 `oxlint`、`oxfmt`（devDep）；`format` → `oxfmt --write src examples/src examples/test`；`check` → `oxlint && oxfmt --check src examples/src examples/test` |
| 3 | 新增 `.oxlintrc.json` | 见上 |
| 4 | 新增 `.oxfmtrc.json` | 见上 |
| 5 | `.github/workflows/test.yml` | `pnpm run check` 脚本已改，CI 无需改命令（仍 `pnpm run check`），仅核对语义 |
| 6 | `pnpm install` | 安装新依赖、刷新 lockfile |
| 7 | `pnpm run format` | oxfmt 重新格式化全仓 |
| 8 | 清理 `src/test` 可安全替换的 `any` | 见清理边界 |
| 9 | 验证：`pnpm run check`、`pnpm run test:cov`、`pnpm --filter erest-example test` | 0 lint error + 测试全绿 |

## 验证标准（完成判据）

1. `biome.json` 不存在；`package.json` 不再含 `@biomejs/biome`
2. 存在 `.oxlintrc.json` 与 `.oxfmtrc.json`，配置如上
3. `pnpm run check` 退出码 0（oxlint 0 error + oxfmt --check 通过）
4. `pnpm run format` 后无格式 diff（幂等）
5. `pnpm run test:cov` 全绿，`pnpm --filter erest-example test` 全绿
6. `src/lib` 中 `no-explicit-any` 0 违规；`src/test` 可安全替换的 `any` 已替换，剩余为访问私有成员/构造内部结构的合理断言

## 风险

- oxfmt 仍为 beta：纯格式化工具，beta 风险可控；如格式化引入意外改动，可在 PR review 时发现
- oxlint 规则集与 Biome 不完全对应：可能出现新的 warning（可后续逐条处理），但 `check` 脚本只让 error 阻断，warn 不阻断 CI
