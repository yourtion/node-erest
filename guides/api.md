# API 定义

[返回首页](../README.md) · [框架接入](adapters.md) · [文档与 SDK](documentation.md)

以下片段中的 `api` 是适配器 `createERest()` 创建的实例，`z` 从 `erest` 或宿主项目的 `zod` 导入。
完整运行方式见[快速开始](../README.md#快速开始)。

## Schema 与参数来源

`registerTyped` 根据 Zod schema 推导 `req.params/query/body/headers`，在 handler 执行前校验参数。
请求体的 JSON 解析由宿主框架中间件完成，见[框架接入](adapters.md)。

```typescript
api.api.put('/users/:id').group('users').title('更新用户').registerTyped(
  {
    params: z.object({ id: z.string() }),
    query: z.object({ revision: z.coerce.number().int().optional() }),
    body: z.object({ name: z.string().min(1), age: z.number().int().min(18) }),
  },
  (req, ctx) => {
    ctx.reply.json({ id: req.params.id, ...req.body, revision: req.query.revision });
  },
);
```

- `.optional()` 表示可选，`.default(value)` 提供默认值。
- query 和路径中的值通常是字符串；数字使用 `z.coerce.number()` 等显式转换。
- DELETE 的输入建议声明为 `query`，与测试工具和 SDK 的默认约定一致。
- 相同字段名可出现在不同来源，使用 `req.params.id`、`req.body.id` 分别读取。

动态对象可用 `z.anyObject()`，等价于 `z.object({}).catchall(z.unknown())`；这是
`erest` 导出的 `z` 上的扩展，也可具名导入 `zAnyObject`。

## Handler 与响应

| 注册方式 | Handler 签名 | 用途 |
| --- | --- | --- |
| `registerTyped(schemas, handler)` | `(req, ctx)` | 按 schema 推导分层参数类型 |
| `register(handler)` | `(ctx, next)` | 手动读取参数，或控制中间件链 |
| `define({ handler, ... })` | `(ctx, next)` | 声明式注册完整路由配置 |

这些 handler 接收 erest 的标准上下文。通用响应方法为
`ctx.reply.json(data)`、`ctx.reply.status(code)`、`ctx.reply.send(text)`。

### Return 模式与响应校验

需要让 handler 直接返回数据时，在绑定路由前设置成功和错误响应包装器。原样返回可使用：

```typescript
api.setResponseEnvelopers({
  success: (data) => data,
  error: (err) => defaultErrorFormatter(err as Error),
});

api.api.get('/users/:id').group('users').title('用户详情').registerTyped(
  {
    params: z.object({ id: z.string() }),
    response: z.object({ id: z.string(), name: z.string() }),
  },
  (req) => ({ id: req.params.id, name: 'Tom' }),
);
```

`registerTyped({ response }, handler)` 声明响应后，非 `undefined` 的 handler 返回值会经
`response.parse()` 校验，再交给
成功包装器。运行时不会用 parse 的返回值替换原数据；响应 schema 的 transform/default 不会
自动改写返回值。手动调用 `ctx.reply.json()` 的内容不经过这项返回值校验。

业务可定义自己的信封：

```typescript
api.setResponseEnvelopers({
  success: (data) => ({ success: true, data }),
  error: (err) => {
    const { status, body } = defaultErrorFormatter(err as Error);
    return { status, body: { success: false, error: body } };
  },
});
```

`defaultErrorFormatter` 从 `erest` 导入。未启用响应包装时，异常交给宿主框架的错误中间件。
测试信封的解析见 [API 测试](testing.md#响应与错误)，生成文档的响应边界见
[文档与 SDK](documentation.md#表达范围)。

### 原生响应

`ctx.reply.raw` 可访问 cookie、重定向、流等宿主能力，具体形态见[原生上下文](adapters.md#原生上下文)。
在 return 模式下，如果经 raw 手动写完响应，需要调用 `ctx.reply.markSent()`，跳过自动包装。

```typescript
// Express；api 由 @erest/express 的 createERest() 创建
api.api.get('/export').group('users').title('导出').registerTyped({}, (_req, ctx) => {
  ctx.reply.raw.res.setHeader('Content-Type', 'text/csv');
  ctx.reply.raw.res.end('id,name\n1,Tom');
  ctx.reply.markSent();
});
```

## 注册与复用 Schema

```typescript
const User = z.object({ id: z.string(), name: z.string() });
api.schema.register('User', User);
api.type.register('UserName', z.string().min(1));

api.api.get('/current-user').group('users').title('当前用户')
  .response('User')
  .registerTyped({}, (_req, ctx) => ctx.reply.json({ id: '1', name: 'Tom' }));
```

`response()` 接受命名 schema 或 Zod schema；注册表也用于生成文档组件。
`requiredOneOf(['email', 'phone'])` 是多选一必填的便利方法；字段本身应声明为 optional。
自定义规则可直接写在 Zod schema 中，其文档映射边界见[表达范围](documentation.md#表达范围)。

## 分组与中间件

启用 `forceGroup: true` 后，通过 `api.group(name)` 注册路由；分组前缀见[框架接入](adapters.md#路由前缀与分组)。

```typescript
api.group('admin').before(async (ctx, next) => {
  if (ctx.headers.authorization !== 'demo-token') {
    throw new ERestError('PERMISSION_DENIED', '需要登录', undefined, 401);
  }
  await next();
});
```

`ERestError` 从 `erest` 导入。执行顺序为：全局 before → 分组 before → 路由 before →
参数校验 → 分组 middleware → 路由 middleware → handler。`before` 适合鉴权，
`middleware` 可读取校验后的参数；二者都通过 `await next()` 继续执行。

## State 与生命周期观察

使用适配器工厂的泛型声明共享 state：

```typescript
import { createERest } from '@erest/express';

type State = { userId?: string };
const api = createERest<State>({ groups: { users: '用户' } });
api.beforeHooks(async (ctx, next) => {
  ctx.state.userId = 'demo-user';
  await next();
});
```

构造选项 `hooks` 提供 `onRequest`、`onValidate`、`onError`、`onResponse`。
这些是同步观察回调，异常会被忽略，适合日志与计时；鉴权等控制流使用 before/middleware。

## Register 的参数访问

手动 `register()` 时，校验结果在标准上下文上：

| 访问器 | 内容 |
| --- | --- |
| `ctx.$validated` | 分层的 `{ params, query, body, headers }` |
| `ctx.$pathParams` / `$query` / `$body` / `$headers` | 单个来源 |
| `ctx.$params` | 按 params → query → body → headers 合并的扁平对象，同名字段会覆盖 |

`registerTyped` 已提供类型化的 `req`，通常无需再使用这些访问器。
