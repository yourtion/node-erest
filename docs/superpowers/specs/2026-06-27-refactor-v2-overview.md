# 重构 v2 总览：erest 现代化与 AI 友好化

- 日期：2026-06-27
- 分支：`feat/refactor-v2`
- 状态：设计已确认，分阶段推进
- 关联 spec：
  - `2026-06-27-oxlint-oxfmt-migration-design.md`（工具链，已确认）
  - `2026-06-27-stage1-schema-unification.md`（阶段 1）
  - `2026-06-27-stage2-architecture-rebuild.md`（阶段 2）
  - `2026-06-27-stage3-observability-ai-friendly.md`（阶段 3）

## 一、动机

借助 v3.0 major 版本对整个项目做大重构与优化，达到三个目标：

1. **架构更合理** —— 消除上帝类、双轨 schema、重复代码、洞开的内部状态
2. **AI 友好** —— 不止对人友好，还要对 AI 编码友好：强类型提示、明确文档、可消费的生命周期 hook、脚手架
3. **现代化技术栈** —— 拥抱 Zod 4、ESM、Node 20+、原生 fetch，同时确保封装不过度影响性能

通读现状代码（`api.ts` 606 行 / `index.ts` 796 行 / `params.ts` 855 行 / `docs.ts` 460 行 / `swagger` 396 行）后，识别出以下**结构性问题**，它们同时影响架构、AI 友好度与性能：

| # | 问题 | 证据 |
|---|------|------|
| P1 | **双轨 schema 技术债**：ISchemaType（`{type:'String',comment:...}`）与原生 Zod 并存 | `params.ts` 中 `createZodSchema` / `buildZodObjectFromSchemaType` / `schemaChecker` 三处逐字重复 ENUM/Array/Number 分支；`api.ts` 的 `body/query/params/headers` 四个方法完全同构，每个都要 `isZodSchema → setZodSchema / isISchemaTypeRecord → checkMixedUsage+setParams` 二选一，并运行时抛"不能混用" |
| P2 | **ERest 上帝类**：注册/分组/文档/测试/错误工厂/schema 注册表/type 注册表 + 4 套 `bind*` 全塞一个类 | `index.ts` 796 行；`get privateInfo()` 把 `app/info/groups/groupInfo/error/mockHandler` 直接洞开，adapter 通过它反读内部状态，封装边界形同虚设 |
| P3 | **类型系统对 AI 不友好**：`register()` 链式定义后 `req.body` 退化为 `unknown` | `API<T = DEFAULT_HANDLER>` 的泛型 `T` 几乎不参与类型推导；只有 `registerTyped` 走 Zod 推导 |
| P4 | **热路径性能损耗**：请求时临时构造 Zod + 多次 `Object.assign` | `apiParamsCheck` 每请求跑 `Object.keys().length` 判断；`schemaChecker` 对 ISchemaType 路径每次请求临时 `z.object(schemaFields)`；`precompileSchemas()` 预编译结果在 `apiParamsCheck` 里未复用 |
| P5 | **文档生成与核心耦合**：4 个生成器直接读 `api.options` + 手写 Zod 内部结构 | `docs.ts` 的 `extractTypeScriptType` 与 `swagger/index.ts` 的 `convertZodFieldToSwagger` 两处都手写 `_def.typeName` switch，逻辑高度重复且依赖 Zod 内部结构 |
| P6 | **测试反模式**：用 hack 测 hack | `test-schema-coverage.ts` 单文件 192 处 `as any`，手动构造 `{ _def: { typeName:'ZodString' } }` 测文档分支，Zod 升级即脆断 |
| P7 | **可观测性缺失**：只有 `debug` 模块 | adapter 用 `.catch(next)` 把错误甩给框架，丢失 erest 自己的错误上下文；无结构化日志/请求计时/hook 生命周期 |
| P8 | **遗留依赖**：examples 已迁到 fetch 但 `devDependencies` 仍残留 `supertest` | `examples/package.json` |

## 二、约束矩阵（已与作者确认）

| 维度 | 决定 | 影响 |
|------|------|------|
| 兼容性 | **允许破坏性 breaking change**（major） | 可大刀阔斧：移除 ISchemaType、移除 `@deprecated`、重写 ERest 边界 |
| 多框架 | **保留 Express/Koa/@leizm/web + 插件化** | 核心包解耦适配器，子包 `erest/express` 等 |
| Schema | **Zod 唯一，废弃 ISchemaType** | 砍掉 `params.ts` 近半重复代码，统一类型推导 |
| AI 友好 | **四项全要**：AGENTS.md + 强类型 builder DSL + 可观测性 hook + Codegen | 设计需覆盖文档/类型/hook/脚手架四条线 |
| 性能 | **热路径零分配**：bind() 阶段预编译，请求路径不构造对象 | 校验/schema/错误工厂预算，闭包绑定 |

## 三、三阶段分解（方案 A）

依赖关系决定了推进顺序不可任意调换：

```
阶段 1（地基）                  阶段 2（骨架）                     阶段 3（表层）
┌─────────────────────┐      ┌─────────────────────────┐      ┌──────────────────────────┐
│ [S1] Schema 统一    │      │ [S3] 架构重组           │      │ [S5] 可观测性 hook       │
│   Zod 唯一          │ ──▶  │   拆 ERest 上帝类       │ ──▶  │   onRequest/onValidate/  │
│ [S2] 性能预编译     │      │   adapter 插件化        │      │   onError 生命周期       │
│   热路径零分配      │      │ [S4] 强类型 builder DSL │      │ [S6] AI 友好             │
│                     │      │ [S7] 测试体系重写       │      │   AGENTS.md + Codegen    │
└─────────────────────┘      └─────────────────────────┘      └──────────────────────────┘
```

**为什么这个顺序：**

- **阶段 1 必须先行**：Schema 统一（S1）与性能预编译（S2）在代码上几乎重叠（都改 `params.ts`/`api.ts` 的 `init()`/`precompileSchemas()`），分开会改两次。且 S1 是后续所有类型推导、文档生成、测试的稳定基础。
- **阶段 2 依赖阶段 1 的稳定类型地基**：架构重组（S3）拆出来的子模块接口要用 S1 统一后的 Zod 类型；builder DSL（S4）的精确推导依赖 S1；测试重写（S7）要删的 `_def` hack 正是 S1 消除的。
- **阶段 3 放最后**：可观测性 hook（S5）要挂在 S3 重组后的清晰生命周期上；AI 友好文档（S6）依赖架构定型，否则 AGENTS.md 会随架构反复返工。

每个子系统独立产出 **spec → plan → 实现**循环，可单独推进、单独回归、单独发布。

## 四、子系统清单与归属

| ID | 子系统 | 阶段 | 核心 spec | 主要改动文件 |
|----|--------|------|-----------|--------------|
| S1 | Schema 统一（Zod 唯一） | 1 | stage1 §A | `params.ts` `api.ts` |
| S2 | 性能预编译（热路径零分配） | 1 | stage1 §B | `params.ts` `api.ts` `adapters/*` |
| S3 | 架构重组（拆类 + adapter 插件化） | 2 | stage2 §A | `index.ts` → 拆分；新增 `erest/express` 等 |
| S4 | 强类型 builder DSL | 2 | stage2 §B | `api.ts` 类型层 |
| S7 | 测试体系重写 | 2 | stage2 §C | `src/test/*` |
| S5 | 可观测性 hook | 3 | stage3 §A | `adapters/*` `index.ts` |
| S6 | AI 友好（AGENTS.md + Codegen） | 3 | stage3 §B | 仓库根 + 新增 CLI |

> 工具链迁移（oxlint/oxfmt）已先行，见独立 spec，不纳入三阶段。

## 五、跨阶段原则（所有子系统共同遵守）

1. **每个子系统完成后必须**：`pnpm run check` 0 error + `pnpm run test:cov` 全绿 + `pnpm --filter erest-example test` 全绿。
2. **breaking change 集中登记**：每个 spec 的"破坏性变更"小节统一记录，最终汇总到 `MIGRATION.md`。
3. **不引入新运行时依赖**（除非子包 adapter 自带框架 peerDep）。erest 核心保持 `zod` + `path-to-regexp` + `debug` 三依赖。
4. **AI 友好是横切关注点**：每个子系统的 PR 都要同步更新受影响的 README/AGENTS.md 片段，不留到最后。

## 六、不在本次重构范围（YAGNI）

- ❌ 不引入 DI 容器 / IoC 框架
- ❌ 不替换 Zod 为其他校验库（valibot/arkitecture 等）
- ❌ 不做 GraphQL / tRPC 风格的 RPC 层
- ❌ 不引入 OpenTelemetry SDK（hook 暴露点即可，对接留给用户）
- ❌ 不做版本化 API 路由（v1/v2 协商）——`forceGroup` 已够用
