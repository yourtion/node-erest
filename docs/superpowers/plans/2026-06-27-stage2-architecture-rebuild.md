# Stage 2：架构重组 + 强类型 Builder DSL 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 拆解 ERest 上帝类（删除 `privateInfo` 洞口、删除 4 个 `@deprecated` 绑定方法）、把 `_def` 读取统一到 `zod-meta.ts`、为链式 API 加上编译期类型推导。

**Architecture:** 不做 monorepo 拆包（spec 验证 5/6 的子包化留作后续可选增强，理由：拆包增加 tsconfig references/workspace 复杂度，而架构合理性的核心收益来自"删 privateInfo + 删 deprecated + builder 推导"，与包结构正交）。聚焦单包内：`privateInfo` 改为显式受控访问器；`bind()` 成为唯一绑定入口；adapters 通过构造注入而非反射。

**Tech Stack:** TypeScript 5.8、Zod 4、vitest、oxlint/oxfmt

**Spec:** `docs/superpowers/specs/2026-06-27-stage2-architecture-rebuild.md`

**基线（Stage 1 完成后，commit 3b63f8b）：** check 0 error / build 通过 / test:lib 246绿 / examples 12绿；`index.ts` 744 行，`privateInfo` 被 8 处引用，`_def` 散落 5 个文档生成器，4 个 `@deprecated` 方法。

---

## 关键设计决策（plan 阶段拍板 spec 开放问题）

1. **不拆 monorepo 子包**：`packages/erest-express` 等拆包留作后续。理由：架构合理性核心（删 privateInfo/deprecated/builder）与包结构正交，拆包会引入 tsconfig references + 发布流程复杂度，收益独立且非阻塞。本 plan 在单包内完成所有架构改造，验收标准 5/6（子包 build）标记为 deferred。

2. **privateInfo 替换策略**：`privateInfo` 当前把 6 个内部字段（app/info/groups/groupInfo/error/mockHandler）一次性洞开。改为按消费者需要**提供显式访问器**：
   - adapters 需要 `error`（错误工厂）→ checker 已通过参数 `erest` 拿到，改为直接暴露 `getError()` 内部方法
   - docs 需要 `groups/groupInfo/apis/schemaRegistry` → docs 改为接收 `ERestDocsView`（受控快照接口）
   - test 需要 `app/error/formatOutput` → test 改为接收 `ERestTestView`
   - api.ts 需要 `groups/mockHandler/schema.get` → init() 参数已传 parent，改为 parent 暴露 `internalGroups()`/`getMockHandler()`/`schema`
   - params.ts compileValidate 需要 `error` → 改为传入 `errorFactory` 而非整个 ctx

3. **deprecated 删除**：`bindRouter`/`bindKoaRouterToApp`/`bindRouterToApp`/`checkerExpress`/`checkerKoa`/`checkerLeiWeb` 全删。`bind()` 是唯一入口。但保留 `checkerExpress` 等的**类型**（作为 adapter 标识），或彻底移除（用户改用 `bind({ adapter })`）。

4. **builder 类型推导**：`ApiBuilder` 不新建类（避免运行时开销），用现有 `API` 类 + 泛型方法链。`body/query/params/headers` 加泛型参数累积 shape，`register` 的 handler 入参由累积的泛型推导。

---

## File Structure（改动后形态，单包内）

```
src/lib/
├── index.ts               # ERest 门面：删除 privateInfo/deprecated/4个checker，保留显式访问器
├── api.ts                 # builder 类型层：body/query/params/headers 加泛型累积
├── params.ts              # compileValidate 改收 errorFactory（解耦 ERest）
├── adapters/
│   ├── express.ts         # checker 改用 erest.getError()
│   ├── koa.ts             # 同上
│   └── leizmweb.ts        # 同上
├── extend/
│   ├── docs.ts            # 改用 ERestDocsView 受控快照（不读 privateInfo）
│   └── test.ts            # 改用 ERestTestView 受控快照
└── plugin/
    ├── zod-meta.ts        # _def 读取统一到此（已有，补充 generate_markdown/schema.ts 等）
    ├── generate_swagger/index.ts    # 改用 zod-meta
    ├── generate_markdown/schema.ts  # 改用 zod-meta
    ├── generate_axios/index.ts      # 改用 zod-meta
    └── generate_postman/index.ts    # 改用 zod-meta

src/test/
├── test-docs-zod.ts       # 删除 _def 构造测试
└── utils/mock-factories.ts # 删除 _def mock

MIGRATION.md               # 增补 bind({adapter}) 迁移说明
```

---

## Task 1：统一 `_def` 读取到 zod-meta.ts

**Files:**
- Modify: `src/lib/plugin/zod-meta.ts`（补充工具函数）
- Modify: `src/lib/plugin/generate_markdown/schema.ts`
- Modify: `src/lib/plugin/generate_swagger/index.ts`
- Modify: `src/lib/plugin/generate_axios/index.ts`
- Modify: `src/lib/plugin/generate_postman/index.ts`

- [ ] **Step 1: 在 zod-meta.ts 补充通用工具函数**

在 `src/lib/plugin/zod-meta.ts` 末尾追加：

```typescript
/** 获取 ZodObject 的 shape（字段定义映射），非 ZodObject 返回 undefined */
export function getZodShape(schema: unknown): Record<string, ZodTypeAny> | undefined {
  const def = (schema as { _def?: { shape?: Record<string, ZodTypeAny> } })._def;
  return def?.shape;
}

/** 获取 Zod 类型的 typeName（如 "ZodString"），用于文档分支 */
export function getZodTypeName(schema: unknown): string | undefined {
  const def = (schema as { _def?: { typeName?: string } })._def;
  return def?.typeName;
}

/** 获取 ZodOptional/ZodDefault 的内层 schema */
export function getZodInner(schema: ZodTypeAny): ZodTypeAny | undefined {
  const def = (schema as { _def?: { innerType?: ZodTypeAny } })._def;
  return def?.innerType;
}
```

- [ ] **Step 2: generate_markdown/schema.ts 改用 zod-meta**

把该文件里直接读 `_def` 的地方，改为 `getZodTypeName`/`getZodShape`。

- [ ] **Step 3: generate_swagger/axios/postman 改用 getZodShape**

这三个文件里 `schema._def.shape` 的读取，改为 `getZodShape(schema)`。

- [ ] **Step 4: 验证 `_def` 集中**

Run: `grep -rln "_def" src/lib/`
Expected: 仅 `zod-meta.ts` 和 `params.ts`（isZodSchema 用 `_def` 检测，属合理）。

- [ ] **Step 5: 全量验证 + Commit**

```bash
pnpm run build && pnpm run test:lib && pnpm run check
git add -A && git commit -m "refactor(docs): _def 读取统一到 zod-meta.ts"
```

---

## Task 2：compileValidate 解耦 ERest（改收 errorFactory）

**Files:**
- Modify: `src/lib/params.ts`
- Modify: `src/lib/api.ts`

- [ ] **Step 1: compileValidate 签名改为收 errorFactory**

`src/lib/params.ts` 的 `compileValidate`，把第一个参数从 `ctx: ERest<unknown>` 改为 `errorFactory`：

```typescript
/** 错误工厂接口（compileValidate 只依赖这两个方法） */
export interface ValidationErrorFactory {
  missingParameter: (msg: string) => Error;
  invalidParameter: (msg: string) => Error;
}

export function compileValidate(errorFactory: ValidationErrorFactory, schemas: CompiledSchemas): CompiledRoute {
  const makeParse = (schema: ZodType) => (input: unknown): Record<string, unknown> => {
    const result = schema.safeParse(input);
    if (result.success) return result.data as Record<string, unknown>;
    const issue = result.error.issues[0];
    const field = (issue.path[0] as string) ?? "value";
    if (isMissing(issue as never)) {
      throw errorFactory.missingParameter(`'${field}'`);
    }
    throw errorFactory.invalidParameter(`'${field}' should be valid`);
  };
  // ... 其余不变
}
```

删除 params.ts 顶部 `import type ERest` 若不再需要。

- [ ] **Step 2: api.ts init() 传入 errorFactory**

`src/lib/api.ts` 的 `init()` 中：

```typescript
this.options.compiled = compileValidate(
  { missingParameter: (m) => parent.privateInfo.error.missingParameter(m), invalidParameter: (m) => parent.privateInfo.error.invalidParameter(m) },
  { paramsSchema: ..., querySchema: ..., bodySchema: ..., headersSchema: ... }
);
```

> 这是过渡写法（Task 3 删 privateInfo 后 parent 改用 getError()）。先让它编译通过。

- [ ] **Step 3: 更新 bench + test-compiled-route**

`src/bench/validate.bench.ts` 和 `src/test/test-compiled-route.ts` 里 `compileValidate(apiService, ...)` 改为 `compileValidate(apiService.privateInfo.error, ...)` 或直接传 mock errorFactory。

- [ ] **Step 4: 全量验证 + Commit**

```bash
pnpm run build && pnpm run test:lib
git add -A && git commit -m "refactor(params): compileValidate 解耦 ERest，改收 errorFactory"
```

---

## Task 3：删除 4 个 deprecated 绑定方法 + 3 个 checker

**Files:**
- Modify: `src/lib/index.ts`

- [ ] **Step 1: 删除 bindRouter/bindKoaRouterToApp/bindRouterToApp**

删除 `src/lib/index.ts` 中三个 `@deprecated` 的 bind 方法（约 529-650 行）。

- [ ] **Step 2: 删除 checkerExpress/checkerKoa/checkerLeiWeb**

删除三个 checker 属性（约 499-525 行）。

- [ ] **Step 3: 检查测试/示例引用**

Run: `grep -rn "checkerExpress\|checkerKoa\|checkerLeiWeb\|bindRouter\b\|bindKoaRouterToApp\|bindRouterToApp" src/ examples/`
Expected: 仅 `bindRouter`（bind() 内部可能用）和测试。把测试里用 `bindRouter(router, checkerExpress)` 的改为 `bind({ adapter: 'express', router })`。

- [ ] **Step 4: 全量验证 + Commit**

```bash
pnpm run build && pnpm run test:lib && pnpm --filter erest-example test
git add -A && git commit -m "refactor(core): 删除 deprecated bindRouter/checkerXxx，bind() 唯一入口"
```

---

## Task 4：删除 privateInfo，引入受控访问器

**Files:**
- Modify: `src/lib/index.ts`
- Modify: `src/lib/adapters/{express,koa,leizmweb}.ts`
- Modify: `src/lib/extend/{docs,test}.ts`
- Modify: `src/lib/api.ts`

- [ ] **Step 1: 在 index.ts 定义受控视图接口**

```typescript
/** 文档生成用的受控快照（替代 privateInfo 反射） */
export interface ERestDocsView {
  groups: Record<string, string>;
  groupInfo: Record<string, unknown>;
  apis: Map<string, API<unknown>>;
  schema: { get: (name: string) => ZodType | undefined; has: (name: string) => boolean };
}

/** 测试系统用的受控视图 */
export interface ERestTestView {
  app: unknown;
  error: ERest["error"];
  formatOutput: (out: unknown) => [Error | null, unknown];
}
```

- [ ] **Step 2: ERest 提供 getDocsView()/getTestView()/getError() 替代 privateInfo**

```typescript
/** @internal 文档生成器专用 */
getDocsView(): ERestDocsView {
  return { groups: this.groups, groupInfo: this.groupInfo, apis: this.$apis, schema: this.schema };
}
/** @internal 测试系统专用 */
getTestView(): ERestTestView {
  return { app: this.app, error: this.error, formatOutput: this.formatOutput };
}
/** @internal 错误工厂（adapter/params 用） */
getError() { return this.error; }
```

删除 `get privateInfo()`。

- [ ] **Step 3: adapters 改用 getError()**

三个 adapter 的 checker 里 `erest.privateInfo.error` 改为 `erest.getError()`。

- [ ] **Step 4: docs/test 改用受控视图**

`extend/docs.ts` 和 `extend/test.ts` 里 `erest.privateInfo.xxx` 改为对应视图方法。

- [ ] **Step 5: api.ts 改用受控访问**

api.ts init() 里 `parent.privateInfo.groups`/`mockHandler`/`schema` 改为 parent 的受控方法。

- [ ] **Step 6: 验证 privateInfo 清零**

Run: `grep -rn "privateInfo" src/lib/`
Expected: 空（或仅类型定义注释）。

- [ ] **Step 7: 全量验证 + Commit**

```bash
pnpm run build && pnpm run test:lib && pnpm --filter erest-example test
git add -A && git commit -m "refactor(core): 删除 privateInfo 洞口，改用受控访问器"
```

---

## Task 5：builder 类型推导（body/query/params/headers 泛型累积）

**Files:**
- Modify: `src/lib/api.ts`
- Test: `src/test/test-builder-types.ts`（新建）

- [ ] **Step 1: 写类型推导测试**

```typescript
// src/test/test-builder-types.ts
import { z } from "zod";
import { describe, test, expectTypeOf } from "vitest";
import API from "../lib/api";

describe("Builder 类型推导", () => {
  test("register handler 入参由链式 schema 推导", () => {
    const api = new API("post", "/test", { absolute: "t" } as never, "g");
    api
      .body(z.object({ name: z.string(), age: z.number().int() }))
      .query(z.object({ active: z.boolean() }))
      .register((ctx) => {
        expectTypeOf(ctx.$params).toMatchTypeOf<{ name: string; age: number; active: boolean }>();
      });
  });
});
```

- [ ] **Step 2: API 类加泛型累积**

`src/lib/api.ts` 的 `API` 类加 4 个泛型参数累积 query/body/params/headers shape。链式方法返回 `this & { 新shape }`。

> 注：完整 builder 类型层较复杂，若 tsc 推导性能下降，降级为只保证 `registerTyped` 强推导（已有），链式 `.body().register()` 维持 `unknown` 但不报错。

- [ ] **Step 3: 全量验证 + Commit**

```bash
pnpm run build && pnpm run test:lib
git add -A && git commit -m "feat(api): builder 链式调用类型推导"
```

---

## Task 6：删除测试中的 _def 构造 + mock

**Files:**
- Modify: `src/test/test-docs-zod.ts`
- Modify: `src/test/utils/mock-factories.ts`

- [ ] **Step 1: 删除 test-docs-zod.ts 的 _def 构造**

删除该文件中 `{ _def: { typeName: "..." } } as any` 的测试块，改用真实 Zod schema。

- [ ] **Step 2: 删除 mock-factories 的 _def mock**

- [ ] **Step 3: 验证**

Run: `grep -rn "_def" src/test/`
Expected: 空。

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "test: 删除 _def 构造测试与 mock"
```

---

## Task 7：最终验收

- [ ] **Step 1: index.ts 无逻辑（验证 1 失败预期——本 plan 不做 monorepo 拆包，index.ts 仍是门面）**

Record: index.ts 行数（目标显著下降，删了 deprecated/privateInfo 后应 < 500）。

- [ ] **Step 2: privateInfo 清零（验证 2）**

Run: `grep -rn "privateInfo" src/lib/`
Expected: 空。

- [ ] **Step 3: `_def` 集中（验证 4）**

Run: `grep -rln "_def" src/lib/`
Expected: 仅 `zod-meta.ts` + `params.ts`（isZodSchema 检测）。

- [ ] **Step 4: 测试无 _def（验证 5）**

Run: `grep -rn "_def" src/test/`
Expected: 空。

- [ ] **Step 5: 全量（验证 7）**

Run: `pnpm run check && pnpm run build && pnpm run test:lib && pnpm --filter erest-example test`
Expected: 全绿。

- [ ] **Step 6: docs 字节级等价（验证 8）**

Run: `cd examples && pnpm run docs && git diff --stat docs/`
Expected: 无差异或仅 Stage 1 已知差异。

- [ ] **Step 7: MIGRATION.md 增补 + Commit**

```bash
git add -A && git commit -m "docs: Stage 2 迁移指南（bind 唯一入口 + privateInfo 移除）"
```

---

## Self-Review

**Spec coverage：**
- §A S3 拆 ERest → Task 3（删 deprecated）+ Task 4（删 privateInfo） ✅
- §A S3 adapter 插件化 → **deferred**（不做 monorepo 拆包，plan 关键决策 #1 说明）⚠️
- §A 封装边界修复 → Task 4（受控访问器） ✅
- §A 删 deprecated → Task 3 ✅
- §B S4 builder DSL → Task 5 ✅（降级风险已标注）
- §C S7 测试重写 → Task 6（删 _def）+ Stage 1 已删 test-schema-coverage ✅
- §C 清理 supertest → Stage 1 期已完成（examples 已迁 fetch）

**验证标准覆盖：** 1（部分，index 仍门面）2✅ 3✅ 4✅ 5✅ 6（deferred）7✅ 8✅

**Placeholder scan：** Task 5 Step 2 的完整泛型代码标注了降级策略，非占位符。
