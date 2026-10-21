# API 测试

[返回首页](../README.md) · [API 定义](api.md) · [文档与 SDK](documentation.md)

本文介绍应用如何使用 erest 的测试工具；仓库自身的质量检查见[贡献指南](../CONTRIBUTING.md)。

## 初始化

先注册 API 并绑定宿主框架，再调用 `api.initTest(target)`。可传入 Express app、Koa app/callback、
LeizmWeb 的 `app.server` 或 Node HTTP Server；测试工具使用 fetch 发出真实请求。
使用已监听的 server 时，测试结束由调用方关闭。

以下 Vitest 片段假定 `app` 和 `api` 已装配完成，测试不再启动固定端口服务：

```typescript
import { createServer } from 'node:http';
import { beforeAll, afterAll, expect, it } from 'vitest';

const server = createServer(app); // Express；Koa 使用 app.callback()
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  api.initTest(server);
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

it('创建用户', async () => {
  const result = await api.test.post('/users').input({ name: 'Tom' }).success();
  expect(result).toEqual({ name: 'Tom' });
});

it('拒绝空名称', async () => {
  const response = await api.test.post('/users').input({ name: '' }).raw();
  expect(response.status).toBe(400);
});
```

请求路径使用服务实际挂载的完整路径，包括应用和分组前缀。

## 输入参数

| 方法 | 说明 |
| --- | --- |
| `.input(data)` | GET/DELETE 走 query；POST/PUT/PATCH 走 JSON body |
| `.query(data)` | 显式添加 query，也可与写请求的 input 配合 |
| `.headers(data)` | 添加请求头 |
| `.attach(data)` | multipart 字段或文件，用于 POST/PUT/PATCH |

因此 DELETE 的确认字段应声明为 query，例如 `z.object({ confirm: z.literal('yes') })`，
测试中使用 `.input({ confirm: 'yes' })`。query 的转换与数组边界见[SDK 说明](documentation.md#axios-sdk)。

## 响应与错误

`.success<T>()` 默认返回解析后的 JSON；类型参数用于调用方标注，不会额外执行运行时校验。
`.raw()` 返回 `{ status, headers, body, text }`，适合明确断言 HTTP 状态和响应头。

业务信封可用 `api.setFormatOutput()` 转换为 `[Error | null, data]`；配置
`setResponseEnvelopers` 时也可提供等价的 `testUnwrapper`。
`.success()` 使用该解析结果识别业务错误；需要验证 HTTP 状态码时使用 `.raw()`。

```typescript
api.setFormatOutput((out) => {
  const result = out as { success: boolean; data?: unknown; error?: string };
  return result.success ? [null, result.data] : [new Error(result.error ?? '请求失败'), null];
});
```

## 保存真实示例

在发出请求前调用 `.takeExample(name)`：

```typescript
await api.test.post('/users')
  .input({ name: 'Tom' })
  .takeExample('创建用户')
  .success();
api.genDocs('./docs', false); // 先创建输出目录
```

读取响应会标记该路由已测试；`takeExample` 记录请求与响应，生成的 Markdown 会展示示例和测试标记。
它们反映实际执行情况，不替代业务断言。可运行[示例工程的 docs:test](../examples/README.md#文档生成)
查看生成结果。
