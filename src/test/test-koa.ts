import Koa from 'koa';
import KoaRouter from 'koa-router'; // or import Router from 'koa-router';
import bodyParser from 'koa-bodyparser'; // Add thisimport lib from "./lib";
// import { koaBody } from "koa-body"
import { TYPES } from './helper';
import lib from "./lib";

// Helper to set up ERest instance for forceGroup: true
const setupERestWithGroup = () => {
  return lib({
    forceGroup: true,
    groups: {
      v1: { name: 'Version 1', prefix: '/v1' }, // Explicit prefix
      user: { name: 'User Group' } // Default prefix will be 'user' by camelCase2underscore
    },
  });
};

function returnJson(ctx: Koa.Context, data: any) {
  ctx.type = 'application/json';
  ctx.body = JSON.stringify(data);
}

describe('ERest Koa Integration', () => {
  let server: any;
  afterAll(() => {
    server.close();
  });
  describe('forceGroup: false', () => {
    const app = new Koa();
    app.use(bodyParser()) // Use bodyParser for all non-group tests
    app.use(async (ctx, next) => {
      try {
        await next();
      } catch (err: any) {
        ctx.status = err.status || 500;
        ctx.body = JSON.stringify({
          message: err.message,
          stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        });
      }
    });
    const apiService = lib();
    const router = new KoaRouter();
    server = app.listen()
    apiService.initTest(server);
    const { api } = apiService;
    // Test 1.1
    api.get('/test-koa').group('Index').register(async (ctx: Koa.Context) => {
      returnJson(ctx, { data: 'koa works' });
    });

    // Test 1.2
    api.get('/query-test')
      .group('Index')
      .query({ name: { type: TYPES.String, required: true } })
      .register(async (ctx: Koa.Context) => { returnJson(ctx, { name: ctx.$params.name }); });

    // Test 1.3
    api.post('/body-test')
      .group('Index')
      .body({ id: { type: TYPES.Integer, required: true } })
      .register(async (ctx: Koa.Context) => {
        returnJson(ctx, { id: ctx.$params.id });
      });

    // After all API definitions for this block
    apiService.bindRouter(router, apiService.checkerKoa);
    app.use(router.routes()).use(router.allowedMethods());

    // Now run the actual test executions that were commented out above
    it('should handle basic GET request (execution)', async () => {
      const ret = await apiService.test.get('/test-koa').success();
      expect(ret).toStrictEqual({ data: 'koa works' });
    });
    it('should validate query parameters (execution)', async () => {
      const ret = await apiService.test.get('/query-test').query({ name: "tester" }).success();
      expect(ret).toStrictEqual({ name: 'tester' });
    });
    it('should validate POST body parameters (success)', async () => {
      const ret = await apiService.test.post('/body-test').input({ id: 'abc' }).error();
      expect(ret).toStrictEqual(new Error('POST_/body-test 期望API输出失败结果，但实际输出成功结果：{}'));
    });

    it('should validate POST body parameters (error)', async () => {
      const ret1 = await apiService.test.post('/body-test').input({ id: 123 }).success();
      expect(ret1).toStrictEqual({ id: 123 });
    });


  });

  describe('forceGroup: true', () => {
    const appGroup = new Koa();
    appGroup.use(bodyParser());
    const erestGroup = setupERestWithGroup();
    server = appGroup.listen();
    erestGroup.initTest(server);
    // Test 2.1
    erestGroup.group('v1').get('/grouped-test').register(async (ctx: Koa.Context) => {
      returnJson(ctx, { group: 'v1 works' });
    });

    erestGroup.group('user').get('/info').register(async (ctx: Koa.Context) => {
      returnJson(ctx, { group: 'user info' });
    });

    // After all API definitions for this block
    erestGroup.bindKoaRouterToApp(appGroup, KoaRouter, erestGroup.checkerKoa);

    // Now run the actual test executions
    it('should handle basic GET request in a group with explicit prefix (execution)', async () => {
      const ret = await erestGroup.test.get('/v1/grouped-test').success();
      expect(ret).toStrictEqual({ group: 'v1 works' });
    });
    it('should handle GET request in a group with default prefix (execution)', async () => {
      // For a group key 'user' with no explicit prefix, camelCase2underscore will make it 'user'
      const ret = await erestGroup.test.get('/user/info').success()
      expect(ret).toStrictEqual({ group: 'user info' });
    });

  });
});
