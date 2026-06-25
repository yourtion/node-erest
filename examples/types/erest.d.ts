/**
 * 模块增强声明（TypeScript NodeNext 用）。
 *
 * 在 `module: nodenext` + `verbatimModuleSyntax` 下，TypeScript 对 CJS 模块的默认导出
 * 按 Node 实际互操作行为解析（不合成 synthetic default），可能导致
 * `import ERest from 'erest'` 出现类型报错（运行时不受影响）。
 *
 * 若你的工程未遇到类型报错，无需引入本文件。
 * 本文件重新声明默认导出为可构造类型，消除 nodenext 下的 "not constructable" 报错。
 */
declare module 'erest' {
  export const z: typeof import('zod');
  const ERest: new <T = unknown>(opts?: Record<string, unknown>) => import('erest').ERestInstance<T>;
  export default ERest;
}
