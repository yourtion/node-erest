/**
 * 自定义类型与 Schema 注册（演示 api.type / api.schema 能力）。
 *
 * - api.type.register：注册可复用的 Zod 类型，供 ISchemaType Record 风格引用（按名字）。
 * - api.schema.register + createSchema：注册可复用的对象 Schema，handler 校验时复用。
 * - 这里同时导出原生 Zod schema，供 registerTyped 直接使用（类型推导）。
 */
import { z } from "zod";

/** Slug：小写字母与连字符（自定义类型示例） */
export const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug 格式不合法");

/** 文章创建 schema（registerTyped 直接用，享受类型推导） */
export const CreatePostSchema = z.object({
  slug: SlugSchema,
  title: z.string().min(1).max(100),
  content: z.string().min(1),
});

/** 文章更新 schema（部分字段可选） */
export const UpdatePostSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  content: z.string().min(1).optional(),
  published: z.boolean().optional(),
});

/**
 * 在 erest 实例上注册自定义类型/Schema（供 ISchemaType Record 与文档生成使用）。
 * @param {import('erest').ERestInstance<unknown>} api
 */
export function registerTypes(api) {
  // 注册自定义类型 Slug（可在 ISchemaType Record 中按 'Slug' 引用）
  api.type.register("Slug", SlugSchema);

  // 注册可复用 Schema（文档生成时会出现）
  api.schema.register("CreatePost", CreatePostSchema);
  api.schema.register("UpdatePost", UpdatePostSchema);
}
