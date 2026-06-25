/**
 * erest API 定义（与框架无关）。
 *
 * 这是本示例的核心：路由 + 中间件 + handler 在此声明一次，
 * 三个框架入口（leizmweb / express / koa）只差 bind() 的框架参数即可复用。
 *
 * 关键：handler 用 registerTyped 的 (req, reply) 签名——
 * req.params/query/body 类型由 Zod 自动推导，reply 是框架无关的响应接口，
 * 因此同一份 handler 不依赖任何框架的 ctx/res。
 */
import { z } from 'erest';

/** 集中定义 Zod schemas */
export const CreateUserSchema = z.object({
  name: z.string().min(1).max(50),
  email: z.string().email(),
  age: z.number().int().min(18).max(120),
});

export const UpdateUserSchema = z.object({
  // path 的 id 是 number，body 字段全部可选 —— 分层 req.params/req.body 避免同名冲突
  name: z.string().min(1).max(50).optional(),
  email: z.string().email().optional(),
});

/** ERest 配置（三框架一致） */
export const API_INFO = {
  title: 'erest-example',
  description: '一份 API 定义，三框架入口',
  version: '1.0.0',
  host: 'http://localhost:3100',
  basePath: '/api',
};

export const GROUPS = { user: '用户管理' };

/**
 * 注册用户相关 API —— handler 声明一次，三框架复用。
 *
 * @param {import('erest').IApiInfo<unknown>} apiInfo erest 实例的 api 属性
 * @param {ReturnType<typeof import('./store.js').createStore>} store 数据存储
 */
export function registerUserApi(apiInfo, store) {
  // POST /users —— req.body 类型自动推导；reply 写响应（框架无关）
  apiInfo
    .post('/users')
    .group('user')
    .title('创建用户')
    .registerTyped({ body: CreateUserSchema }, (req, reply) => {
      const user = store.createUser(req.body);
      reply.status(201).json({ success: true, id: user.id });
    });

  // PUT /users/:id —— 分层 req.params（路径）与 req.body（请求体）互不覆盖
  apiInfo
    .put('/users/:id')
    .group('user')
    .title('更新用户')
    .registerTyped(
      { params: z.object({ id: z.coerce.number() }), body: UpdateUserSchema },
      (req, reply) => {
        try {
          store.updateUser(req.params.id, req.body);
          reply.json({ success: true, id: req.params.id });
        } catch (e) {
          reply.status(e.status || 400).json({ error: e.message });
        }
      },
    );

  // GET /users/:id —— params + query 类型推导
  apiInfo
    .get('/users/:id')
    .group('user')
    .title('获取用户')
    .registerTyped(
      {
        params: z.object({ id: z.coerce.number() }),
        query: z.object({ includeEmail: z.coerce.boolean().optional() }),
      },
      (req, reply) => {
        const user = store.getUser(req.params.id);
        if (!user) {
          reply.status(404).json({ error: 'user not found' });
          return;
        }
        const includeEmail = req.query.includeEmail ?? false;
        reply.json(includeEmail ? user : { id: user.id, name: user.name });
      },
    );
}
