# 贡献指南

[返回首页](README.md) · [架构与修改约定](AGENTS.md) · [发布流程](RELEASING.md)

## 环境与构建

建议使用 Node.js 24、pnpm 9。仓库是 pnpm workspace，核心包和五个公开子包一起构建。

```bash
pnpm install --frozen-lockfile
pnpm run build
pnpm run build:packages
```

源码修改位置、Zod 内部结构访问和版本约定见 [AGENTS.md](AGENTS.md)。
涉及公开 API/行为/依赖的修改，同步更新六个包的版本和 [MIGRATION.md](MIGRATION.md)。

## 常用检查

| 命令 | 用途 |
| --- | --- |
| `pnpm run check` | lint 和格式检查 |
| `pnpm run format` | 格式化源码与示例 |
| `pnpm run test:lib` | 源码测试，自动设置 ISLIB，无需先构建 |
| `pnpm run test:contract` | OpenAPI、SDK、运行时的合约专项 |
| `pnpm run test:cov` | 源码测试与覆盖率门槛 |
| `pnpm test` | 构建核心/子包，验证发布产物并运行示例测试 |
| `pnpm run test:h3-types` | H3 handler 的 Raw/State 与适配器兼容性类型检查 |
| `pnpm run test:release` | 发布工具的校验、模拟发布及失败重跑测试 |
| `pnpm run bench` | 性能基准 |

完整 PR 检查的定义以 [test.yml](.github/workflows/test.yml) 为准。
文档修改重点检查命令、示例和相对链接；无需为纯文字改动重复运行全部运行时测试。

## HTTP 接入性能评测

`pnpm run bench` 测参数校验。比较接入 erest 前后的 HTTP 开销，先按上面的环境准备步骤
安装依赖并构建核心包与适配器，再执行以下命令（macOS、Linux 均可）：

```bash
node benchmarks/run.mjs
node benchmarks/report.mjs benchmarks/results/latest.json
```

脚本对 Express、Koa、@leizm/web、H3 分别比较原生路由、原生路由加同等 Zod 校验、erest，
覆盖无 schema 的 GET、带路径/query/body 校验的 POST，以及增加 5ms 异步等待的 POST。
默认单并发与 50 并发、预热 1.5 秒、采样 3 秒、重复三轮，完整执行约需十二分钟。
报告包含吞吐、延迟分位数、客户端/服务端 CPU、内存快照和轮间波动。

macOS 本地复测可先聚焦 50 并发的 POST，增加预热和重复轮数（四框架共 84 次采样，约需十二分钟）：

```bash
BENCH_SCENARIOS=post BENCH_CONCURRENCY=50 \
  BENCH_ROUNDS=7 BENCH_MS=5000 BENCH_WARMUP_MS=3000 \
  BENCH_OUT=benchmarks/results/mac-post.json node benchmarks/run.mjs
node benchmarks/report.mjs benchmarks/results/mac-post.json
open benchmarks/results/mac-post.html
```

同一轮对照使用相同 Node 版本和 lockfile，尽量减少其他 CPU 密集任务。比较 Mac 和云端
结果时，重点看各自环境中“原生 + Zod → erest”的相对变化、每请求 CPU 和轮间波动，
不要直接比较两台机器的绝对 QPS；客户端 CPU 接近饱和时，观察到的吞吐也可能受发压能力限制。

Linux 下可选用两个不同的、当前进程允许使用的 CPU 固定客户端和服务端；macOS 不设置
`BENCH_SERVER_CPU`，由操作系统调度：

```bash
BENCH_SERVER_CPU=0 taskset -c 1 node benchmarks/run.mjs
```

`BENCH_FRAMEWORKS=express`、`BENCH_SCENARIOS=post`、`BENCH_CONCURRENCY=50` 可筛选场景；
`BENCH_ROUNDS`、`BENCH_MS`、`BENCH_WARMUP_MS` 调整轮数和时长，`BENCH_OUT` 指定 JSON 输出。
快速试跑只检查响应一致性和非法输入拒绝，不能用于性能结论：

```bash
BENCH_ROUNDS=1 BENCH_MS=100 BENCH_WARMUP_MS=100 \
  BENCH_OUT=benchmarks/results/smoke.json node benchmarks/run.mjs
```

`benchmarks/results/` 下的 JSON、CSV 和 HTML 都是被忽略的本地生成物，不随工具提交。
短测结果不是线上容量结论；只有在独立复测中出现一致趋势后，才适合讨论运行时优化。

### 隔离优化实验

`benchmarks/experiments/prepare.mjs` 将已构建产物复制到被忽略的结果目录，生成带哈希的实验清单，
不改动 `src/` 或原始 `dist/`。各变体的兼容性限制记录在清单中，诊断变体不能直接用于发布。

```bash
node benchmarks/experiments/prepare.mjs
BENCH_VARIANTS_FILE=benchmarks/results/experiments/manifest.json \
  BENCH_SCENARIOS=post BENCH_CONCURRENCY=50 BENCH_ROUNDS=3 \
  BENCH_MS=3000 BENCH_WARMUP_MS=2000 \
  BENCH_OUT=benchmarks/results/experiments/screen.json node benchmarks/run.mjs
node benchmarks/experiments/report.mjs benchmarks/results/experiments/screen.json
```

`BENCH_VARIANTS` 可选择清单中的变体（逗号分隔）；每轮同时测量原生加 Zod、现有 erest 和所选变体。
报告按同框架、场景、并发、轮次配对，与 erest 对照比较；轮间范围不是置信区间。
`BENCH_PROFILE_DIR` 可单独采集服务端 CPU profile；开启 profiler 的结果只用于定位，不参与收益比较。
报告脚本可传入多个完整结果文件，将各阶段原始数据和比较合并到 `mac-optimization.json`，并生成 HTML。
也可只传入合并后的 JSON 重新生成报告，无需保留中间数据文件。
采集 profile 后运行 `node benchmarks/experiments/summarize-profiles.mjs`，生成带环境、原始 profile 哈希和采样窗口说明的定位摘要。

## 合约专项

`test:contract` 在 Express、Koa、LeizmWeb、H3 下执行同一套 GET/POST/PUT/PATCH/DELETE 定义。
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
基线只有在语义输入与运行环境兼容时才复用；不兼容时自动全量运行。可用 `mutation:full` 强制重建本地基线。

[Mutation Testing](.github/workflows/mutation.yml) 工作流使用 Node.js 24 和 pnpm 9：
面向 main 的 PR 只读取兼容的主分支基线，main 成功运行后才写入共享基线。
兼容性规则由 [mutation-cache-inputs.json](.github/mutation-cache-inputs.json) 和
[baseline-inputs.mjs](.github/scripts/baseline-inputs.mjs) 定义：默认哈希所有 Git 跟踪文件，
只有经过审查并登记的非语义文件或字段可豁免。当前仅排除 README 内容及根包 version 字段；
依赖声明、lockfile、其他文档、测试、适配器、配置和运行环境仍参与兼容性检查。
本地包装器也使用同一清单并验证伴随的 `.inputs.json`；缺少或不兼容的元数据会触发全量运行。
手动触发并选择 `full` 可强制重建，只有 main 的成功运行会更新共享基线。
报告作为 `mutation-reports-*` artifact 保留 14 天。当前未设置最低变异分数门槛。

## 依赖与安全检查

[Dependabot 配置](.github/dependabot.yml) 将 GitHub Actions、根 npm 和 examples npm 的
`open-pull-requests-limit` 设为 `0`，暂停普通版本升级 PR；需要升级时由维护者单独评估。
该选项不限制安全更新 PR，详见 [GitHub 配置说明](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#open-pull-requests-limit)。
安全更新和漏洞告警仍由仓库后台设置控制，本次配置调整不改动这些开关。
CodeQL 工作流继续保留。已有依赖 PR 留待逐项审阅，不批量关闭。

## 维护文档

- [README](README.md) 保留安装、可运行的快速开始和导航。
- `guides/` 放使用说明；[examples/README.md](examples/README.md) 说明示例工程。
- 本文件记录开发检查；发布维护操作集中在 [RELEASING.md](RELEASING.md)。
- [MIGRATION.md](MIGRATION.md) 按版本记录升级动作和可见行为变化。

类型参考由 `pnpm run doc` 生成到 `docs/`；该目录是被忽略的构建产物目录，手写指南放在 `guides/`。
[文档工作流](.github/workflows/docs.yml) 当前在 master 推送或手动触发时构建和部署 TypeDoc。
线上参考：<https://yourtion.github.io/node-erest/>。
