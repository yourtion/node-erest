# 文档与 SDK

[返回首页](../README.md) · [API 定义](api.md) · [API 测试](testing.md)

## 生成文件

在创建实例时选择格式，注册 API 后保存：

```typescript
import { mkdirSync } from 'node:fs';
import { createERest } from '@erest/express';

const api = createERest({
  info: { title: 'My API', version: '1.0.0', host: 'https://example.com', basePath: '/api' },
  groups: { users: '用户' },
  docs: { swagger: true, axios: true, index: true },
});
// 在此注册 API
mkdirSync('./docs', { recursive: true });
api.genDocs('./docs', false);
```

第二个参数 `false` 表示立即写入；省略时默认在进程退出时写入。
生成器不创建输出目录。`info.basePath` 需与应用实际挂载路径一致，见[路由前缀](adapters.md#路由前缀与分组)。

| 选项 | 默认值 | 输出 |
| --- | --- | --- |
| `swagger` | `false` | `swagger.json`，Swagger 2.0 |
| `axios` | `false` | `jssdk.js`，Axios ESM SDK |
| `postman` | `false` | `postman.json`，Postman Collection |
| `json` | `false` | `doc.json`，文档数据快照 |
| `markdown` | `true` | Markdown 插件总开关 |
| `wiki` | `'./'` | `Home.md`、分组文档及 schema/type/error 页面 |
| `index` | `false` | `index.md` |
| `all` | `false` | Markdown 汇总及完整 JSON 数据 |

`swagger`、`axios`、`postman`、`json` 可指定字符串文件名。
要关闭 Markdown，设置 `markdown: false`。
Markdown 索引中的 Swagger、SDK、Postman 链接使用默认文件名；使用自定义文件名时需核对链接。

生成内存中的文档可调用 `api.buildSwagger()`。
按需添加自定义生成器可用 `api.addDocPlugin(name, plugin)`；先调用一次 `buildSwagger()` 或
`genDocs()` 初始化文档协调器，再注册插件。插件接收文档数据、输出目录、选项和 writer。

## Axios SDK

在客户端安装 Axios，再导入生成的 ESM 文件：

```javascript
import sdk from './docs/jssdk.js';

sdk.instance.defaults.baseURL = 'https://example.com/api';
await sdk.postUsers({ name: 'Tom' });
await sdk.getUsersId('42');
```

上例分别对应 `/users`、`/users/:id`，需先注册对应路由及 schema。
命名规则为 HTTP 方法加路径驼峰形式；路径参数须声明 params schema，并按位置传入。
GET 的主输入取自 query，POST/PUT/PATCH 的主输入取自 body。
需要额外请求头等设置可通过 `sdk.instance.defaults` 或 Axios 拦截器配置。

当前生成器对 DELETE 输入和写请求的额外 query 支持有限，建议用 Axios 显式设置 `params`，
并检查实际请求。数组序列化需与宿主 query parser 配合；数字 query 应显式使用 `z.coerce.number()`。
动态字段等复杂 schema 的参数也需自行适配，不应假设生成物能覆盖所有运行时用法。

## 表达范围

当前输出格式是 Swagger 2.0。生成器仅为 POST 自动描述请求体，复杂数组、union、nullable
及 Zod 函数规则不能保证完整映射；使用 PUT/PATCH 请求体或复杂 schema 时，应核对并补充生成文档。

文档中的响应 schema 描述声明的 `response`，使用 `200` 成功响应；应用自定义的其他状态码、
错误响应及成功信封包装，不会自动合成为完整的线上响应 schema，可通过自定义插件扩展。

记录真实请求与响应的方法见[API 测试](testing.md#保存真实示例)，完整脚本见
[示例工程](../examples/README.md#文档生成)。
