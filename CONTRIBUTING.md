# 贡献指南

[返回首页](README.md) · [架构与修改约定](AGENTS.md) · [发布流程](RELEASING.md)

## 环境与构建

建议使用 Node.js 24、pnpm 9。仓库是 pnpm workspace，核心包和四个公开子包一起构建。

```bash
pnpm install --frozen-lockfile
pnpm run build
pnpm run build:packages
```

源码修改位置、Zod 内部结构访问和版本约定见 [AGENTS.md](AGENTS.md)。
涉及公开 API/行为/依赖的修改，同步更新五个包的版本和 [MIGRATION.md](MIGRATION.md)。

## 常用检查

| 命令 | 用途 |
| --- | --- |
| `pnpm run check` | lint 和格式检查 |
| `pnpm run format` | 格式化源码与示例 |
| `pnpm run test:lib` | 源码测试，自动设置 ISLIB，无需先构建 |
| `pnpm run test:contract` | OpenAPI、SDK、运行时的合约专项 |
| `pnpm run test:cov` | 源码测试与覆盖率门槛 |
| `pnpm test` | 构建核心/子包，验证发布产物并运行示例测试 |
| `pnpm run test:release` | 发布工具的校验、模拟发布及失败重跑测试 |
| `pnpm run bench` | 性能基准 |

完整 PR 检查的定义以 [test.yml](.github/workflows/test.yml) 为准。
文档修改重点检查命令、示例和相对链接；无需为纯文字改动重复运行全部运行时测试。

## 合约专项

`test:contract` 在 Express、Koa、LeizmWeb 下执行同一套 GET/POST/PUT/PATCH/DELETE 定义。
测试经公开入口生成 OpenAPI 3、Swagger 2 和完整 Axios ESM SDK，再发起真实 HTTP 请求：

- Swagger Parser 检查文档规范；独立 Ajv 校验实际参数与响应。
- 检查参数来源、数组、union/nullable、默认值、长度/范围边界与错误返回。
- 另有递归引用、重叠 union、命名响应及文档写入的专项。

主要用例位于 [test-contract-consistency.ts](src/test/test-contract-consistency.ts) 和
[test-openapi.ts](src/test/test-openapi.ts)。这些用例自动纳入全量测试。

## 变异测试

[StrykerJS](https://stryker-mutator.io/) 用于发现测试覆盖或断言的缺口，需要 Node.js 22+。
配置见 [stryker.config.json](stryker.config.json)，范围为 `src/lib/**/*.ts`。

```bash
pnpm run mutation              # 默认增量运行；无基线时全量运行
pnpm run mutation:incremental  # 显式增量，与上面的命令等价
pnpm run mutation:full         # 忽略已有结果，重建基线
```

首次全量运行可能较慢。HTML 报告位于 `reports/mutation/mutation.html`，增量基线位于
`reports/stryker-incremental.json`；这些生成物不提交。分数用于定位存活变异，不要求追求 100%。
依赖、配置、辅助代码或运行环境变化后，可用 `mutation:full` 重建本地基线。

[Mutation Testing](.github/workflows/mutation.yml) 工作流使用 Node.js 24 和 pnpm 9：
面向 main 的 PR 只读取兼容的主分支基线，main 成功运行后才写入共享基线。
兼容性输入包括依赖、配置、测试辅助文件及适配器源码；基线缺失或不兼容时自动全量运行。
手动触发并选择 `full` 可强制重建，只有 main 的成功运行会更新共享基线。
报告作为 `mutation-reports-*` artifact 保留 14 天。当前未设置最低变异分数门槛。

## 维护文档

- [README](README.md) 保留安装、可运行的快速开始和导航。
- `guides/` 放使用说明；[examples/README.md](examples/README.md) 说明示例工程。
- 本文件记录开发检查；发布维护操作集中在 [RELEASING.md](RELEASING.md)。
- [MIGRATION.md](MIGRATION.md) 按版本记录升级动作和可见行为变化。

类型参考由 `pnpm run doc` 生成到 `docs/`；该目录是被忽略的构建产物目录，手写指南放在 `guides/`。
[文档工作流](.github/workflows/docs.yml) 当前在 master 推送或手动触发时构建和部署 TypeDoc。
线上参考：<https://yourtion.github.io/node-erest/>。
