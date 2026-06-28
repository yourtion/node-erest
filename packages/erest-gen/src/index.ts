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

import { generateHandler } from "./handler.js";
import { writeFileSync } from "node:fs";

interface CliArgs {
  command: string;
  from?: string;
  group?: string;
  out?: string;
}

function parseArgs(argv: string[]): CliArgs | null {
  const [, , command, ...rest] = argv;
  if (!command) return null;
  const args: CliArgs = { command };
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--from") args.from = rest[++i];
    else if (rest[i] === "--group") args.group = rest[++i];
    else if (rest[i] === "--out") args.out = rest[++i];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args || !args.from) {
    console.error(`erest-gen: 用法见 README
  erest-gen handler --from ./schemas/user.ts --group user [--out ./handlers/user.ts]`);
    process.exit(1);
  }

  if (args.command === "handler") {
    const code = generateHandler({
      schemaFile: args.from,
      group: args.group || "Index",
    });
    if (args.out) {
      writeFileSync(args.out, code);
      console.error(`erest-gen: 已生成 ${args.out}`);
    } else {
      process.stdout.write(code);
    }
  } else {
    console.error(`erest-gen: 未知命令 ${args.command}（首版仅支持 handler）`);
    process.exit(1);
  }
}

main();
