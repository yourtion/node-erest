# erest-gen

erest codegen CLI：从 Zod schema 生成 handler 骨架等。

## 安装

```bash
pnpm add -D erest-gen
```

## 用法

### handler 命令

从 Zod schema 文件生成 `registerTyped` handler 骨架。

**约定**：schema 文件中以 `export const XxxSchema = z.object({...})` 形式导出的 schema 会被识别，每个生成一个 handler 骨架。

```bash
# 输出到 stdout
npx erest-gen handler --from ./schemas/user.ts --group user

# 输出到文件
npx erest-gen handler --from ./schemas/user.ts --group user --out ./handlers/user.ts
```

**示例输入** `schemas/user.ts`：

```typescript
import { z } from "zod";

export const UserCreateSchema = z.object({
  name: z.string(),
  age: z.number().int(),
});

export const UserUpdateSchema = z.object({
  name: z.string().optional(),
});
```

**生成输出**：

```typescript
import type ERest from "erest";
import { UserCreateSchema } from "./schemas/user.js";
import { UserUpdateSchema } from "./schemas/user.js";

export function registerUserHandlers(api: ERest["api"]) {
  api
    .post("/user-create")
    .group("user")
    .registerTyped(
      { body: UserCreateSchema },
      (req, reply) => {
        // TODO: 实现 user-create 处理逻辑
        return reply.json({ ok: true });
      }
    );
  // ...
}
```

## 后续计划

- `test` 命令：为已注册 API 生成测试样板
- `docs` 命令：从 ERest 实例导出 markdown
