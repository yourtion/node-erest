# @erest/gen

从 Zod schema 源码生成 `registerTyped` handler 骨架。当前只支持 `handler` 命令。

## 安装与运行

npm 包名是 `@erest/gen`，命令名是 `erest-gen`：

```bash
pnpm add -D @erest/gen
pnpm exec erest-gen handler --from schemas/user.ts --group user
pnpm exec erest-gen handler --from schemas/user.ts --group user --out handlers/user.ts
```

省略 `--out` 时输出到 stdout；输出目录须预先创建。省略 `--group` 时分组为 `Index`。

## 输入与结果

输入文件采用以下导出形式：

```typescript
import { z } from 'zod';

export const UserCreateSchema = z.object({
  name: z.string(),
  age: z.number().int(),
});
```

每个识别到的 schema 会生成一个 POST handler，如 `UserCreateSchema` → `/user-create`：

```typescript
api.post('/user-create').group('user').registerTyped(
  { body: UserCreateSchema },
  (req, ctx) => {
    // req.body 的类型由 schema 推导
    return ctx.reply.json({ ok: true });
  },
);
```

生成物是待编辑的骨架：补充路由标题和业务逻辑，将 schema import 调整为相对输出文件的路径。
例如输出到 `handlers/user.ts` 时，schema import 应指向 `../schemas/user.js`。

识别使用源码正则，要求名称以大写字母开头、以 `Schema` 结尾，并直接赋值为 `z.object(...)`。
它不会执行输入文件，也不解析重导出或任意 schema 工厂调用。

完整 API 写法见[API 定义](../../guides/api.md)，仓库开发流程见[贡献指南](../../CONTRIBUTING.md)。
