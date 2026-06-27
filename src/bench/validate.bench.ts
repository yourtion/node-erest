import { bench } from "vitest";
import { z } from "zod";
import { compileValidate } from "../lib/params.js";
import API from "../lib/api.js";
import type ERest from "../lib/index.js";
import lib from "../test/lib.js";

const apiService = lib();
const erest = apiService as unknown as ERest<unknown>;

// 构造一个典型 API：params + query + body
const api = new API<unknown>("post", "/users/:id/groups", { absolute: "test" } as never, "user", "/user");
api.options.paramsSchema = z.object({ id: z.string() });
api.options.querySchema = z.object({ include: z.string().optional(), limit: z.coerce.number().default(10) });
api.options.bodySchema = z.object({ name: z.string(), age: z.number().int() });

const input = {
  params: { id: "u123" },
  query: { include: "profile", limit: "20" },
  body: { name: "Tom", age: 25 },
  headers: {},
};

// 预编译路径（Stage 1 目标：热路径零分配）
const compiled = compileValidate(
  {
    missingParameter: (m: string) => new Error(m),
    invalidParameter: (m: string) => new Error(m),
  },
  {
    paramsSchema: api.options.paramsSchema,
    querySchema: api.options.querySchema,
    bodySchema: api.options.bodySchema,
  }
);

bench("compiled.validate: typical POST (params+query+body)", () => {
  compiled.validate(input);
});
