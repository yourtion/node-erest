# erest 架构导航（给 AI 与新人）

> 面向**修改 erest 代码**的开发者（人与 AI）的架构地图与红线。面向使用者的入口见 [README.md](README.md)，详细用法见 [guides/](guides/)。
> 架构涵盖 Zod、插件化适配器、文档生成与测试系统；开发流程见 [贡献指南](CONTRIBUTING.md)。

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
    ├── generate_swagger/   # Swagger 2.0
    ├── generate_markdown/  # Markdown
    ├── generate_postman/   # Postman Collection
    └── generate_axios/     # Axios SDK

packages/             # v3.0：框架适配器实现独立子包（npm scope @erest/*，目录名仍为 erest-*）
├── erest-express/    # @erest/express — ExpressAdapter（Express 4/5）
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
7. **改了就 bump 版本** —— 任何涉及公开 API（接口/类型/行为/依赖声明）的改动，**必须同步 bump 版本号**，不能只改代码不留版本痕迹：
   - 根包 `erest` 与受影响的子包（`packages/erest-{express,koa,leizmweb,gen}/`）的 `version` 字段一起改，保持一致（`pnpm publish -r` 整体发布，版本不齐会乱）。
   - 语义化版本：bug 修复/文档/非 breaking 新增 → patch（x.y.Z）；新增向后兼容能力 → minor（x.Y.0）；breaking → major（X.0.0）。
   - 同步在 `MIGRATION.md` 加对应版本章节（即使非 breaking 也要登记新增/修复项）。
   - 默认通过 `.github/workflows/release.yml` 自动发版：版本 PR 合入 `main` 且 CI 通过后，维护者推送匹配的 `vX.Y.Z` tag。每个 npm 包须先绑定 Trusted Publisher，详见 `RELEASING.md`。
   - `publish:all` 仅保留为有发布凭据的明确手动操作；不要通过 `postpublish` 自动推 Git 分支或 tag。自动流程显式执行 `prepublishOnly`，再发布验证过的同一批 workspace-aware tarball。
   - 接入或修改 CI 不代表获准实际发版；只有用户明确授权后才推送发布 tag 或调用真实 publish。
   - 反例：只改了 `Reply.markSent()` 实现 + MIGRATION 登记，却忘了把 `3.2.0` 改成 `3.2.1` —— 这种「代码动了版本没动」会让下游无法通过版本号判断是否包含修复，必须避免。

> API 用法见 [API 定义](guides/api.md)、[框架接入](guides/adapters.md)和[文档与 SDK](guides/documentation.md)；测试/构建命令见 [贡献指南](CONTRIBUTING.md)。
