# 阶段 2：架构重组 + 强类型 Builder DSL + 测试重写（骨架）

- 日期：2026-06-27
- 分支：`feat/refactor-v2`
- 阶段：2 / 3（骨架）
- 状态：设计已确认，待 plan
- 关联：总览 `2026-06-27-refactor-v2-overview.md`；依赖阶段 1 产出的统一 Zod 类型地基

## 目标

在阶段 1 的稳定 Zod 地基上，完成三件事：

1. **拆解 ERest 上帝类**，让每个模块单一职责、边界清晰、可独立理解
2. **adapter 插件化**，核心包不再 bundle 三个框架，社区可贡献 Fastify/Hono
3. **强类型 builder DSL + 测试体系重写**，让类型错误在编译期暴露、测试不再依赖 Zod 内部 hack

> S3/S4/S7 归在同一阶段是因为它们共享同一次"类型层重写"——拆类时定义的新接口签名就是 builder DSL 的类型基础，测试重写则验证新接口。分开会三次改类型。

---

## §A — S3：架构重组

### 当前问题（证据）

`index.ts`（796 行）的 `ERest` 类同时承担：

- API 注册（`registAPI`/`defineAPI`/`group()`/`api.get/post/...`）
- 分组管理（`groups`/`groupInfo`）
- 文档生成（`docsOptions`/`genDocs`/`buildSwagger`/`addDocPlugin`）
- 测试系统（`initTest`/`testAgent`）
- 错误工厂（`error`/`errorManage`）
- schema/type 注册表（`schemaRegistry`/`typeRegistry`/`createSchema`）
- 4 套绑定方法（`bind` + 3 个 `@deprecated` 的 `bindRouter/bindKoaRouterToApp/bindRouterToApp`）

`get privateInfo()` 直接洞开内部状态（`app/info/groups/groupInfo/error/mockHandler`），adapter 与 docs 通过它反读私有字段，封装边界形同虚设（`docs.ts:144` `swagger:82-99` 都在反射读 `schemaRegistry`）。

### 目标目录结构

```
src/lib/
├── core/                    # 框架无关核心
│   ├── erest.ts             # ERest 门面（facade），组合下面的子系统
│   ├── api-builder.ts       # API 定义与注册（原 api.ts 的定义部分）
│   ├── api-route.ts         # 单个 API 实例 + CompiledRoute（阶段1产出）
│   ├── group.ts             # 分组管理
│   ├── registry.ts          # type/schema 注册表（原散落在 index.ts 的两个 Map）
│   └── errors.ts            # 错误工厂 + ErrorManager
├── adapter/                 # 适配器抽象 + 内置实现
│   ├── base-adapter.ts      # 公共基类（抽取 makeParamsChecker/bindRoute 公共逻辑）
│   ├── types.ts             # FrameworkAdapter/Context/Reply/Middleware（已存在）
│   └── compose.ts           # 洋葱式 compose（已存在 utils.ts）
├── plugins/                 # 文档生成插件（原 plugin/）
│   ├── swagger/
│   ├── markdown/
│   ├── postman/
│   ├── axios/
│   └── zod-meta.ts          # ★ 新增：统一的 Zod → 文档元信息提取（消除两处 _def switch）
├── docs.ts                  # 文档协调器（原 extend/docs.ts，瘦身后只做插件调度）
├── test/                    # 测试引擎（原 extend/test.ts + agent.ts + test-server.ts）
└── index.ts                 # 仅 re-export，不含逻辑
```

### 子包化（adapter 插件化）

核心包 `erest` 只保留 `core/` + `adapter/base-adapter.ts` + `adapter/types.ts`。三框架实现拆为可选子包：

```
packages/
├── erest/              # 核心（框架无关）
├── erest-express/      # express adapter（peerDep: express）
├── erest-koa/          # koa adapter（peerDep: koa, koa-router）
└── erest-leizmweb/     # @leizm/web adapter（peerDep: @leizm/web）
```

接入方式：

```typescript
import { ERest } from 'erest';
import { expressAdapter } from 'erest-express';

const api = new ERest({ groups: { user: '用户' } });
api.bind({ adapter: expressAdapter, router });
```

> **当前 monorepo 形态**：仓库已是 pnpm workspace（`examples` 是子包）。本阶段把 `packages/` 拆为多包，`examples` 改为依赖 `erest` + `erest-express` 等。**包发布策略待 plan 细化**（统一版本 vs 独立版本）。

### 封装边界修复

- 删除 `get privateInfo()`。docs/adapter 需要的状态通过**显式注入**而非反射读取
- `ERest` 暴露的是**能力方法**（`bind`/`group`/`api`/`docs`/`test`），内部状态（registry/groups/errorManager）改为私有 + 受控访问器
- docs 不再反射 `schemaRegistry`，registry 提供 `snapshot()` 方法返回可序列化快照（阶段 1 的 `CompiledRoute` 也通过此通道暴露给文档生成）

### 删除的 deprecated

`bindRouter` / `bindKoaRouterToApp` / `bindRouterToApp` / `checkerExpress` / `checkerKoa` / `checkerLeiWeb` 全部删除（已标 `@deprecated`，阶段 1 后 `bind()` 是唯一入口）。

---

## §B — S4：强类型 Builder DSL

### 当前问题

`API<T = DEFAULT_HANDLER>` 的泛型 `T = (...args: unknown[]) => unknown` 几乎不参与推导。`register(handler)` 的 handler 入参无类型，`req.body` 退化为 `unknown`，必须手动 `as`。只有 `registerTyped` 走 Zod 推导，但它要求**一次性传所有 schema**，与链式 `.body().query()` 风格割裂。

### 目标：链式 builder 的精确推导

让链式调用的每一步都**累积类型信息**，到 `register`/`registerTyped` 时 handler 入参类型完全确定：

```typescript
api.api
  .post('/users')
  .group('user')
  .body(z.object({ name: z.string(), age: z.number().int() }))
  .query(z.object({ include: z.string().optional() }))
  .register((req, reply) => {
    // req.body: { name: string; age: number }   ← 编译期推导
    // req.query: { include?: string | undefined }
    // 无需任何 as 断言
  });
```

### 类型设计要点

- `ApiBuilder<QL, BL, PL, HL>` 用 4 个泛型参数累积 query/body/params/headers 的 `z.ZodRawShape`
- 每个链式方法返回 `ApiBuilder` 的新实例化类型（`.body(schema)` 把 `BL` 从默认 `Record<string,never>` 收窄为该 schema 的 shape）
- `register(handler)` 的 handler 签名由累积的 4 泛型 + `z.infer` 推导
- 默认值用 `Record<string, never>` 而非 `any`，保证未定义层为 `{}`
- 保留 `registerTyped` 作为"一次性传 schema"的等价快捷入口（内部走同一个 builder）

### 与阶段 1 的衔接

阶段 1 让 `body/query/params/headers` 只接受 `ZodType`。本阶段在此基础上为这些方法加上**返回类型的精确泛型**。类型层改动集中、不碰运行时（运行时逻辑阶段 1 已定）。

### define() 的统一

`define(opts)` 声明式入口与链式 builder 等价，本阶段让 `define` 的 `opts` 类型也享受推导（基于同一个 `ApiBuilder` 类型参数）。

---

## §C — S7：测试体系重写

### 当前问题（证据）

- `test-schema-coverage.ts` 单文件 192 处 `as any`，手动构造 `{ _def: { typeName: 'ZodString' } } as any` 测文档分支——Zod 4 升级即脆断
- examples `devDependencies` 残留 `supertest`（已迁 fetch）
- 测试直接访问私有成员 `(app as any).typeRegistry`，与 S3 的封装修复冲突

### 目标

1. **删除所有 `_def` hack 测试**：阶段 1 消除 ISchemaType 后，文档生成走统一 Zod 路径，这些"构造 Zod 内部结构测分支"的测试整体作废，改用真实 Zod schema 测
2. **私有访问替换为公开测试 API**：S3 修复封装后，registry 提供 `snapshot()`/`has()`/`list()` 等测试友好方法，删除 `(app as any).xxx`
3. **测试分层清晰**：
   - `core/` 单元测试（纯函数，无框架依赖）
   - `adapter/` 集成测试（每框架一个，用 fetch 跑真实 HTTP）
   - `e2e/` examples 端到端
4. **清理遗留**：移除 examples 的 `supertest` devDep

### 测试与重构的协同

S3 拆出的每个新模块（`api-builder`/`group`/`registry`/`errors`）都**先有单元测试再迁移**——这本身是迁移安全网。测试重写不是独立动作，而是跟随 S3/S4 的每个子模块同步进行。

---

## 变更清单

| # | 范围 | 说明 |
|---|------|------|
| 1 | 目录重组 | `src/lib/*` → `src/lib/{core,adapter,plugins,test}/`（见 §A 结构图） |
| 2 | `ERest` 门面 | `index.ts` 拆为 `core/erest.ts`（组合）+ 各子系统；删除 `privateInfo` |
| 3 | adapter 子包化 | `packages/erest` + `packages/erest-{express,koa,leizmweb}`；pnpm workspace 多包 |
| 4 | `plugins/zod-meta.ts` | 统一 Zod→文档元信息提取，消除 docs.ts/swagger 两处 `_def` switch |
| 5 | builder 类型层 | `api-builder.ts` 引入 `ApiBuilder<QL,BL,PL,HL>` 泛型累积 |
| 6 | 删除 deprecated | `bindRouter*`/`checkerXxx` 全删 |
| 7 | 测试重写 | 删 `_def` hack 测试；每新模块配单元测试；私有访问改公开 API |
| 8 | examples | 改依赖子包；删 `supertest` devDep |
| 9 | `MIGRATION.md` | 增补：`bind({framework})` → `bind({adapter})`、子包安装说明 |

## 验证标准

1. `src/lib/index.ts` 仅 re-export，不含逻辑（行数 < 50）
2. `ERest` 类不含 `privateInfo`；`grep -r "as any" src/lib` 无私有成员访问
3. builder 链式调用 `register` 的 handler 入参**编译期可推导**（写一个类型断言测试 `expectTypeOf`）
4. `grep -r "_def" src/lib` 仅在 `plugins/zod-meta.ts` 集中存在（且优先用 Zod 官方 `.describe()`/`.meta()` API）
5. `grep -r "_def" src/test` 为空（测试不再构造 Zod 内部结构）
6. `packages/erest-express` 等三子包可独立 build；`pnpm --filter erest-example test` 全绿（examples 改用子包）
7. `pnpm run check` 0 error；`pnpm run test:cov` 全绿
8. docs/swagger 生成结果与重构前**字节级等价**（用 examples 的 docs 产物 diff 验证）

## 风险与开放问题（待 plan 细化）

- **多包发布策略**：统一版本（lerpa/changesets）vs 各包独立版本。影响 CI 与发布流程。**推荐 changesets 统一版本**。
- **子包的 TypeScript 项目引用**：monorepo 内 `packages/*` 互相引用需配 `tsconfig` references，增加构建复杂度。
- **builder DSL 的复杂泛型**可能让 `tsc` 变慢——需在 plan 阶段评估推导性能，必要时用类型缓存。
- **文档字节级等价**是强约束：如果统一 Zod→swagger 映射后某些 ISchemaType 专属字段（`comment`/`format`）无法 1:1 表达，需在 plan 阶段确认等价映射规则。
