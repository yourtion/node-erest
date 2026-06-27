#!/usr/bin/env node
/**
 * erest-gen: erest codegen CLI
 *
 * 首版命令：
 *   handler --from <schema-file> --group <group> [--out <output>]
 *     从 Zod schema 文件读取导出的 *Schema 常量，生成 registerTyped handler 骨架。
 *
 * 约定：schema 文件中 `export const XxxSchema = z.object({...})` 会被识别。
 */
export {};
