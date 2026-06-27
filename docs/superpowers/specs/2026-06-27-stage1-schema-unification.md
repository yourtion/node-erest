# 阶段 1：Schema 统一 + 性能预编译（地基）

- 日期：2026-06-27
- 分支：`feat/refactor-v2`
- 阶段：1 / 3（地基）
- 状态：设计已确认，待 plan
- 关联：总览 `2026-06-27-refactor-v2-overview.md`；后续 stage2 依赖本阶段产出的统一 Zod 类型地基

## 目标

把 erest 的参数 schema 体系从**双轨（ISchemaType + 原生 Zod）收敛为 Zod 唯一**，并在 `bind()` 阶段把所有校验逻辑**预编译为热路径零分配**的闭包。本阶段是整个重构的地基——后续 builder DSL、文档生成、测试重写全部依赖它产出的稳定类型基础。

> S1 与 S2 在代码上高度重叠（都改 `params.ts`/`api.ts` 的 `init()`/`precompileSchemas()`），合并在一个 spec 内设计，避免改两次。

## 背景：双轨 schema 的代价

当前 `params.ts`（855 行）维护两套等价实现：

| 路径 | 入口 | 重复的实现 |
|------|------|-----------|
| ISchemaType Record | `api.body({ name: {type:'String'} })` | `createZodSchema` / `buildZodObjectFromSchemaType` / `schemaChecker` 里 ENUM/Array/Number+min-max 分支出现 **3 次** |
| 原生 Zod | `api.body(z.object({...}))` 或 `registerTyped({body: schema})` | 同一套 ENUM/Array/Number 分支在 `buildZodObjectFromSchemaType` 又写一遍 |

`api.ts` 的 `body()/query()/params()/headers()` 四个方法完全同构，每个都做：
```
isZodSchema(obj) → setZodSchema
else isISchemaTypeRecord(obj) → checkMixedUsage + setParams
else → throw
```
并附带运行时"不能混用 ISchemaType 和 Zod"的抛错（`setZodSchema`/`checkMixedUsage`）。

**性能问题**：`precompileSchemas()` 只对 ISchemaType Record 做了预编译，但 `apiParamsCheck` 走 ISchemaType 路径时**没有复用预编译结果**——`schemaChecker` 仍然每请求临时 `z.object(schemaFields)` 构造。`Object.assign` 在每请求被调用 4-8 次。

## §A — S1：Schema 统一（Zod 唯一）

### 决策

原生 Zod schema 成为**唯一的一等公民**。ISchemaType Record（`{type:'String', comment:...}`）彻底废弃移除。

- API 定义层（`api.body/query/params/headers`）只接受 `z.ZodObject` 或 `z.ZodType`
- `registerTyped` 成为**默认且唯一**的类型安全注册入口（见 §B 关于 `register` 的去留）
- 文档生成层不再读 `api.options.query`（ISchemaType Record），改读 `api.options.querySchema`（Zod）
- 错误消息从 Zod issue 统一生成，不再有 ISchemaType 专属分支

### 新的参数定义 API

```typescript
// 唯一形态：传 ZodObject
api.api
  .post('/users')
  .group('user')
  .body(z.object({
    name: z.string().min(1).max(50),
    age: z.number().int().min(18),
  }))
  .register(handler);

// registerTyped 仍是推荐的类型安全入口（handler 内 req.body 自动推导）
api.api
  .post('/users')
  .group('user')
  .registerTyped(
    { body: z.object({ name: z.string() }) },
    (req, reply) => { /* req.body: { name: string } */ }
  );
```

### 内建类型映射的处理

`zodTypeMap`（`params.ts` 71-176 行，包含 `TrimString`/`Integer`/`IntArray`/`MongoIdString` 等 40+ 别名）当前通过 ISchemaType 的 `type` 字符串间接引用。废弃 ISchemaType 后：

- **保留** `zodTypeMap` 作为**导出的类型别名表**，供 `erest.type.register(name, schema)` 复用与文档生成
- **不再**作为参数定义的路径——用户直接用 `z.string().trim()` 而非 `{type:'TrimString'}`
- 文档生成层通过 `zodTypeMap` 反查已注册类型名（用于 `$ref`）

### 要删除的代码

| 位置 | 删除内容 |
|------|----------|
| `params.ts` | `createZodSchema`（ISchemaType→Zod 转换）、`buildZodObjectFromSchemaType`、`schemaChecker` 中 ISchemaType 分支、`paramsChecker`（单字段 ISchemaType 校验）、`isISchemaType`/`isISchemaTypeRecord` |
| `api.ts` | `APIOption` 的 `query/body/params/headers: Record<string, ISchemaType>` 字段、`setParam`/`setParams`/`checkMixedUsage`/`setZodSchema`、`body/query/params/headers` 方法的 ISchemaType 分支、`required`/`requiredOneOf`（改由 Zod 的 `.optional()` 表达） |
| `index.ts` | `paramsChecker()`/`schemaChecker()`/`responseChecker()`/`apiParamsCheck()` 公开方法、`createSchema()` |
| 全局 | `ISchemaType`/`INumericParams`/`IEnumParams`/`IArrayParams` 类型导出 |

### 破坏性变更（登记到 MIGRATION.md）

```diff
- api.body({ name: { type: 'String', required: true }, age: { type: 'Integer' } })
+ api.body(z.object({ name: z.string(), age: z.number().int() }))

- api.required(['name'])            // 改由 z.string() 非 optional 表达
- api.requiredOneOf([['a','b']])    // 改由 z.union([z.object({a:...}), z.object({b:...})]) 表达

- api.paramsChecker() / schemaChecker() / responseChecker()  // 内部细节不再公开
```

> 迁移路径明确：ISchemaType Record → 等价的 `z.object({...})`，每个 `type:'X'` 对应 `zodTypeMap.X`。

---

## §B — S2：性能预编译（热路径零分配）

### 决策

所有校验/schema/错误工厂在 `bind()` 阶段（即 `API.init()` + adapter 的 `bindRoute`）**预编译**成最接近原生的形式。**请求热路径零对象分配**。

### 预编译的内容

每个 API 在 `init()` 阶段产出一份 **`CompiledRoute`**：

```typescript
interface CompiledRoute {
  // 预构造的 Zod schema（safeParse 复用同一实例，不每请求重建）
  paramsSchema?: z.ZodObject<any>;   // 已存在，复用 precompileSchemas 结果
  querySchema?: z.ZodObject<any>;
  bodySchema?: z.ZodObject<any>;
  headersSchema?: z.ZodObject<any>;
  responseSchema?: z.ZodType;

  // 预绑定的校验执行器：输入原始 ctx，输出 layered 结果或抛 ERestError
  // 闭包捕获 schema + 错误工厂，热路径只调用此函数
  validate: (input: {
    params?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: unknown;
    headers?: Record<string, unknown>;
  }) => LayeredParams;
}
```

### 热路径改造点

| 当前（每请求） | 改造后（bind 阶段预算） |
|----------------|----------------------|
| `schemaChecker` 临时 `z.object(schemaFields)` | `init()` 预构造 `querySchema` 等，热路径直接 `schema.safeParse(input)` |
| `apiParamsCheck` 每请求 `Object.keys().length` 判断 4 层 | `validate` 闭包在 bind 时据 schema 有无**裁剪**为只调用存在的层 |
| `Object.assign(newParams, res)` ×4-8 次 + 构造 `layered` | `validate` 直接返回 `{ params, query, body, headers }` 字面量，无 assign |
| adapter `makeParamsChecker` 每请求构造 6 个赋值（`$validated/$params/$pathParams/...`） | bind 阶段决定注入哪些访问器（registerTyped 只需 `$validated`），热路径只赋值必要的 |
| 错误工厂 `error.missingParameter(msg)` 每次新建 Error | 保留（Error 必须新建，但消息构造可预算部分模板） |

### adapter 的复用

Express/Koa/leizmweb 的 `makeParamsChecker` 当前逐字相同（都调 `apiParamsCheck` + 注入 6 字段）。改造后：

- `makeParamsChecker` 改为返回**调用 `compiled.validate` 并注入结果的薄包装**
- 三个 adapter 的差异仅剩 `bindRoute` 里构造 `Context` 的部分（框架原生 ctx → 标准 Context）
- 这为阶段 2 的 adapter 插件化（抽公共基类）铺路

### 性能验证标准

- 基准测试：新增 `src/test/bench/validate.bench.ts`，对比改造前后单次校验耗时与 GC 次数
- 目标：registerTyped 快路径单次校验 **不引入新的对象分配**（用 `--expose-gc` + 堆快照 diff 验证）
- 不追求绝对微秒级优化，只确保**封装抽象不带来回归**

## 变更清单

| # | 文件 | 说明 |
|---|------|------|
| 1 | `src/lib/params.ts` | 删除 ISchemaType 全套（createZodSchema/buildZodObjectFromSchemaType/schemaChecker 的 ISchemaType 分支/paramsChecker/isISchemaType*）；保留 `zodTypeMap` 导出 + `responseChecker`（改纯 Zod 输入）；新增 `CompiledRoute`/`compileValidate` |
| 2 | `src/lib/api.ts` | `body/query/params/headers` 只接受 `ZodType`；删除 `setParam/setParams/checkMixedUsage/setZodSchema`；`init()` 产出 `CompiledRoute`；删除 `required/requiredOneOf` 方法与 `APIOption` 对应字段 |
| 3 | `src/lib/index.ts` | 删除 `paramsChecker/schemaChecker/responseChecker/apiParamsCheck/createSchema` 公开方法；`registerTyped` 设为推荐主入口 |
| 4 | `src/lib/adapters/{express,koa,leizmweb}.ts` | `makeParamsChecker` 改用 `compiled.validate`；裁剪热路径注入字段 |
| 5 | `src/lib/adapters/utils.ts` | `buildHandlerChain` 适配 `CompiledRoute` |
| 6 | `src/test/*` | 删除 ISchemaType 相关测试；改造 `test-params.ts`/`test-schema-coverage.ts`（后者大量 `_def` hack 随 ISchemaType 一起删）；新增 bench |
| 7 | `examples/src/api.js` | ISchemaType 用法改为 Zod（仅 schema 迁移；`supertest` 清理归阶段 2） |
| 8 | `MIGRATION.md` | 登记 ISchemaType → Zod 迁移指南 |

## 验证标准（完成判据）

1. `src/lib` 中 `grep -r "ISchemaType"` 仅剩注释/迁移说明，无实际类型引用
2. `params.ts` 行数显著下降（目标 < 400，当前 855）
3. `apiParamsCheck` 热路径无临时 `z.object()` 构造（grep 验证 + bench 验证）
4. `pnpm run check` 0 error；`pnpm run test:cov` 全绿；`pnpm --filter erest-example test` 全绿
5. bench 显示 registerTyped 快路径无新增堆分配
6. 三框架 adapter 的 `makeParamsChecker` 不再逐字重复（公共逻辑收敛）

## 风险

- **ISchemaType 用户迁移成本**：靠 MIGRATION.md + `zodTypeMap` 别名表降低；属于已确认的 breaking change
- **required/requiredOneOf 移除**：`requiredOneOf`（多选一必填）没有完美 Zod 等价，需在 spec plan 阶段确认是否保留为独立 API 或用 `z.union` 表达。**待 plan 细化的开放问题**。
- **bench 基线**：当前无 bench，需先建立改造前基线再对比
