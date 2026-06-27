/**
 * handler codegen：从 Zod schema 文件生成 registerTyped handler 骨架。
 *
 * 解析策略（轻量，不引入 TS AST 依赖）：
 *   用正则识别 `export const XxxSchema = z.object({...})` 形式的导出。
 *   对每个识别到的 schema，生成一个 handler 骨架。
 */
export interface GenerateHandlerOptions {
    /** schema 文件路径（相对 CWD） */
    schemaFile: string;
    /** API 分组 */
    group: string;
}
/** 从源码中提取 export const XxxSchema 名称列表 */
export declare function extractSchemaNames(source: string): string[];
/** 从 SchemaName 推导资源名（UserCreateSchema -> user-create） */
export declare function schemaNameToResource(name: string): string;
export declare function generateHandler(options: GenerateHandlerOptions): string;
