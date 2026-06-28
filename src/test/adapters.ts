/**
 * 测试用 adapter 实例（从 monorepo 子包源码导入，避免 build 依赖）
 */
import { ExpressAdapter } from "../../packages/erest-express/src/index.js";
import { KoaAdapter } from "../../packages/erest-koa/src/index.js";
import { LeizmWebAdapter } from "../../packages/erest-leizmweb/src/index.js";

export const expressAdapter = new ExpressAdapter();
export const koaAdapter = new KoaAdapter();
export const leizmwebAdapter = new LeizmWebAdapter();
