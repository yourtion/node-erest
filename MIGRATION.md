# 迁移指南：erest v3.0

本版本对参数 schema 体系做了破坏性重构，并把参数校验改为 `bind()` 阶段预编译。

## Stage 1 — Schema 统一（Zod 唯一）

把参数 schema 体系从双轨（ISchemaType + 原生 Zod）收敛为 **Zod 唯一**。

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
| `{ type: "Email" }` | `z.string().email()` |
| `{ type: "Date" }` | `z.coerce.date()` |

> Query string 中的值是字符串，若希望自动转数字/日期，用 `z.coerce.number()` / `z.coerce.date()`。

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

以下内部方法不再公开（校验已由 `registerTyped` / `bind()` 内部预编译完成）：

- `erest.createSchema()`
- `erest.paramsChecker()`
- `erest.schemaChecker()`
- `erest.responseChecker()`
- `erest.apiParamsCheck()`
- `erest.schema.createZodSchema()`

如需独立校验，直接用 Zod 的 `schema.parse(input)`。

### 5. 错误消息简化

校验失败消息从 ISchemaType 专属分支统一为 Zod issue 派生：

- 缺失必填：`missing required parameter 'field'`（不变）
- 类型错误：`incorrect parameter 'field' should be valid`（去掉了类型后缀，如原 `should be valid Integer`）

### 6. 性能提升

参数校验在 `bind()` 阶段预编译为热路径零分配闭包，基准测试显示校验吞吐约 **2x 提升**。
