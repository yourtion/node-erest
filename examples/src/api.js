/**
 * erest API 定义（与框架无关）。
 *
 * 迷你博客业务域，用 forceGroup 分三个组，串联 erest 的核心能力：
 * - registerTyped + reply（框架无关 handler，三入口复用）
 * - forceGroup + 组级 before/middleware 钩子（鉴权/日志，见 hooks.js）
 * - 自定义错误注册（errors.js）、自定义 type/schema 注册（types.js）
 * - define() 声明式、mock()、response() schema
 *
 * handler 约定：(req, reply)。req 由 registerTyped 校验并分层注入；
 * 需要「当前用户」的 handler 通过 headers schema 读 token（before 钩子负责拒绝未授权请求）。
 */
import { ERestError } from 'erest';
import { z } from 'zod';
import { CreatePostSchema, UpdatePostSchema } from './types.js';
import { registerErrors } from './errors.js';
import { registerTypes } from './types.js';
import { authRequired } from './errors.js';

/** token header schema（复用） */
const TokenHeaderSchema = z.object({
  'x-admin-token': z.string(),
});

/** ERest 配置（三框架一致） */
export const API_INFO = {
  title: 'erest-blog-example',
  description: '迷你博客 API：演示 erest 全部核心能力',
  version: '1.0.0',
  host: 'http://localhost:3100',
  basePath: '',
};

/** forceGroup 分组配置（各有前缀） */
export const GROUPS = {
  public: { name: '公开接口', prefix: '/public' },
  post: { name: '文章管理（需登录）', prefix: '/posts' },
  admin: { name: '管理后台（需管理员）', prefix: '/admin' },
};

/**
 * 注册全部 API（handler 声明一次，三框架复用）。
 *
 * @param {import('erest').ERestInstance<unknown>} api erest 实例
 * @param {ReturnType<typeof import('./store.js').createStore>} store 数据存储
 * @param {{
 *   authBefore: Function;
 *   adminBefore: Function;
 *   logMiddleware: Function;
 * }} hooks 框架相关钩子（由入口注入，见 hooks.js）
 */
export function registerApi(api, store, hooks) {
  // 注册自定义错误与类型（演示能力）
  registerErrors(api);
  registerTypes(api);

  // —— 全局 before hook：耗时统计（演示 beforeHooks）——
  // 注意：beforeHooks 的入参是框架原生 ctx，由各入口的 hooks 注入框架无关的计时逻辑。
  if (hooks.timingBefore) api.beforeHooks(hooks.timingBefore);

  // ==================== public 组（无需鉴权）====================
  const pub = api.group('public');

  // GET /public/posts —— 已发布文章列表
  pub
    .get('/posts')
    .title('已发布文章列表')
    .registerTyped(
      { query: z.object({ limit: z.coerce.number().int().min(1).max(100).optional() }) },
      (req, reply) => {
        const limit = req.query.limit ?? 10;
        reply.json({ posts: store.listPublishedPosts().slice(0, limit) });
      },
    );

  // GET /public/posts/:slug —— 按 slug 查详情（演示 params）
  pub
    .get('/posts/:slug')
    .title('文章详情')
    .registerTyped({ params: z.object({ slug: z.string() }) }, (req, reply) => {
      const post = store.getPostBySlug(req.params.slug);
      if (!post || !post.published) {
        throw new ERestError('NOT_FOUND', '文章不存在', undefined, 404);
      }
      reply.json({ post });
    });

  // ==================== post 组（需登录）====================
  const post = api.group('post').before(hooks.authBefore);

  // GET /posts —— 当前用户可见全部文章
  post
    .get('/posts')
    .title('文章列表（需登录）')
    .registerTyped({ headers: TokenHeaderSchema }, (req, reply) => {
      const user = store.authenticate(req.headers['x-admin-token']);
      if (!user) throw authRequired();
      reply.json({ posts: store.listPosts(), user });
    });

  // POST /posts —— 创建文章（body 类型由 CreatePostSchema 推导）
  post
    .post('/posts')
    .title('创建文章')
    .registerTyped(
      { headers: TokenHeaderSchema, body: CreatePostSchema },
      (req, reply) => {
        const user = store.authenticate(req.headers['x-admin-token']);
        const created = store.createPost({ ...req.body, authorId: user.id });
        reply.status(201).json({ post: created });
      },
    );

  // PUT /posts/:id —— 更新（分层 req.params 与 req.body）
  post
    .put('/posts/:id')
    .title('更新文章')
    .registerTyped(
      {
        params: z.object({ id: z.coerce.number() }),
        body: UpdatePostSchema,
      },
      (req, reply) => {
        try {
          const updated = store.updatePost(req.params.id, req.body);
          reply.json({ post: updated });
        } catch (e) {
          throw new ERestError('NOT_FOUND', e.message, undefined, e.status || 400);
        }
      },
    );

  // DELETE /posts/:id
  post
    .delete('/posts/:id')
    .title('删除文章')
    .registerTyped({ params: z.object({ id: z.coerce.number() }) }, (req, reply) => {
      try {
        store.deletePost(req.params.id);
        reply.json({ success: true });
      } catch (e) {
        throw new ERestError('NOT_FOUND', e.message, undefined, e.status || 400);
      }
    });

  // ==================== admin 组（需管理员）====================
  // 演示：组级 before(authBefore + adminBefore) + middleware(logMiddleware)
  const admin = api
    .group('admin')
    .before(hooks.authBefore, hooks.adminBefore)
    .middleware(hooks.logMiddleware);

  // GET /admin/stats —— 系统统计
  admin.get('/stats').title('系统统计').registerTyped({}, (_req, reply) => {
    reply.json(store.stats());
  });

  // 注：mock() 能力（无 handler 时由 setMockHandler 生成 mock 响应）在 docs/generate.js
  // 中单独演示——那里设置 mockHandler 后注册一个 mock 端点用于文档展示。运行时服务不启用 mock。

  // GET /admin/users —— 用户列表（声明 response schema 演示）
  admin
    .get('/users')
    .title('用户列表')
    .response(
      z.object({
        users: z.array(
          z.object({
            id: z.number(),
            name: z.string(),
            email: z.string(),
            role: z.string(),
          }),
        ),
      }),
    )
    .registerTyped({}, (_req, reply) => {
      reply.json({ users: store.listUsers() });
    });

  // define() 声明式定义（演示）：与 registerTyped 等价，handler 同样是框架无关的
  // (ctx, next) 签名。admin 组的 before(authBefore, adminBefore) 鉴权会自动生效。
  admin.define({
    method: 'delete',
    path: '/users/:id',
    title: '删除用户（define 示例）',
    params: z.object({ id: z.coerce.number() }),
    handler: (ctx) => {
      ctx.reply.json({ success: true, deleted: ctx.$params.id });
    },
  });
}
