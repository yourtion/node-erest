# Stage 3：可观测性 Hook + AI 友好 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 在 dispatch 闭包中植入 4 个生命周期 hook（onRequest/onValidate/onError/onResponse），无订阅者时零开销；创建 AGENTS.md 架构导航；提供 erest-gen codegen 骨架。

**Architecture:** hook 是同步观察者，不参与控制流。`ERest` 在 `bind()` 阶段检查 hooks 是否为空对象，空则 dispatch 闭包不含 hook 调用代码（编译期裁剪）。AGENTS.md 提供"改 X 去 Y"决策树。Codegen 作为独立 CLI 子包。

**Tech Stack:** TypeScript 5.8、Zod 4、vitest、oxlint/oxfmt

**Spec:** `docs/superpowers/specs/2026-06-27-stage3-observability-ai-friendly.md`

**基线（Stage 2 完成后，commit 71a642b）：** check 0 error / build / test:lib 246 / examples 12。

---

## 关键设计决策

1. **hook 同步**：不提供异步 hook（spec 开放问题 #1 拍板）。用户需异步日志时在 hook 内 fire-and-forget。
2. **零开销实现**：bind 时检查 `hooks` 是否为空对象。空 → 装配不含 hook 调用的 dispatch；非空 → 装配含 hook 调用的 dispatch。运行时无分支判断。
3. **Codegen 范围**：首版只做 `handler` 命令（从 Zod schema 文件生成 handler 骨架），test/docs 命令后续。独立子包 `packages/erest-gen`。
4. **AGENTS.md vs README 边界**：README 面向使用者（怎么用），AGENTS.md 面向修改者（怎么改/架构地图）。

---

## Task 1：定义 hook 类型 + ERest 接受 hooks 配置

**Files:**
- Create: `src/lib/hooks.ts`
- Modify: `src/lib/index.ts`

- [ ] **Step 1: 创建 hooks.ts 类型定义**

```typescript
// src/lib/hooks.ts
import type { Context } from "./adapters/types.js";
import type { LayeredParams } from "./params.js";
import type ERestError from "./error.js";

/** 生命周期 hook 集合（同步观察者，不参与控制流） */
export interface LifecycleHooks {
  /** 进入中间件链最开始：注入 traceId、开始计时 */
  onRequest?: (ctx: Context) => void;
  /** 参数校验完成后：记录校验耗时、失败字段 */
  onValidate?: (ctx: Context, result: LayeredParams | Error) => void;
  /** 链中抛错时：结构化错误日志（保留 ERestError code/details） */
  onError?: (ctx: Context, error: ERestError | Error) => void;
  /** 链正常结束：结束计时、状态码 */
  onResponse?: (ctx: Context) => void;
}

/** 判断 hooks 是否为空（用于零开销裁剪） */
export function hasHooks(hooks?: LifecycleHooks): boolean {
  if (!hooks) return false;
  return Boolean(hooks.onRequest || hooks.onValidate || hooks.onError || hooks.onResponse);
}
```

- [ ] **Step 2: ERest 构造选项接受 hooks**

`src/lib/index.ts` 的 `IApiOption` 加 `hooks?: LifecycleHooks`。ERest 构造函数存储 `this.hooks`。

- [ ] **Step 3: 暴露 getHooks() 内部方法（adapter bind 时用）**

```typescript
/** @internal 获取 hooks（adapter 装配 dispatch 时用） */
getHooks() { return this.hooks; }
```

- [ ] **Step 4: 全量验证 + Commit**

```bash
pnpm run build && pnpm run test:lib
git add -A && git commit -m "feat(hooks): 定义 LifecycleHooks 类型，ERest 接受 hooks 配置"
```

---

## Task 2：在 dispatch 闭包植入 hook 注入点（零开销裁剪）

**Files:**
- Modify: `src/lib/adapters/express.ts`
- Modify: `src/lib/adapters/koa.ts`
- Modify: `src/lib/adapters/leizmweb.ts`
- Modify: `src/lib/adapters/utils.ts`（buildHandlerChain 传递 hooks）

- [ ] **Step 1: 写 hook 生命周期测试**

```typescript
// src/test/test-hooks.ts
import { describe, test, expect, vi } from "vitest";
import lib from "./lib.js";

describe("Lifecycle Hooks", () => {
  test("无 hooks 时热路径零开销（不调用任何 hook）", async () => {
    const apiService = lib();
    apiService.api.get("/no-hooks").group("Index").register((ctx) => ctx.reply.send("ok"));
    const router = express.Router();
    apiService.bind({ framework: "express", router });
    // 绑定后发起请求，不应抛错（证明无 hook 也正常工作）
    // ... 用 test agent 验证
  });

  test("4 个 hook 按顺序触发：onRequest → onValidate → onResponse", async () => {
    const order: string[] = [];
    const apiService = lib({
      hooks: {
        onRequest: () => order.push("request"),
        onValidate: () => order.push("validate"),
        onError: () => order.push("error"),
        onResponse: () => order.push("response"),
      },
    });
    apiService.api.get("/hooks").group("Index").register((ctx) => ctx.reply.send("ok"));
    // ... 发起请求
    expect(order).toEqual(["request", "validate", "response"]);
  });

  test("onError 收到 ERestError 保留 code/details", async () => {
    let caught: any;
    const apiService = lib({
      hooks: { onError: (_ctx, err) => (caught = err) },
    });
    // ... 触发校验错误的请求
    expect(caught).toBeDefined();
  });
});
```

- [ ] **Step 2: 改造 express adapter bindRoute 植入 hook**

在 `nativeMiddleware` 中，据 `hasHooks(erest.getHooks())` 装配不同 dispatch：

```typescript
bindRoute(router, api, handlers) {
  const hooks = this.erest.getHooks();
  const hasHook = hasHooks(hooks);
  const dispatch = compose(handlers);
  const nativeMiddleware = (req, res, next) => {
    const ctx = { /* 构造 Context */ };
    if (hasHook) {
      try { hooks.onRequest?.(ctx); } catch {}
      dispatch(ctx)
        .then(() => { hooks.onResponse?.(ctx); next(); })
        .catch((err) => { hooks.onError?.(ctx, err); next(err); });
    } else {
      dispatch(ctx).then(() => next()).catch((err) => next(err));
    }
  };
}
```

> onValidate 在 checker 内触发（checker 是 handlers 链的一环），见 Step 3。

- [ ] **Step 3: checker 中触发 onValidate**

三个 adapter 的 `makeParamsChecker`，在 validate 后：

```typescript
const hooks = erest.getHooks();
if (hooks?.onValidate) {
  try { hooks.onValidate(ctx, layered); } catch {}
}
```

- [ ] **Step 4: 同样改造 koa/leizmweb adapter**

- [ ] **Step 5: 运行测试 + bench 验证零开销**

```bash
pnpm exec vitest run src/test/test-hooks.ts
pnpm run bench  # 有/无 hook 性能应无显著差异
```

- [ ] **Step 6: 全量验证 + Commit**

```bash
pnpm run build && pnpm run test:lib && pnpm run check
git add -A && git commit -m "feat(hooks): dispatch 植入 4 个生命周期 hook（无订阅者零开销）"
```

---

## Task 3：AGENTS.md 架构导航

**Files:**
- Create: `AGENTS.md`

- [ ] **Step 1: 创建 AGENTS.md**

按 spec §B 的内容结构，包含：一图看懂（目录树）、改 X 去 Y 决策树、必须遵守的约定、常见任务套路。

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md && git commit -m "docs: 新增 AGENTS.md 架构导航（AI 与新人上手指南）"
```

---

## Task 4：erest-gen codegen 骨架（handler 命令）

**Files:**
- Create: `packages/erest-gen/`（子包）

> 鉴于 codegen 是独立子包且需要 CLI 框架，首版做最小可用：从 Zod schema 文件生成 registerTyped handler 骨架。

- [ ] **Step 1: 创建 packages/erest-gen 子包结构**

```
packages/erest-gen/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts        # CLI 入口
│   └── handler.ts      # handler codegen
└── README.md
```

- [ ] **Step 2: 实现 handler codegen**

从 Zod schema 文件解析导出的 z.object，生成 registerTyped 骨架。

- [ ] **Step 3: 验证生成产物可编译**

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(gen): erest-gen codegen 子包（handler 命令骨架）"
```

---

## Task 5：最终验收

- [ ] **Step 1: hook 生命周期验证**

Run: `pnpm exec vitest run src/test/test-hooks.ts`
Expected: 顺序 onRequest → onValidate → onResponse，错误时 onError。

- [ ] **Step 2: 零开销验证**

Run: `pnpm run bench`
Expected: 无 hook 与有 hook 性能无显著差异。

- [ ] **Step 3: AGENTS.md 决策树覆盖**

确认 AGENTS.md 覆盖全部核心目录。

- [ ] **Step 4: 全量**

Run: `pnpm run check && pnpm run build && pnpm run test:lib && pnpm --filter erest-example test`
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "test: Stage 3 验收通过"
```

---

## Self-Review

**Spec coverage：**
- §A S5 hook → Task 1/2 ✅
- §A 零开销 → Task 2 Step 5（bench） ✅
- §A onError 保留上下文 → Task 2 Step 3 ✅
- §B S6.1 AGENTS.md → Task 3 ✅
- §B S6.2 Codegen → Task 4 ✅（首版 handler 命令，test/docs 后续）

**开放问题：** hook 同步（#1 拍板）、Codegen 模板（#2 首版固定）、AGENTS/README 边界（#3 拍板）✅
