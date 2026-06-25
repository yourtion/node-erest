/**
 * ESM 互操作入口。
 *
 * erest 主产物是 CommonJS（dist/lib/index.js）。由于 CJS 模块经 Node 的 cjs-module-lexer
 * 静态分析后，其 `exports.default = ERest` 末尾赋值不一定被识别为默认导出，导致在
 * verbatimModuleSyntax + NodeNext 的纯 ESM 工程中 `import ERest from 'erest'`
 * 拿到的是整个 module.exports 命名空间而非构造器（不可 new）。
 *
 * 本文件作为 `exports["."].import` 的入口，从 CJS 命名空间显式构造正确的命名/默认导出，使 ESM 工程可：
 *   import ERest, { z } from 'erest';
 *   const api = new ERest({ ... });   // 无需 createRequire 绕过
 *
 * 注意：不使用 `export { x } from "./index.js"`，因其仍依赖 cjs-module-lexer 的静态识别；
 * 这里用具名属性访问 + 逐个 re-export，确保任何 CJS 导出都能稳定取到。
 */
import cjs from "./index.js";

const {
  z,
  ZodType,
  ZodRawShape,
  ExpressAdapter,
  expressAdapter,
  KoaAdapter,
  koaAdapter,
  LeizmWebAdapter,
  leizmWebAdapter,
  SUPPORT_METHOD,
  ERestError,
  zodTypeMap,
  isZodSchema,
  isISchemaType,
  isISchemaTypeRecord,
  createZodSchema,
  buildZodObjectFromSchemaType,
  paramsChecker,
  schemaChecker,
  responseChecker,
  apiParamsCheck,
  buildHandlerChain,
} = cjs;

export {
  z,
  ZodType,
  ZodRawShape,
  ExpressAdapter,
  expressAdapter,
  KoaAdapter,
  koaAdapter,
  LeizmWebAdapter,
  leizmWebAdapter,
  SUPPORT_METHOD,
  ERestError,
  zodTypeMap,
  isZodSchema,
  isISchemaType,
  isISchemaTypeRecord,
  createZodSchema,
  buildZodObjectFromSchemaType,
  paramsChecker,
  schemaChecker,
  responseChecker,
  apiParamsCheck,
  buildHandlerChain,
};

export default cjs.default;
