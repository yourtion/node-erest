# erest 架构导航（给 AI 与新人）

> 本文档面向**修改 erest 代码**的开发者（人与 AI）。面向使用者的内容见 README.md。
> 最后更新：v3.0 重构完成后（Stage 1-3）。

## 一图看懂

```
src/lib/
├── index.ts          # ERest 门面：组合各子系统，暴露 bind/api/test/docs/schema
├── api.ts            # API 定义与注册：链式 builder + registerTyped（类型推导）
├── params.ts         # Zod 校验：compileValidate 预编译（热路径零分配）+ zodTypeMap
├── error.ts          # ERestError + 错误工厂
├── hooks.ts          # 生命周期 hook 类型（onRequest/onValidate/onError/onResponse）
├── debug.ts          # debug 模块封装
├── utils.ts          # 通用工具（路径/schemaKey 等）
├── adapters/         # 框架适配器
│   ├── types.ts      # FrameworkAdapter/Context/Reply/Middleware 接口
│   ├── utils.ts      # compose（洋葱式）+ buildHandlerChain
│   ├── express.ts    # Express adapter
│   ├── koa.ts        # Koa adapter
│   └── leizmweb.ts   # @leizm/web adapter
├── extend/
│   ├── docs.ts       # 文档协调器（调度各生成插件）
│   └── test.ts       # 测试引擎（fetch 驱动）
└── plugin/           # 文档/SDK 生成插件
    ├── zod-meta.ts   # ★ Zod→文档元信息统一提取（extractDocFields 等）
    ├── generate_swagger/   # OpenAPI/Swagger
    ├── generate_markdown/  # Markdown
    ├── generate_postman/   # Postman Collection
    └── generate_axios/     # Axios SDK
```

## 改 X 去 Y（决策树）

| 要改的东西 | 去哪里 |
|-----------|--------|
| 参数校验逻辑 | `params.ts` 的 `compileValidate`（bind 阶段预编译） |
| 加新框架适配 | `adapters/<fw>.ts`，实现 `FrameworkAdapter` 接口（见 `types.ts`） |
| 改文档生成 | `plugin/<format>/` + `plugin/zod-meta.ts`（统一 Zod 提取） |
| 加生命周期 hook | `hooks.ts` 定义 + `adapters/*.ts` 的 dispatch/checker 注入 |
| 改类型推导 | `api.ts` 的 `registerTyped` 泛型层 |
| 改错误处理 | `error.ts` + `adapters/*.ts` 的 catch |
| 改路由绑定 | `index.ts` 的 `bind()` + `adapters/*.ts` 的 `bindRoute` |
| 加新的 schema 类型别名 | `params.ts` 的 `zodTypeMap` |

## 必须遵守的约定

1. **schema 只用 Zod** —— ISchemaType 双轨体系已在 v3 移除，禁止重新引入。
2. **热路径零分配** —— 任何进入 `bind()` 装配的代码（checker/dispatch）不能在请求时构造临时对象。校验走 `compileValidate` 预编译的闭包。
3. **不反射读内部状态** —— adapter/docs/test 通过受控访问器（`getError()`/`getDocsView()`/`getTestView()`/`getHooks()`）获取所需数据，禁止 `privateInfo` 式反射。
4. **hook 是观察者** —— 同步、不参与控制流、异常被吞掉。无订阅者时 dispatch 裁剪掉 hook 调用（零开销）。
5. **breaking change 登记 MIGRATION.md** —— 公开 API 变动同步更新迁移指南。
6. **`_def` 读取集中** —— Zod 内部结构（`_def.typeName`/`_def.shape`）只在 `plugin/zod-meta.ts` 读取，其他文件用 `extractDocFields`/`getZodShape` 等工具函数。

## 常见任务套路

### 新增一个 API（推荐 registerTyped，类型安全）

```typescript
apiService.api
  .post("/users")
  .group("user")
  .registerTyped(
    {
      body: z.object({ name: z.string(), age: z.number().int() }),
      response: z.object({ id: z.string() }),
    },
    (req, reply) => {
      // req.body.name: string，req.body.age: number（编译期推导）
      return { id: "u1" };
    }
  );
```

### 新增一个 API（链式 register，ctx 风格）

```typescript
apiService.api
  .get("/users/:id")
  .group("user")
  .params(z.object({ id: z.string() }))
  .register((ctx) => {
    ctx.reply.json({ id: ctx.$params.id });
  });
```

### 绑定到框架

```typescript
// Express
apiService.bind({ framework: "express", router });

// Koa（forceGroup 模式）
apiService.bind({ framework: "koa", app, router: KoaRouter });
```

### 加生命周期 hook

```typescript
const api = new ERest({
  groups: { user: "用户" },
  hooks: {
    onRequest: (ctx) => { /* 注入 traceId */ },
    onError: (ctx, err) => { /* 结构化错误日志 */ },
  },
});
```

### 注册自定义 Zod 类型（文档 $ref 用）

```typescript
apiService.schema.register("UserId", z.string().regex(/^u_\w+$/));
// 文档生成时可用 response: "UserId" 引用
```

## 测试

- `pnpm run test:lib` —— 核心库测试（ISLIB=1 源码模式）
- `pnpm --filter erest-example test` —— examples 端到端
- `pnpm run bench` —— 校验热路径基准（compiled.validate）
- `pnpm run check` —— oxlint + oxfmt（必须 0 error）
