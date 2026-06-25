/**
 * 文档生成脚本（演示 erest 的 genDocs 能力）。
 *
 * 生成多种格式到 docs/out/：
 *   - swagger.json（OpenAPI，可导入 Swagger UI / Apifox）
 *   - postman.json（Postman Collection）
 *   - api.md（人类可读 Markdown）
 *   - sdk.js（基于 axios 的前端 SDK）
 *
 * 运行：npm run docs
 *
 * 原理：用与启动相同的 ERest 配置（docs 选项开启各格式）构建实例，
 * 注册全部 API，调用 genDocs(savePath, false) 立即落盘（不等进程退出）。
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import ERest from 'erest';
import { API_INFO, GROUPS, registerApi } from '../src/api.js';
import { createStore } from '../src/store.js';
import { expressAuthBefore, expressAdminBefore, expressLogMiddleware, expressTimingBefore } from '../src/hooks.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, 'out');

// erest 的 genDocs 不会自动创建目录，需预先建好
mkdirSync(outDir, { recursive: true });

const store = createStore();
// docs 选项：开启各格式输出
const api = new ERest({
  info: API_INFO,
  groups: GROUPS,
  forceGroup: true,
  docs: {
    markdown: 'api.md',
    swagger: 'swagger.json',
    postman: 'postman.json',
    axios: 'sdk.js',
  },
});

// 注册全部 API（与 entries 一致）
registerApi(api, store, {
  authBefore: expressAuthBefore(store),
  adminBefore: expressAdminBefore(),
  logMiddleware: expressLogMiddleware(),
  timingBefore: expressTimingBefore(),
});

// —— mock() 能力演示：设置 mockHandler 后，.mock() 端点无需 handler 即可生成 mock 响应 ——
api.setMockHandler((data) => () => data);
api.group('admin').get('/healthz').title('健康检查（mock 示例）').mock({ status: 'ok', mocked: true });

// 立即生成并保存（onExit=false）
api.genDocs(outDir, false);

console.log(`文档已生成到 ${outDir}/`);
console.log('  - swagger.json  (OpenAPI)');
console.log('  - postman.json  (Postman Collection)');
console.log('  - api.md        (Markdown)');
console.log('  - sdk.js        (axios SDK)');
