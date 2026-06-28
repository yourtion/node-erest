# 阶段 3：可观测性 Hook + AI 友好（表层）

- 日期：2026-06-27
- 分支：`feat/refactor-v2`
- 阶段：3 / 3（表层）
- 状态：设计已确认，待 plan
- 关联：总览 `2026-06-27-refactor-v2-overview.md`；依赖阶段 2 重组后的清晰模块边界与生命周期

## 目标

架构定型后，补齐两块"让 erest 既能被运维体系消费、又能被 AI 高效编码"的能力：

1. **可观测性 hook**：暴露请求生命周期的结构化事件，可被日志/监控/tracing 消费
2. **AI 友好表层**：AGENTS.md 导航文档 + Codegen 脚手架，降低 AI 与新人的上手成本

> 放最后：hook 要挂在阶段 2 重组后的稳定生命周期上；AI 文档依赖架构定型，避免反复返工。

---

## §A — S5：可观测性 Hook

### 当前问题（证据）

- 全仓只有 `debug` 模块（`src/lib/debug.ts`），输出非结构化字符串
- adapter 用 `.catch(next)` / `.catch(err => next(err))` 把错误甩给框架错误中间件（`express.ts:67`），**丢失了 erest 自己的错误上下文**（`ERestError` 的 code/details/statusCode）
- 无请求计时、无校验耗时、无 hook 生命周期
- before/middleware/handler 之间靠 `ctx.state` 手动传递上下文，无统一注入点

### 设计：生命周期事件

在阶段 2 的 `Context`（已存在的 `adapters/types.ts`）基础上，新增**生命周期 hook 注入点**。hook 是同步分发的观察者，不参与控制流（不阻断、不改返回值），保证热路径零额外开销（无订阅者时短路）。

```typescript
// 核心：ERest 实例可注册生命周期监听器
const api = new ERest({
  groups: { user: '用户' },
  hooks: {
    onRequest(ctx)      { /* 计时开始、注入 traceId */ },
    onValidate(ctx, result) { /* 记录校验耗时、失败字段 */ },
    onError(ctx, err)   { /* 结构化错误日志（保留 ERestError.code/details） */ },
    onResponse(ctx)     { /* 计时结束、状态码、路径 */ },
  },
});
```

### Hook 契约

| Hook | 触发时机 | 入参 | 用途 |
|------|---------|------|------|
| `onRequest` | 进入 erest 中间件链最开始 | `ctx` | 注入 traceId、开始计时、访问日志 |
| `onValidate` | 参数校验完成后 | `ctx`, `LayeredParams \| ERestError` | 记录校验耗时、失败的 schema 路径 |
| `onError` | 链中任一中间件/handler 抛错时 | `ctx`, `ERestError` | **结构化错误**（code/details/statusCode），区别于框架原生错误 |
| `onResponse` | 链正常结束、响应已写入 | `ctx` | 结束计时、状态码、慢请求标记 |

### 性能保证（对齐阶段 1 的零分配原则）

- **无订阅者时零开销**：`ERest` 在 `bind()` 阶段检查 `hooks` 是否为空对象，若空则 `bindRoute` 装配的 dispatch 闭包**不包含任何 hook 调用代码**（编译期裁剪，运行时无分支判断）
- **有订阅者时最小开销**：hook 调用是直接函数调用，不构造额外事件对象（`ctx` 本身复用，`LayeredParams` 是阶段 1 已返回的引用）
- bench 必须验证：有/无 hook 时热路径分配无差异

### 结构化日志（可选增强）

提供内置的 `structuredLogger` 工具（非默认开启），把 hook 事件转为 JSON 日志行。这是可选便利层，不强制——用户可直接对接 pino/winston/OTel。

### 与阶段 2 的衔接

- hook 注入点在阶段 2 重组后的 `compose()` 调度器内（已存在的 `adapters/utils.ts`）
- `onError` 修复"错误上下文丢失"：在 dispatch 的 catch 中，若 err 是 `ERestError` 则带完整 code/details 触发 `onError`，再决定是否转交框架错误中间件

---

## §B — S6：AI 友好（AGENTS.md + Codegen）

### S6.1 — AGENTS.md 导航文档

#### 为什么需要

erest 当前文档全是面向**人类**的（README 讲使用、typedoc 讲 API）。AI（Claude/Cursor/Copilot）进入项目时缺乏"架构地图"——它不知道哪个目录管什么、改 X 应该看哪里、有哪些约定不该违反。这导致 AI 给出的修改经常打错文件或破坏约定。

#### 内容结构

在仓库根创建 `AGENTS.md`（同时提供 `CLAUDE.md` 软链接或 include，适配各 AI 工具）：

```markdown
# erest 架构导航（给 AI 与新人）

## 一图看懂
[目录树 + 每个目录一句话职责]

## 改 X 去 Y（决策树）
- 改参数校验 → core/api-route.ts + params 校验逻辑
- 加新框架适配 → packages/erest-<fw>/，继承 BaseAdapter
- 改文档生成 → plugins/<format>/ + plugins/zod-meta.ts
- 加生命周期 hook → core/compose.ts + hooks 契约表
- 改类型推导 → core/api-builder.ts 的泛型层

## 必须遵守的约定
1. schema 只用 Zod，禁止 ISchemaType（已在 v3 移除）
2. 热路径零分配——任何进入 bind() 装配的代码不能在请求时 new 对象
3. adapter 不反射读 erest 内部状态，通过显式注入
4. breaking change 登记 MIGRATION.md
5. 公开 API 改动同步更新此文件

## 常见任务套路（带代码模板）
- 新增一个 API（链式 + registerTyped 两种写法）
- 新增一个自定义 Zod 类型并注册
- 新增一个文档生成插件
- 新增一个框架 adapter
```

#### 维护策略

- AGENTS.md 与代码**同 PR 更新**（写进跨阶段原则第 5 条）
- 每个阶段 spec 完成后，同步刷新"决策树"与"目录树"

### S6.2 — Codegen 脚手架

#### 场景

AI/新人最常做的重复工作：根据 Zod schema 生成 handler 骨架、生成测试样板、从 API 定义反生成 markdown 片段。这些有固定模板，适合 CLI 化。

#### 提供的命令

```bash
# 从 Zod schema 文件生成 handler 骨架（含 registerTyped + reply）
npx erest-gen handler --from ./schemas/user.ts --group user

# 为已注册的 API 生成测试样板（success/error 两个用例骨架）
npx erest-gen test --api "GET /users/:id" --output ./test/user.test.ts

# 把当前 ERest 实例的所有 API 导出为 markdown（复用 plugins/markdown）
npx erest-gen docs --entry ./api.ts --format markdown
```

#### 实现形态

- 独立子包 `packages/erest-gen`（不进核心包，按需安装）
- 基于 erest 自身的 Zod 类型推导能力（阶段 2 的 builder 类型层）+ 模板字符串
- 不引入重代码生成框架（非 ocliff/yargs 之外的重型 CLI 框架），保持轻量

#### 与文档生成的区别

`plugins/markdown` 是**运行时**从 ERest 实例生成文档（已有）；Codegen 的 `docs` 命令是**构建时**从源码入口生成——两者底层都走 `zod-meta.ts`，避免重复。

---

## 变更清单

| # | 范围 | 说明 |
|---|------|------|
| 1 | `core/compose.ts` | 在 dispatch 中植入 4 个 hook 注入点（无订阅者时编译期裁剪） |
| 2 | `core/erest.ts` | 构造选项新增 `hooks` 字段；`bind()` 据其装配 dispatch |
| 3 | `core/hooks.ts` | 新增：hook 类型定义 + `structuredLogger` 可选工具 |
| 4 | `packages/erest-gen` | 新子包：handler/test/docs 三个 codegen 命令 |
| 5 | `AGENTS.md` | 仓库根新增 AI 导航文档 |
| 6 | `README.md` | 新增 hooks 与 codegen 章节；链接 AGENTS.md |
| 7 | `src/test/test-hooks.ts` | 新增 hook 生命周期测试（含"无订阅者零开销"bench） |

## 验证标准

1. 注册 4 个 hook 后，每个请求触发顺序为 `onRequest → onValidate → (onError \| onResponse)`
2. `onError` 收到的 `ERestError` 保留完整 `code/details/statusCode`（不再丢失上下文）
3. **无 hook 时热路径分配与阶段 1 bench 基线无差异**（零开销验证）
4. `npx erest-gen handler` 能从 Zod schema 文件生成可编译运行的 handler 骨架
5. `AGENTS.md` 的"改 X 去 Y"决策树覆盖全部核心目录，经得起"让 AI 据此找到正确文件"的检验
6. `pnpm run check` 0 error；`pnpm run test:cov` 全绿；`pnpm --filter erest-example test` 全绿

## 风险与开放问题（待 plan 细化）

- **hook 的同步 vs 异步**：当前设计为同步观察者（不参与控制流）。若用户需要异步 hook（如异步写日志不阻塞响应），是否提供 `onResponseAsync`？**推荐：保持同步，异步日志让用户在 hook 内自行 fire-and-forget**。
- **Codegen 模板的可定制性**：内置模板可能不够用。是否支持用户自定义模板？**推荐首版内置固定模板，自定义留后续**。
- **AGENTS.md 与 README 内容重复**：需明确分工——README 面向使用者（怎么用），AGENTS.md 面向修改者（怎么改）。**待 plan 细化边界**。
