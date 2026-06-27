/**
 * handler codegen：从 Zod schema 文件生成 registerTyped handler 骨架。
 *
 * 解析策略（轻量，不引入 TS AST 依赖）：
 *   用正则识别 `export const XxxSchema = z.object({...})` 形式的导出。
 *   对每个识别到的 schema，生成一个 handler 骨架。
 */
import { readFileSync } from "node:fs";
/** 从源码中提取 export const XxxSchema 名称列表 */
export function extractSchemaNames(source) {
    const names = [];
    // 匹配 export const XxxSchema = z.object（不要求完整 object 体，只要赋值为 z.object 调用）
    const re = /export\s+const\s+([A-Z]\w*Schema)\s*=\s*z\.object/g;
    let m;
    while ((m = re.exec(source)) !== null) {
        names.push(m[1]);
    }
    return names;
}
/** 从 SchemaName 推导资源名（UserCreateSchema -> user-create） */
export function schemaNameToResource(name) {
    return name
        .replace(/Schema$/, "")
        .replace(/([A-Z])/g, "-$1")
        .replace(/^-/, "")
        .toLowerCase();
}
export function generateHandler(options) {
    const { schemaFile, group } = options;
    const source = readFileSync(schemaFile, "utf-8");
    const schemaNames = extractSchemaNames(source);
    if (schemaNames.length === 0) {
        throw new Error(`erest-gen: 未在 ${schemaFile} 中找到 \`export const XxxSchema = z.object(...)\` 形式的导出`);
    }
    const handlers = schemaNames
        .map((name) => {
        const resource = schemaNameToResource(name);
        return `  api
    .post("/${resource}")
    .group("${group}")
    .registerTyped(
      { body: ${name} },
      (req, reply) => {
        // TODO: 实现 ${resource} 处理逻辑
        // req.body 类型由 ${name} 推导
        return reply.json({ ok: true });
      }
    );`;
    })
        .join("\n\n");
    const importPath = schemaFile.replace(/\.ts$/, ".js");
    const baseName = schemaFile.split("/").pop().replace(/\.ts$/, "");
    const capitalizedBase = capitalize(baseName);
    return `// 由 erest-gen 生成，请按需修改
import type ERest from "erest";
${schemaNames.map((n) => `import { ${n} } from "./${importPath}";`).join("\n")}

export function register${capitalizedBase}Handlers(api: ERest["api"]) {
${handlers}
}
`;
}
function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
