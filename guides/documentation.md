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
  docs: { openapi: true, axios: true, index: true },
});
// 在此注册 API
mkdirSync('./docs', { recursive: true });
api.genDocs('./docs', false);
```

第二个参数 `false` 表示立即写入；省略时默认在进程退出时写入。
生成器不创建输出目录。`info.basePath` 需与应用实际挂载路径一致，见[路由前缀](adapters.md#路由前缀与分组)。

| 选项 | 默认值 | 输出 |
| --- | --- | --- |
| `openapi` | `false` | `openapi.json`，OpenAPI 3.0.3 |
| `swagger` | `false` | `swagger.json`，Swagger 2.0 |
| `axios` | `false` | `jssdk.js`，Axios ESM SDK |
| `postman` | `false` | `postman.json`，Postman Collection |
| `json` | `false` | `doc.json`，文档数据快照 |
| `markdown` | `true` | Markdown 插件总开关 |
| `wiki` | `'./'` | `Home.md`、分组文档及 schema/type/error 页面 |
| `index` | `false` | `index.md` |
| `all` | `false` | Markdown 汇总及完整 JSON 数据 |

`openapi`、`swagger`、`axios`、`postman`、`json` 可指定字符串文件名。
要关闭 Markdown，设置 `markdown: false`。

生成内存中的文档：

```typescript
const openapi = api.buildOpenAPI();
const swagger = api.buildSwagger();
```

`buildOpenAPI()` 也支持在绑定服务器之前解析 builder 的内联和命名响应 schema。
按需添加自定义生成器可用 `api.addDocPlugin(name, plugin)`；先调用一次 `buildOpenAPI()` 或
`genDocs()` 初始化文档协调器，再注册插件。插件接收文档数据、输出目录、选项和 writer。

## OpenAPI 3 与 Swagger 2

| 内容 | OpenAPI 3.0.3 | Swagger 2.0 |
| --- | --- | --- |
| URL | `servers` | `schemes`、`basePath` |
| 命名类型 | `components.schemas` | `definitions` |
| 请求体 | `requestBody.content` | 单个 `in: body` 参数 |
| 响应 | `responses.*.content` | `responses.*.schema` |
| 普通 union | 标准 `anyOf` | 扩展 `x-anyOf` |
| 可空值 | 标准可空分支 | 扩展 `x-nullable` |
| 多值 query | `style: form, explode: true` | `collectionFormat: multi` |

两个格式可同时生成。OpenAPI 3 保留 Zod 4 的声明式约束，如字符串长度/模式、数值范围、
数组长度、枚举和默认值，并将递归与重用引用放入组件。普通 union 使用 `anyOf`，
允许一个值同时匹配多个分支；nullable enum/union 也能接受 `null`。

Swagger 2 保留数组元素、嵌套对象和必填字段；其扩展不能提供标准 union 校验。
新的集成推荐使用 OpenAPI 3。

## Axios SDK

在客户端安装 Axios 1.x，再导入生成的 ESM 文件：

```javascript
import sdk from './docs/jssdk.js';

sdk.instance.defaults.baseURL = 'https://example.com/api';
await sdk.postUsers({ name: 'Tom' });
await sdk.deleteItemsId('42', { confirm: 'yes' });
await sdk.putItemsId('42', { name: 'new name' }, { trace: 'request-1' });
```

上例中的方法分别对应 `/users`、`/items/:id` 路由，需先注册对应 schema 再生成 SDK。
命名规则为 HTTP 方法加路径驼峰形式。路径参数沿用 params schema 的字段声明顺序；
未声明的路径参数随后按路由顺序补入。没有 params schema 时，全部按路由顺序传入。
为兼容已有 SDK 的位置参数，已声明但未出现在路径中的字段仍保留原有形参位置。
未声明或部分声明 params schema 时，缺少的路径参数按字符串补入 OpenAPI；只有路由中实际存在的参数
才会列为 path parameter，并始终标记 required。仍建议声明完整 params schema 以获得运行时校验。
SDK 的路径、body、query 形参共用避撞规则；同名字段使用内部别名，调用时的对象键保持原样。

| 方法 | 主输入对象 | 额外 query |
| --- | --- | --- |
| GET / DELETE | query | 包含在主输入对象中 |
| POST / PUT / PATCH | JSON body | 声明 query 时，在 body 后传独立对象 |

只有 query 的写请求，在路径参数后直接传 query 对象。可选输入对象可省略。
请求默认使用文档中的 host/basePath；需要额外请求头等设置可通过 `sdk.instance.defaults` 或 Axios 拦截器配置。

query 数组使用重复键，如 `tag=a&tag=b`。宿主框架可能把单元素解析成标量、空数组解析成缺失，
应用需在 query schema 中处理这种情况。数字 query 使用 `z.coerce.number()`；不要假设 query parser
会还原完整 JSON 对象。任意动态字段等复杂 schema 的 SDK 参数需要应用自行适配。

## 表达范围

文档中的响应 schema 描述声明的 `response`。当前生成器使用 `200` 成功响应；应用自定义的
其他状态码、错误响应及成功信封包装，不会自动合成为完整的线上响应 schema，可通过自定义插件扩展。

请求与响应的 OpenAPI 转换都取 schema 的输入语义，匹配运行时“检查返回值但不替换它”的行为。
非 JSON 类型和自定义 refine/preprocess/transform 函数无法完整表达；未支持类型以 `x-zod-type`
标记，OpenAPI 3.0 无法表示的 JSON Schema 关键字以 `x-json-schema-*` 保留。
这些扩展不会自动成为标准校验规则。

生成的 Markdown 支持展示数组元素、union 分支和真实示例。记录真实示例的方法见
[API 测试](testing.md#保存真实示例)，完整脚本见[示例工程](../examples/README.md#文档生成)。
