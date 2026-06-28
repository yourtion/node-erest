# erest 架构导航（给 AI 与新人）

> 面向**修改 erest 代码**的开发者（人与 AI）的架构地图与红线。面向使用者的内容见 README.md。
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
├── adapters/         # 框架适配器（v3.0：仅保留接口与工具，实现已拆到子包）
│   ├── types.ts      # FrameworkAdapter/Context/Reply/Middleware 接口
│   ├── utils.ts      # compose（洋葱式）+ buildHandlerChain
│   └── index.ts      # 仅 re-export types + compose/buildHandlerChain
├── extend/
│   ├── docs.ts       # 文档协调器（调度各生成插件）
│   └── test.ts       # 测试引擎（fetch 驱动）
└── plugin/           # 文档/SDK 生成插件
    ├── zod-meta.ts   # ★ Zod→文档元信息统一提取（extractDocFields 等，兼容 Zod 3/4）
    ├── generate_swagger/   # OpenAPI/Swagger
    ├── generate_markdown/  # Markdown
    ├── generate_postman/   # Postman Collection
    └── generate_axios/     # Axios SDK

packages/             # v3.0：框架适配器实现独立子包（npm scope @erest/*，目录名仍为 erest-*）
├── erest-express/    # @erest/express — ExpressAdapter（Express 4）
├── erest-koa/        # @erest/koa — KoaAdapter（Koa 3）
├── erest-leizmweb/   # @erest/leizmweb — LeizmWebAdapter（@leizm/web 2）
└── erest-gen/        # @erest/gen — codegen CLI（命令名 erest-gen）
```

## 改 X 去 Y（决策树）

| 要改的东西 | 去哪里 |
|-----------|--------|
| 参数校验逻辑 | `params.ts` 的 `compileValidate`（bind 阶段预编译） |
| 加新框架适配 | 新建子包 `packages/erest-<fw>/src/index.ts`，实现 `FrameworkAdapter` 接口（见 `adapters/types.ts`） |
| 改某框架适配实现 | `packages/erest-{express,koa,leizmweb}/src/index.ts`（`makeParamsChecker`/`bindRoute`/`createGroupRouter`/`attachGroupRouter`） |
| 改文档生成 | `plugin/<format>/` + `plugin/zod-meta.ts`（统一 Zod 提取） |
| 加生命周期 hook | `hooks.ts` 定义 + 各子包 `src/index.ts` 的 dispatch/checker 注入 |
| 改类型推导 | `api.ts` 的 `registerTyped` 泛型层 |
| 改错误处理 | `error.ts` + 各子包 `src/index.ts` 的 catch |
| 改路由绑定 | `index.ts` 的 `bind()` + 各子包 `src/index.ts` 的 `bindRoute` |
| 加新的 schema 类型别名 | `params.ts` 的 `zodTypeMap` |
| 改 Zod 内部结构读取 | `plugin/zod-meta.ts`（`_def.type`/`_def.typeName` 双轨兼容，禁止其他文件读 `_def`） |

## 必须遵守的约定

1. **schema 只用 Zod** —— ISchemaType 双轨体系已在 v3 移除，禁止重新引入。
2. **热路径零分配** —— 任何进入 `bind()` 装配的代码（checker/dispatch）不能在请求时构造临时对象。校验走 `compileValidate` 预编译的闭包。
3. **不反射读内部状态** —— adapter/docs/test 通过受控访问器（`getError()`/`getDocsView()`/`getTestView()`/`getHooks()`）获取所需数据，禁止 `privateInfo` 式反射。
4. **hook 是观察者** —— 同步、不参与控制流、异常被吞掉。无订阅者时 dispatch 裁剪掉 hook 调用（零开销）。
5. **breaking change 登记 MIGRATION.md** —— 公开 API 变动同步更新迁移指南。
6. **`_def` 读取集中** —— Zod 内部结构（`_def.type`/`_def.typeName`/`_def.shape`）只在 `plugin/zod-meta.ts` 读取，且必须通过 `getZodTypeName`/`getZodShape`/`getZodInner`/`extractDocFields` 工具函数（双轨兼容 Zod 3 与 Zod 4）。其他文件禁止直接读 `_def`。

> API 用法（registerTyped/bind/hooks/schema.register 等）与测试/构建命令见 README.md，此处不再重复。
