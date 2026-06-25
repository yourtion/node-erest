/**
 * ESM 互操作入口的类型声明（对应 esm-wrapper.mjs）。
 *
 * 运行时由 esm-wrapper.mjs 构造正确的默认导出，使纯 ESM 工程可：
 *   import ERest, { z } from 'erest';
 *   const api = new ERest({ ... });   // 无需 createRequire 绕过
 *
 * 类型层面再导出 CJS 入口的类型。注意：在 `module: nodenext` 下，TypeScript 对
 * CJS 模块的默认导出按 Node 实际互操作行为解析（不合成 synthetic default），
 * 因此严格 NodeNext 工程可能遇到默认导入的类型报错。运行时不受影响；如需消除类型
 * 报错，可参考 examples/leizmweb/types/erest.d.ts 中的模块增强声明。
 */
export { default } from "./index.js";
export * from "./index.js";
