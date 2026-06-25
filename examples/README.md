# erest 端到端示例

**一份 API 定义，三个框架入口。** 演示 erest 的正确集成姿势——handler 声明一次，被
@leizm/web / Express / Koa 三个框架复用，仅 `bind()` 参数不同。

## 目录结构

```
examples/
├── src/
│   ├── api.js        # 核心：路由 + handler 声明一次（registerTyped + reply，框架无关）
│   ├── store.js      # 内存存储（示例用）
│   └── entries/
│       ├── leizmweb.js   # @leizm/web 入口：中间件链 + bind({ framework:'leizmweb' })
│       ├── express.js    # Express 入口：中间件链 + bind({ framework:'express' })
│       └── koa.js        # Koa 入口：中间件链 + bind({ framework:'koa' })
└── types/
    └── erest.d.ts    # NodeNext 下的模块增强声明（可选，仅 TS 工程）
```

**关键点**：`src/api.js` 里的 handler 用 `registerTyped` 的 `(req, reply)` 签名——`req` 是
分层校验后的参数（类型由 Zod 推导），`reply` 是框架无关的响应接口。因此 handler 不依赖任何
框架的 ctx/res，三个入口直接复用同一份 `registerUserApi()`。

## 演示要点

- **类型安全**：`req.body` / `req.params` / `req.query` 类型由 Zod schema 自动推导，无 `as` 断言。
- **框架无关 handler**：`reply.json()` / `reply.status()` 统一封装三框架的响应写入。
- **分层参数**：`PUT /users/:id` 的 path `id` 与 body 字段经分层 `req.params` / `req.body` 互不覆盖。
- **中间件链**：每个入口展示对应框架的标准中间件顺序（日志 / body 解析 / 路由 / 错误处理）。
- **ESM 接入**：`import ERest from 'erest'` 直接可用，无需 `createRequire`。

## 运行

```bash
cd examples
npm install

# 任选一个框架启动（都监听 3100）
npm run start:leizmweb   # 或 start:express / start:koa
```

## 示例请求（三框架行为一致）

```bash
# 创建用户（body 经 registerTyped 校验 + 类型推导）
curl -X POST http://localhost:3100/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Tom","email":"tom@ex.com","age":20}'

# 获取用户（params + query 类型推导）
curl http://localhost:3100/api/users/1
curl 'http://localhost:3100/api/users/1?includeEmail=true'

# 更新用户（path id 与 body 分层，互不覆盖）
curl -X PUT http://localhost:3100/api/users/1 \
  -H "Content-Type: application/json" \
  -d '{"name":"Jerry"}'

# 校验失败（age 非整数 → 400）
curl -i -X POST http://localhost:3100/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Tom","email":"tom@ex.com","age":15.5}'
```

## TypeScript 集成（NodeNext）

若你的工程使用 `module: nodenext` + `verbatimModuleSyntax`，可参考 `types/erest.d.ts`
补充模块增强声明，消除默认导入的类型报错（运行时不受影响）。
