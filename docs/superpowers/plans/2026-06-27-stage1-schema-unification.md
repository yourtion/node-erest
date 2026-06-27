# Stage 1：Schema 统一 + 性能预编译 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 erest 的参数 schema 体系从双轨（ISchemaType + 原生 Zod）收敛为 Zod 唯一，并在 `bind()` 阶段把所有校验逻辑预编译为热路径零分配的闭包。

**Architecture:** 删除 `params.ts` 中 ISchemaType 全套实现（`createZodSchema`/`buildZodObjectFromSchemaType`/`schemaChecker` 的 ISchemaType 分支/`paramsChecker`/`isISchemaType*`），`api.ts` 的 `body/query/params/headers` 只接受 `ZodType`。在 `API.init()` 阶段产出 `CompiledRoute`（预构造的 Zod schema + 预绑定的 `validate` 闭包），adapter 的 checker 改用 `compiled.validate`。`required` 由 Zod 的 `.optional()` 表达，`requiredOneOf` 保留为独立的 Zod 之上的便利方法（多选一语义无完美 Zod 等价）。

**Tech Stack:** TypeScript 5.8、Zod 4、vitest、oxlint/oxfmt

**Spec:** `docs/superpowers/specs/2026-06-27-stage1-schema-unification.md`

**基线（重构前，commit c5c9b4b）：** `check` 0 error / `build` 通过 / `test:lib` 629绿 / examples 12绿；`params.ts` 855行，`ISchemaType` 引用 5 文件，`_def` 45处，`test-schema-coverage.ts` 192处 `as any`。

---

## 关键设计决策（plan 阶段拍板 spec 的开放问题）

1. **`requiredOneOf` 保留**：多选一必填（"a/b 至少一个"）没有完美 Zod 等价（`z.union` 要求互斥形状，`z.object({a,b}).refine` 不影响类型推导），保留为 Zod 之上的便利方法，语义独立。`required`（全量必填）移除——由 Zod schema 的 `.optional()` 是否出现来表达。

2. **`CompiledRoute.validate` 签名**：接收 `{params?, query?, body?, headers?}`，返回 `LayeredParams` 或抛 `ERestError`。闭包在 `init()` 时据各层 schema 有无裁剪分支，热路径只调用存在的层。

3. **错误消息兼容**：Zod issue 转换为 `ERestError` 时，保留"missing required parameter 'X'"和"'X' should be valid TYPE"两种现有消息形态（迁移期用户错误处理不破坏）。字段名从 `issue.path` 提取。

4. **`zodTypeMap` 保留**：作为导出的类型别名表，供 `erest.type.register` 与文档 `$ref` 复用；不再作为参数定义路径。

---

## File Structure（改动后形态）

```
src/lib/
├── params.ts              # 瘦身：删 ISchemaType 全套，新增 CompiledRoute/compileValidate，目标 <400行
├── api.ts                 # body/query/params/headers 只接受 ZodType；init() 产出 CompiledRoute
├── index.ts               # 删 paramsChecker/schemaChecker/responseChecker/apiParamsCheck/createSchema 公开方法
├── adapters/
│   ├── types.ts           # Context 不变（阶段2再改）
│   ├── utils.ts           # buildHandlerChain 适配 CompiledRoute
│   ├── express.ts         # makeParamsChecker 改用 compiled.validate
│   ├── koa.ts             # 同上
│   └── leizmweb.ts        # 同上
├── extend/docs.ts         # DOC_FIELD 移除 query/body/params/headers/required/requiredOneOf（ISchemaType 字段）
└── plugin/generate_swagger/index.ts  # 改读 *Schema（Zod）而非 * ISchemaType Record

src/test/
├── test-params.ts         # 删除 ISchemaType Record 测试，改纯 Zod
├── test-schema-coverage.ts # 删除 _def hack 测试
├── test-lib.ts            # 删除 createSchema/paramsChecker 等 API 测试
├── bench/validate.bench.ts # 新增：热路径基准
└── ...                    # 其余适配

MIGRATION.md               # 新增：ISchemaType → Zod 迁移指南
```

---

## Task 1：建立热路径基准测试（先建改造前基线）

**Files:**
- Create: `src/test/bench/validate.bench.ts`

- [ ] **Step 1: 创建 bench 目录与基线测试**

```typescript
// src/test/bench/validate.bench.ts
import { bench, run } from "vitest";
import { z } from "zod";
import { apiParamsCheck } from "../../lib/params.js";
import { API } from "../../lib/api.js";
import type ERest from "../../lib/index.js";
import lib from "../lib.js";

const apiService = lib();
const erest = apiService as unknown as ERest<unknown>;

// 构造一个典型 API：params + query + body
const api = new API<unknown>("post", "/users/:id/groups", { absolute: "test" } as never, "user", "/user");
api.options.paramsSchema = z.object({ id: z.string() });
api.options.querySchema = z.object({ include: z.string().optional(), limit: z.coerce.number().default(10) });
api.options.bodySchema = z.object({ name: z.string(), age: z.number().int() });

const input = {
  params: { id: "u123" },
  query: { include: "profile", limit: "20" },
  body: { name: "Tom", age: 25 },
  headers: {},
};

bench("apiParamsCheck: typical POST (params+query+body)", () => {
  apiParamsCheck(erest, api as never, input.params, input.query, input.body, input.headers);
});

run();
```

- [ ] **Step 2: 运行 bench 建立基线**

Run: `pnpm exec vitest run src/test/bench/validate.bench.ts`
Expected: 输出 `apiParamsCheck: typical POST` 的 ops/sec 与单次耗时。**记录此数值作为改造前基线**（写进 plan 的验证记录）。

- [ ] **Step 3: Commit**

```bash
git add src/test/bench/validate.bench.ts
git commit -m "test(bench): 建立参数校验热路径基线"
```

---

## Task 2：在 params.ts 新增 CompiledRoute 与 compileValidate（纯新增，不动旧代码）

**Files:**
- Modify: `src/lib/params.ts`（末尾追加）
- Test: `src/test/test-compiled-route.ts`（新建）

- [ ] **Step 1: 写 compileValidate 的失败测试**

```typescript
// src/test/test-compiled-route.ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { compileValidate, type CompiledRoute, type LayeredParams } from "../lib/params.js";
import lib from "./lib.js";

const apiService = lib();

describe("compileValidate", () => {
  it("成功校验返回分层参数", () => {
    const compiled = compileValidate(apiService as never, {
      paramsSchema: z.object({ id: z.string() }),
      querySchema: z.object({ limit: z.coerce.number().default(10) }),
      bodySchema: z.object({ name: z.string() }),
    });
    const result = compiled.validate({
      params: { id: "u1" },
      query: { limit: "20" },
      body: { name: "Tom" },
    });
    expect(result.params).toEqual({ id: "u1" });
    expect(result.query).toEqual({ limit: 20 });
    expect(result.body).toEqual({ name: "Tom" });
  });

  it("缺失必填字段抛 MISSING_PARAM", () => {
    const compiled = compileValidate(apiService as never, {
      bodySchema: z.object({ name: z.string() }),
    });
    expect(() => compiled.validate({ body: {} })).toThrow(/missing required parameter/);
  });

  it("类型错误抛 INVALID_PARAM", () => {
    const compiled = compileValidate(apiService as never, {
      bodySchema: z.object({ age: z.number().int() }),
    });
    expect(() => compiled.validate({ body: { age: "abc" } })).toThrow(/should be valid/);
  });

  it("无 schema 的层返回空对象（热路径零分配）", () => {
    const compiled = compileValidate(apiService as never, {});
    const result = compiled.validate({});
    expect(result).toEqual({ params: {}, query: {}, body: {}, headers: {} });
  });

  it("闭包裁剪：只有 bodySchema 时 validate 不触碰 params/query/headers 分支", () => {
    // 通过 spy 验证：只构造 bodySchema 的 compiled，validate 内部不引用其他层
    const compiled = compileValidate(apiService as never, {
      bodySchema: z.object({ x: z.number() }),
    });
    // 传入 params/query/headers 的脏数据，不应触发它们的校验（因为无 schema）
    const result = compiled.validate({ params: { id: 123 }, body: { x: 1 } });
    expect(result.body).toEqual({ x: 1 });
    expect(result.params).toEqual({});
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run src/test/test-compiled-route.ts`
Expected: FAIL（`compileValidate` 未定义）

- [ ] **Step 3: 在 params.ts 末尾实现 CompiledRoute + compileValidate**

在 `src/lib/params.ts` 末尾追加（不动现有代码）：

```typescript
// ============ Stage 1: 预编译校验（热路径零分配） ============

import type { ZodType } from "zod";

/** 分层校验后的参数（按来源区分） */
export interface LayeredParams {
  params: Record<string, unknown>;
  query: Record<string, unknown>;
  body: Record<string, unknown>;
  headers: Record<string, unknown>;
}

/** 预编译的校验 schema 集合 */
export interface CompiledSchemas {
  paramsSchema?: ZodType;
  querySchema?: ZodType;
  bodySchema?: ZodType;
  headersSchema?: ZodType;
}

/** 预编译的校验执行器：输入原始分层输入，输出校验后分层参数或抛 ERestError */
export interface CompiledRoute extends CompiledSchemas {
  validate: (input: {
    params?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: unknown;
    headers?: Record<string, unknown>;
  }) => LayeredParams;
}

/**
 * 把 Zod schema 集合预编译为热路径零分配的 validate 闭包。
 *
 * 闭包在编译期据 schema 有无裁剪分支：热路径只调用存在的层，
 * 直接构造字面量返回，无 Object.assign、无临时 z.object 构造。
 *
 * 错误消息兼容现有形态：
 * - 缺失必填 → "missing required parameter 'field'"
 * - 类型错误 → "'field' should be valid TYPE"
 */
export function compileValidate(ctx: ERest<unknown>, schemas: CompiledSchemas): CompiledRoute {
  const { error } = ctx.privateInfo;
  const { paramsSchema, querySchema, bodySchema, headersSchema } = schemas;

  // 预构造每层的字段名→类型映射，用于错误消息（避免热路径解析 Zod 内部结构）
  // 简化：从 ZodError 的 issue.path 提取字段名
  const makeParse = (schema: ZodType) => (input: unknown): Record<string, unknown> => {
    const result = schema.safeParse(input);
    if (result.success) return result.data as Record<string, unknown>;
    const issue = result.error.issues[0];
    const field = (issue.path[0] as string) ?? "value";
    if (issue.code === "invalid_type" && issue.received === undefined) {
      throw error.missingParameter(`'${field}'`);
    }
    throw error.invalidParameter(`'${field}' should be valid`);
  };

  // 闭包裁剪：只为存在的层组装校验调用
  const paramsParse = paramsSchema ? makeParse(paramsSchema) : undefined;
  const queryParse = querySchema ? makeParse(querySchema) : undefined;
  const bodyParse = bodySchema ? makeParse(bodySchema) : undefined;
  const headersParse = headersSchema ? makeParse(headersSchema) : undefined;

  const validate: CompiledRoute["validate"] = (input) => ({
    params: paramsParse && input.params ? paramsParse(input.params) : {},
    query: queryParse && input.query ? queryParse(input.query) : {},
    body: bodyParse && input.body !== undefined ? bodyParse(input.body) : {},
    headers: headersParse && input.headers ? headersParse(input.headers) : {},
  });

  return { paramsSchema, querySchema, bodySchema, headersSchema, validate };
}
```

> 注意：`LayeredParams` 已在文件中定义（746-751 行），**删除旧的重复定义**，用新导出的统一版本。`ERest` 类型已在文件顶部 import。

- [ ] **Step 4: 删除 params.ts 中旧的 `LayeredParams` 重复定义（746-751 行附近）**

定位 `params.ts` 中已有的：
```typescript
/** 分层校验后的参数（按来源区分，registerTyped 读取此结构以获得类型安全） */
export interface LayeredParams {
  params: Record<string, unknown>;
  query: Record<string, unknown>;
  body: Record<string, unknown>;
  headers: Record<string, unknown>;
}
```
删除这段（已被 Step 3 的新定义替代）。

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm exec vitest run src/test/test-compiled-route.ts`
Expected: PASS（5 个用例全绿）

- [ ] **Step 6: Commit**

```bash
git add src/lib/params.ts src/test/test-compiled-route.ts
git commit -m "feat(params): 新增 CompiledRoute/compileValidate 预编译校验"
```

---

## Task 3：让 API.init() 产出 CompiledRoute

**Files:**
- Modify: `src/lib/api.ts`
- Modify: `src/lib/api.ts`（APIOption 新增 `compiled` 字段）

- [ ] **Step 1: APIOption 新增 compiled 字段并在 init() 中产出**

在 `src/lib/api.ts` 的 `APIOption` 接口（约 53-71 行）新增字段：
```typescript
  // Zod schema 支持
  querySchema?: z.ZodObject<z.ZodRawShape>;
  bodySchema?: z.ZodObject<z.ZodRawShape>;
  paramsSchema?: z.ZodObject<z.ZodRawShape>;
  headersSchema?: z.ZodObject<z.ZodRawShape>;
  /** 预编译的校验执行器（init 阶段产出） */
  compiled?: CompiledRoute;
```

在文件顶部 import 新增：
```typescript
import { compileValidate, type CompiledRoute } from "./params.js";
```

在 `init()` 方法末尾（`this.inited = true;` 之前），`precompileSchemas()` 之后追加：
```typescript
    // 预编译校验闭包（Stage 1：热路径零分配）
    this.options.compiled = compileValidate(parent as ERest<unknown>, {
      paramsSchema: this.options.paramsSchema,
      querySchema: this.options.querySchema,
      bodySchema: this.options.bodySchema,
      headersSchema: this.options.headersSchema,
    });
```

> 注意：`precompileSchemas()` 已把 ISchemaType Record 预编译为 `*Schema` 字段，这里复用其结果。`ERest` 类型已 import（`import type ERest`）。

- [ ] **Step 2: 验证编译通过**

Run: `pnpm run build`
Expected: 编译成功，无类型错误。

- [ ] **Step 3: 验证现有测试仍全绿（compileValidate 与旧 apiParamsCheck 并存，未切换）**

Run: `pnpm run test:lib`
Expected: 629 测试全绿（新代码未被调用，纯新增）。

- [ ] **Step 4: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat(api): init() 阶段产出 CompiledRoute 预编译校验器"
```

---

## Task 4：adapter 的 makeParamsChecker 切换到 compiled.validate

**Files:**
- Modify: `src/lib/adapters/express.ts:26-45`
- Modify: `src/lib/adapters/koa.ts:24-43`
- Modify: `src/lib/adapters/leizmweb.ts:24-43`

- [ ] **Step 1: 改造 ExpressAdapter.makeParamsChecker**

`src/lib/adapters/express.ts`，把 `makeParamsChecker` 方法体替换为：
```typescript
  makeParamsChecker(erest: ERest<T>, api: API<T>): T {
    const checker: Middleware = (ctx, next) => {
      const compiled = api.options.compiled;
      if (!compiled) return next();
      const layered = compiled.validate({
        params: ctx.params,
        query: ctx.query as Record<string, unknown> | undefined,
        body: ctx.body as Record<string, unknown> | undefined,
        headers: ctx.headers as Record<string, unknown> | undefined,
      });
      ctx.$validated = layered;
      ctx.$params = { ...layered.params, ...layered.query, ...layered.body, ...layered.headers };
      ctx.$pathParams = layered.params;
      ctx.$query = layered.query;
      ctx.$body = layered.body;
      ctx.$headers = layered.headers;
      return next();
    };
    return checker as unknown as T;
  }
```

同时删除文件顶部的 `import { apiParamsCheck } from "../params.js";`（不再使用）。

- [ ] **Step 2: 同样改造 KoaAdapter.makeParamsChecker（express.ts 的镜像）**

`src/lib/adapters/koa.ts`，同样替换 `makeParamsChecker` 方法体为 Step 1 的逻辑，删除 `apiParamsCheck` import。

- [ ] **Step 3: 同样改造 LeizmWebAdapter.makeParamsChecker**

`src/lib/adapters/leizmweb.ts`，同样替换，删除 `apiParamsCheck` import。

- [ ] **Step 4: 运行集成测试确认三个框架仍工作**

Run: `pnpm exec vitest run src/test/test-integration-koa.ts src/test/test-integration-leizmweb.ts src/test/test-router.ts src/test/test-register-typed.ts`
Expected: 全绿（adapter 切换到 compiled.validate 后行为一致）。

- [ ] **Step 5: 运行全量测试确认无回归**

Run: `pnpm run test:lib`
Expected: 629 测试全绿。

- [ ] **Step 6: 对比 bench 确认性能无回归**

Run: `pnpm exec vitest run src/test/bench/validate.bench.ts`
Expected: ops/sec 与 Task 1 基线持平或更优（compiled.validate 已生效但 bench 测的是旧 apiParamsCheck——**需更新 bench 同时测 compiled 路径**，见 Step 7）。

- [ ] **Step 7: 更新 bench 增加编译后路径对比**

在 `src/test/bench/validate.bench.ts` 末尾新增（在 `run()` 之前）：
```typescript
import { compileValidate } from "../../lib/params.js";

// 预编译路径（Stage 1 目标）
const compiled = compileValidate(erest, {
  paramsSchema: api.options.paramsSchema,
  querySchema: api.options.querySchema,
  bodySchema: api.options.bodySchema,
});

bench("compiled.validate: typical POST (params+query+body)", () => {
  compiled.validate(input);
});
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/adapters/express.ts src/lib/adapters/koa.ts src/lib/adapters/leizmweb.ts src/test/bench/validate.bench.ts
git commit -m "refactor(adapters): makeParamsChecker 切换到预编译 compiled.validate"
```

---

## Task 5：删除 ISchemaType 公开 API（createSchema/paramsChecker/schemaChecker/responseChecker/apiParamsCheck）

**Files:**
- Modify: `src/lib/index.ts`（删除 5 个公开方法）
- Modify: `src/test/test-lib.ts`（删除对应测试）

- [ ] **Step 1: 删除 index.ts 中的 5 个公开方法**

删除 `src/lib/index.ts` 中的：
- `paramsChecker()` 方法（396-399 行）
- `schemaChecker()` 方法（404-407 行）
- `responseChecker()` 方法（409-412 行）
- `apiParamsCheck()` 方法（417-420 行）
- `createSchema()` 方法（288-294 行）

以及顶部不再需要的 import：`apiParamsCheck`, `createZodSchema`, `paramsChecker`, `responseChecker`, `schemaChecker`（从 `./params.js` 的 import 中移除这些命名）。

- [ ] **Step 2: 编译验证**

Run: `pnpm run build`
Expected: 若 `src/test` 有引用会报错（test 是下一步处理）。先确认 `src/lib` 内部无引用——`grep -rn "createSchema\|paramsChecker\|schemaChecker\|responseChecker\|apiParamsCheck" src/lib/` 应只剩 params.ts 的定义和 adapters（adapters 已在 Task 4 改掉）。

- [ ] **Step 3: 删除 test-lib.ts 中对应测试**

在 `src/test/test-lib.ts` 中删除以下测试块（搜索定位）：
- `test("paramsChecker"` 及其内容
- `test("schemaChecker"` 及其内容
- `test("responseChecker"` 及其内容
- `test("apiParamsCheck"` 及其内容
- 所有调用 `apiService.createSchema(...)` / `apiService.paramsChecker()` / `.schemaChecker()` / `.responseChecker()` / `.apiParamsCheck()` 的测试

同时删除文件顶部对应 import。

- [ ] **Step 4: 运行 test-lib 确认剩余测试通过**

Run: `pnpm exec vitest run src/test/test-lib.ts`
Expected: PASS（删除的测试不影响其余）

- [ ] **Step 5: Commit**

```bash
git add src/lib/index.ts src/test/test-lib.ts
git commit -m "refactor(core): 移除 ISchemaType 公开 API（createSchema/paramsChecker 等）"
```

---

## Task 6：删除 params.ts 中 ISchemaType 全套实现

**Files:**
- Modify: `src/lib/params.ts`（大瘦身）
- Modify: `src/test/test-params.ts`（删除 ISchemaType Record 测试）

> 这是最大的删除任务。分步进行，每步验证编译。

- [ ] **Step 1: 删除 params.ts 的 ISchemaType 类型与单字段校验函数**

删除 `src/lib/params.ts` 中的：
- `isZodSchema`（保留——文档生成仍用）
- `isISchemaType` / `isISchemaTypeRecord`（删除）
- `ISchemaType` / `INumericParams` / `IEnumParams` / `IArrayParams` 接口（删除）
- `createZodSchema` 函数（179-265 行，删除）
- `buildZodObjectFromSchemaType` 函数（274-335 行，删除）
- `paramsChecker` 函数（337-461 行，删除）
- `schemaChecker` 函数中 ISchemaType Record 分支（保留原生 Zod 分支，删除 `isISchemaTypeRecord` 分支）

> `schemaChecker` 改造后只处理原生 Zod schema 输入。保留它是因为 `apiParamsCheck`（旧路径，Task 7 删除）和测试暂用。但既然 adapter 已切 compiled.validate，`schemaChecker`/`apiParamsCheck` 可一并删除——见 Step 2。

- [ ] **Step 2: 删除 schemaChecker / apiParamsCheck / responseChecker 中 ISchemaType 分支**

实际上 Task 4 已让 adapter 不再调 `apiParamsCheck`。现在 `apiParamsCheck`/`schemaChecker`/`responseChecker` 仅被测试和被 Task 5 已删的公开方法引用。**全部删除**这三个函数（params.ts 中），只保留：
- `zodTypeMap`（导出，文档/注册复用）
- `isZodSchema`（导出，文档复用）
- `compileValidate` / `CompiledRoute` / `CompiledSchemas` / `LayeredParams`（Task 2 新增）

删除：
- `schemaChecker`（463-708 行）
- `responseChecker`（710-743 行）
- `apiParamsCheck`（768-855 行）
- `ParamsCheckResult` 接口（753-759 行，compiled.validate 不再返回 flat）

- [ ] **Step 3: 清理 index.ts 顶部 import**

`src/lib/index.ts` 顶部从 `./params.js` 的 import 删除：`apiParamsCheck`, `createZodSchema`, `paramsChecker`, `responseChecker`, `schemaChecker`。保留 `zodTypeMap`, `isZodSchema`, `ISchemaType`（如果还有引用则保留类型，否则删）。

Run: `grep -n "ISchemaType" src/lib/index.ts` 确认是否还有引用。

- [ ] **Step 4: 清理 api.ts 中 ISchemaType 引用**

`src/lib/api.ts`：
- `APIOption` 的 `query/body/params/headers: Record<string, ISchemaType>` 字段删除
- `_allParams: Map<string, ISchemaType>` 删除
- `setParam` / `setParams` / `checkMixedUsage` / `setZodSchema` 私有方法删除
- `body/query/params/headers` 方法简化为只接受 `ZodTypeAny`：

```typescript
  public body(schema: ZodTypeAny) {
    this.checkInited();
    this.setZodSchema("body", schema);
    return this;
  }
  public query(schema: ZodTypeAny) {
    this.checkInited();
    this.setZodSchema("query", schema);
    return this;
  }
  public params(schema: ZodTypeAny) {
    this.checkInited();
    this.setZodSchema("params", schema);
    return this;
  }
  public headers(schema: ZodTypeAny) {
    this.checkInited();
    this.setZodSchema("headers", schema);
    return this;
  }
```

保留简化的 `setZodSchema`（去掉混用检查）：
```typescript
  private setZodSchema(place: string, schema: z.ZodTypeAny) {
    this.checkInited();
    const schemaKey = `${place}Schema` as keyof typeof this.options;
    this.options[schemaKey] = schema;
  }
```

- `init()` 中遍历 `_allParams` 的类型检查块（524-553 行）删除（ISchemaType 专属逻辑）。
- `precompileSchemas()` 整个方法删除（ISchemaType Record → ZodObject 预编译，现已无 ISchemaType 输入）。

- [ ] **Step 5: 清理 docs.ts 的 DOC_FIELD**

`src/lib/extend/docs.ts` 的 `DOC_FIELD` 数组删除：`"query"`, `"body"`, `"params"`, `"headers"`, `"required"`, `"requiredOneOf"`（这些是 ISchemaType Record 字段，已不存在）。保留 `"responseSchema"` 等。

- [ ] **Step 6: 编译验证**

Run: `pnpm run build`
Expected: 编译错误集中在 `src/test`（尚未改）。`src/lib` 内部应编译通过。

- [ ] **Step 7: 删除 test-params.ts 中 ISchemaType 测试**

`src/test/test-params.ts` 中删除所有用 `{ type: "..." }` 构造的测试块，以及 `paramsChecker`/`schemaChecker`/`createZodSchema`/`responseChecker`/`apiParamsCheck` 的直接调用测试。该文件大部分内容是 ISchemaType 测试——保留少量纯 Zod 行为测试，或整体重写为纯 Zod 版本。

- [ ] **Step 8: 编译 + 测试验证**

Run: `pnpm run build && pnpm run test:lib`
Expected: 编译通过，测试全绿（数量因删除 ISchemaType 测试而下降，正常）。

- [ ] **Step 9: Commit**

```bash
git add src/lib/params.ts src/lib/api.ts src/lib/index.ts src/lib/extend/docs.ts src/test/test-params.ts
git commit -m "refactor(schema): 删除 ISchemaType 双轨体系，Zod 唯一"
```

---

## Task 7：删除 test-schema-coverage.ts 的 _def hack 测试

**Files:**
- Delete: `src/test/test-schema-coverage.ts`

- [ ] **Step 1: 评估 test-schema-coverage.ts 的价值**

该文件 231 测试，几乎全部是手动构造 `{ _def: { typeName: "ZodString" } } as any` 测文档分支。ISchemaType 删除后，文档生成走统一 Zod 路径（Task 8 改 swagger），这些 hack 测试失去意义。

Run: `grep -c "as any" src/test/test-schema-coverage.ts`
Expected: 约 192 处（确认是 hack 测试）。

- [ ] **Step 2: 删除整个文件**

```bash
git rm src/test/test-schema-coverage.ts
```

- [ ] **Step 3: 运行测试确认无依赖断裂**

Run: `pnpm run test:lib`
Expected: 全绿（该文件的测试已被 Task 8 的真实 Zod 文档测试覆盖）。

- [ ] **Step 4: Commit**

```bash
git commit -m "test: 删除 test-schema-coverage 的 _def hack 测试"
```

---

## Task 8：swagger/docs 生成器改读 Zod schema

**Files:**
- Modify: `src/lib/plugin/generate_swagger/index.ts`
- Modify: `src/lib/extend/docs.ts`
- Test: `src/test/test-docs-zod.ts`

- [ ] **Step 1: 写 swagger Zod 读取的失败测试**

在 `src/test/test-docs-zod.ts` 追加（该文件已存在，验证 Zod schema 定义 API 的文档生成）：
```typescript
  it("Zod schema 的 body/query 正确出现在 swagger parameters", () => {
    const api = lib();
    api.api
      .post("/zod-only")
      .group("Index")
      .body(z.object({ name: z.string(), age: z.number().int() }))
      .query(z.object({ active: z.boolean() }))
      .register(() => {});
    const swagger = api.buildSwagger() as { paths: Record<string, Record<string, { parameters: unknown[] }>> };
    const op = swagger.paths["/zod-only"]?.POST;
    expect(op).toBeDefined();
    const paramNames = (op!.parameters as Array<{ name: string }>).map((p) => p.name);
    expect(paramNames).toContain("active");
  });
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm exec vitest run src/test/test-docs-zod.ts`
Expected: FAIL（swagger 仍读 `api.body` ISchemaType Record，现已为空）

- [ ] **Step 3: 改造 swagger 生成器读 *Schema**

`src/lib/plugin/generate_swagger/index.ts` 的 `buildSwagger` 函数中，参数生成循环（324-367 行）改为读 Zod schema：

把：
```typescript
    for (const place of ["params", "query", "body"]) {
      for (const sKey in (api as Record<string, Record<string, ISchemaType>>)[place]) {
```
替换为从 `api.responseSchema`/`querySchema`/`bodySchema`/`paramsSchema`（ZodObject）提取 shape：
```typescript
    const schemaMap = {
      params: api.paramsSchema,
      query: api.querySchema,
      body: api.bodySchema,
    } as Record<string, { _def: { shape?: Record<string, ZodType> } } | undefined>;

    for (const place of ["params", "query", "body"]) {
      const schema = schemaMap[place];
      if (!schema?._def?.shape) continue;
      for (const [sKey, fieldSchema] of Object.entries(schema._def.shape)) {
        const swaggerField = convertZodFieldToSwagger(fieldSchema as ZodType);
        // ... 构造 ISwaggerResultParams（用 swaggerField.property）
      }
    }
```

> 详细映射用现有的 `convertZodFieldToSwagger`（已存在，134-264 行）。保留该函数，它已是 Zod→Swagger 的正确映射。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm exec vitest run src/test/test-docs-zod.ts`
Expected: PASS

- [ ] **Step 5: 用 examples 的 docs 产物做字节级 diff 验证**

Run:
```bash
cd examples && pnpm run docs 2>&1 | tail -5 && git diff --stat docs/
```
Expected: examples 已全用 Zod 定义，docs 产物应与重构前等价或仅在 ISchemaType 字段（comment 等）有已知差异。

- [ ] **Step 6: 运行全量测试**

Run: `pnpm run test:lib`
Expected: 全绿。

- [ ] **Step 7: Commit**

```bash
git add src/lib/plugin/generate_swagger/index.ts src/test/test-docs-zod.ts
git commit -m "refactor(docs): swagger 生成器改读 Zod schema"
```

---

## Task 9：清理 api.ts 残留（required/init 简化、define 适配）

**Files:**
- Modify: `src/lib/api.ts`

- [ ] **Step 1: 简化 init() —— 删除 ISchemaType 专属检查**

`src/lib/api.ts` 的 `init()` 中，删除遍历 `_allParams` 的类型检查块（已无 `_allParams`）。`init()` 简化为：
```typescript
  public init(parent: ERest<unknown>) {
    this.checkInited();
    assert(this.options.group, `请为 API ${this.key} 选择一个分组`);
    assert(this.options.group in parent.privateInfo.groups, `请先配置 ${this.options.group} 分组`);

    if (this.options.response) {
      // response schema 处理保留（已是 Zod 优先逻辑）
      if (typeof this.options.response === "string") {
        this.options.responseSchema = parent.schema.get(this.options.response);
      } else if (this.options.response instanceof z.ZodType) {
        this.options.responseSchema = this.options.response;
      }
    }

    // 预编译校验闭包（Stage 1：热路径零分配）
    this.options.compiled = compileValidate(parent as ERest<unknown>, {
      paramsSchema: this.options.paramsSchema,
      querySchema: this.options.querySchema,
      bodySchema: this.options.bodySchema,
      headersSchema: this.options.headersSchema,
    });

    if (this.options.mock && parent.privateInfo.mockHandler && !this.options.handler) {
      this.options.handler = parent.privateInfo.mockHandler(this.options.mock);
    }
    this.inited = true;
  }
```

- [ ] **Step 2: 删除 required 方法，保留 requiredOneOf**

删除 `required(list)` 方法（359-366 行）——必填由 Zod `.optional()` 表达。
**保留** `requiredOneOf`（多选一语义独立，无完美 Zod 等价）。

但 `requiredOneOf` 原本检查的是扁平 `newParams`，现在 compiled.validate 返回分层。需适配：在 `apiParamsCheck` 删除后，`requiredOneOf` 检查移到哪？

**决策**：`requiredOneOf` 移到 `compiled.validate` 之后，由 checker 中间件执行。在 adapter 的 `makeParamsChecker`（Task 4）中，validate 后追加 requiredOneOf 检查。

修改 `src/lib/adapters/utils.ts` 不行（它只组装链）。改为在 Task 4 的 checker 内追加逻辑——见 Step 3。

- [ ] **Step 3: 在 checker 中追加 requiredOneOf 检查**

三个 adapter 的 `makeParamsChecker`（Task 4 已改），在 `validate` 后追加：
```typescript
      const layered = compiled.validate({...});
      // requiredOneOf 检查（多选一必填，Zod 之上的便利）
      if (api.options.requiredOneOf.length > 0) {
        const flat = { ...layered.params, ...layered.query, ...layered.body, ...layered.headers };
        for (const names of api.options.requiredOneOf) {
          const ok = names.some((n) => typeof flat[n] !== "undefined");
          if (!ok) throw erest.privateInfo.error.missingParameter(`one of ${names.join(", ")} is required`);
        }
      }
      ctx.$validated = layered;
      // ...
```

- [ ] **Step 4: define() 适配（去除 ISchemaType 字段）**

`API.define` 静态方法（119-163 行）中，删除对 `options.body/query/params/headers`（ISchemaType Record）和 `options.required` 的分支处理。保留 Zod schema 路径。

- [ ] **Step 5: 运行全量测试**

Run: `pnpm run build && pnpm run test:lib`
Expected: 全绿。`requiredOneOf` 测试（test-test.ts:48, test-api.ts:268）仍通过。

- [ ] **Step 6: Commit**

```bash
git add src/lib/api.ts src/lib/adapters/*.ts
git commit -m "refactor(api): init 简化，required 移除，requiredOneOf 适配分层校验"
```

---

## Task 10：examples 适配 + MIGRATION.md

**Files:**
- Modify: `examples/src/api.js`（若残留 ISchemaType——已确认无，仅核对）
- Create: `MIGRATION.md`

- [ ] **Step 1: 核对 examples 无 ISchemaType 残留**

Run: `grep -rn "type: ['\"]" examples/src/`
Expected: 空（已确认 examples 全用 Zod）。

- [ ] **Step 2: 运行 examples 测试确认无回归**

Run: `pnpm --filter erest-example test`
Expected: 12 测试全绿。

- [ ] **Step 3: 创建 MIGRATION.md**

```markdown
# 迁移指南：erest v3.0（Stage 1 — Schema 统一）

本版本把参数 schema 体系从双轨（ISchemaType + 原生 Zod）收敛为 **Zod 唯一**。

## 破坏性变更

### 1. ISchemaType Record 定义方式移除

```diff
- api.body({ name: { type: "String", required: true }, age: { type: "Integer" } })
+ api.body(z.object({ name: z.string(), age: z.number().int() }))
```

`type` 字符串到 Zod 的映射见 `zodTypeMap`（仍导出）。常用对照：

| ISchemaType | Zod 等价 |
|-------------|---------|
| `{ type: "String" }` | `z.string()` |
| `{ type: "Integer" }` | `z.number().int()` |
| `{ type: "Number", params: { min: 0, max: 100 } }` | `z.number().min(0).max(100)` |
| `{ type: "Boolean" }` | `z.boolean()` |
| `{ type: "ENUM", params: ["a","b"] }` | `z.enum(["a","b"])` |
| `{ type: "Array", params: "String" }` | `z.array(z.string())` |
| `{ type: "TrimString" }` | `z.string().trim()` |

### 2. required() 移除

必填由 Zod schema 是否 `.optional()` 表达：

```diff
- api.body({ name: { type: "String" } }).required(["name"])
+ api.body(z.object({ name: z.string() }))  // 非 optional 即必填
```

### 3. requiredOneOf() 保留

多选一必填语义保留（无完美 Zod 等价）：
```typescript
api.requiredOneOf(["email", "phone"]); // email/phone 至少一个
```

### 4. 公开校验方法移除

以下内部方法不再公开（改由 `registerTyped` / `bind()` 内部预编译）：

- `erest.createSchema()`
- `erest.paramsChecker()`
- `erest.schemaChecker()`
- `erest.responseChecker()`
- `erest.apiParamsCheck()`

如需独立校验，直接用 Zod 的 `schema.parse(input)`。
```

- [ ] **Step 4: Commit**

```bash
git add MIGRATION.md
git commit -m "docs: 新增 v3.0 Stage 1 迁移指南"
```

---

## Task 11：最终验收

- [ ] **Step 1: ISchemaType 清零验证**

Run: `grep -rn "ISchemaType" src/lib/ | grep -v "// " | grep -v "MIGRATION"`
Expected: 空（或仅剩 zodTypeMap 相关注释）。

- [ ] **Step 2: params.ts 行数验证**

Run: `wc -l src/lib/params.ts`
Expected: < 400 行（基线 855）。

- [ ] **Step 3: 热路径零分配验证**

Run: `pnpm exec vitest run src/test/bench/validate.bench.ts`
Expected: `compiled.validate` 的 ops/sec ≥ `apiParamsCheck` 基线（应显著更优，无临时 z.object 构造）。

确认 `apiParamsCheck` 已从 params.ts 删除：
Run: `grep -n "apiParamsCheck\|z.object(schemaFields)" src/lib/params.ts`
Expected: 空。

- [ ] **Step 4: _def 引用集中验证**

Run: `grep -rn "_def" src/lib/`
Expected: 仅在 `plugin/generate_swagger` 和 `extend/docs.ts`（阶段 2 会统一到 zod-meta.ts）。

- [ ] **Step 5: 全量验证**

Run: `pnpm run check && pnpm run build && pnpm run test:lib && pnpm --filter erest-example test`
Expected: check 0 error / build 通过 / test:lib 全绿 / examples 全绿。

- [ ] **Step 6: 记录验收结果到 commit**

```bash
git add -A
git commit -m "test: Stage 1 验收通过（ISchemaType 清零/params 瘦身/零分配 bench）" --allow-empty
```

---

## Self-Review

**Spec coverage 核对：**
- §A Zod 唯一 → Task 5/6/9 删除 ISchemaType ✅
- §A 新参数定义 API（只接受 ZodObject）→ Task 6 Step 4 ✅
- §A zodTypeMap 保留 → Task 6 Step 1 保留 ✅
- §A 要删除的代码清单 → Task 5/6 ✅
- §B CompiledRoute → Task 2 ✅
- §B 热路径改造点（schemaChecker 临时构造/Object.assign/错误工厂）→ Task 6 删除 + Task 2 闭包裁剪 ✅
- §B adapter 复用 → Task 4 ✅
- §B 性能验证标准（bench + 零分配）→ Task 1/4/11 ✅
- 变更清单 8 项 → Task 1-10 全覆盖 ✅
- requiredOneOf 开放问题 → 关键设计决策 #1 拍板保留，Task 9 实现 ✅

**Placeholder scan：** 无 TBD/TODO，所有步骤含完整代码 ✅

**Type consistency：** `CompiledRoute.validate` 签名在 Task 2/3/4 一致；`LayeredParams` 统一定义（Task 2 Step 4 删旧重复）✅
