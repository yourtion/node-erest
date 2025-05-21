import Koa from 'koa';
import KoaRouter from 'koa-router'; // or import Router from 'koa-router';
import request from 'supertest';
import bodyParser from 'koa-bodyparser'; // Add this
import ERest, { KoaHandler, API } from '../lib'; // Adjust path as needed

// Helper to set up ERest instance for forceGroup: false
const setupERestNoGroup = () => {
  return new ERest<KoaHandler>({
    info: { title: 'Koa Test No Group' },
    // Ensure default error handlers are set up if your tests rely on specific status codes for errors
    missingParameterError: (msg: string) => ({ status: 400, message: `Missing Parameter: ${msg}` } as any), // Example
    invalidParameterError: (msg: string) => ({ status: 400, message: `Invalid Parameter: ${msg}` } as any), // Example
  });
};

// Helper to set up ERest instance for forceGroup: true
const setupERestWithGroup = () => {
  return new ERest<KoaHandler>({
    info: { title: 'Koa Test With Group' },
    forceGroup: true,
    groups: {
      v1: { name: 'Version 1', prefix: '/v1' }, // Explicit prefix
      user: { name: 'User Group' } // Default prefix will be 'user' by camelCase2underscore
    },
    missingParameterError: (msg: string) => ({ status: 400, message: `Missing Parameter: ${msg}` } as any),
    invalidParameterError: (msg: string) => ({ status: 400, message: `Invalid Parameter: ${msg}` } as any),
  });
};


describe('ERest Koa Integration', () => {
  describe('forceGroup: false', () => {
    const app = new Koa();
    app.use(bodyParser()); // Use bodyParser for all non-group tests
    const erest = setupERestNoGroup();
    const router = new KoaRouter();

    // Test 1.1
    erest.api.get('/test-koa').register(async (ctx: Koa.Context) => { ctx.body = { success: true, data: 'koa works' }; });

    // Test 1.2
    erest.api.get('/query-test')
      .query({ name: { type: 'string', required: true }})
      .register(async (ctx: Koa.Context) => { ctx.body = { name: (ctx.request as any).$params.query.name }; });
    
    // Test 1.3
    erest.api.post('/body-test')
      .body({ id: { type: 'int', required: true }})
      .register(async (ctx: Koa.Context) => { ctx.body = { id: (ctx.request as any).$params.body.id }; });
    
    // After all API definitions for this block
    erest.bindRouterToKoa(router, (e,s) => erest.checkerKoa(e,s as API<KoaHandler>));
    app.use(router.routes()).use(router.allowedMethods());

    // Now run the actual test executions that were commented out above
    it('should handle basic GET request (execution)', async () => {
        await request(app.callback()).get('/test-koa').expect(200, { success: true, data: 'koa works' });
    });
    it('should validate query parameters (execution)', async () => {
        await request(app.callback()).get('/query-test?name=tester').expect(200, { name: 'tester' });
        await request(app.callback()).get('/query-test').expect(400);
    });
    it('should validate POST body parameters (execution)', async () => {
        await request(app.callback()).post('/body-test').send({ id: 123 }).expect(200, { id: 123 });
        await request(app.callback()).post('/body-test').send({ id: 'abc' }).expect(400);
    });

  });

  describe('forceGroup: true', () => {
    const appGroup = new Koa();
    appGroup.use(bodyParser());
    const erestGroup = setupERestWithGroup();

    // Test 2.1
    erestGroup.group('v1').get('/grouped-test').register(async (ctx: Koa.Context) => { ctx.body = { group: 'v1 works' }; });

    erestGroup.group('user').get('/info').register(async (ctx: Koa.Context) => { ctx.body = { group: 'user info' }; });
    
    // After all API definitions for this block
    erestGroup.bindKoaRouterToApp(appGroup, KoaRouter, (e,s) => erestGroup.checkerKoa(e,s as API<KoaHandler>));

    // Now run the actual test executions
    it('should handle basic GET request in a group with explicit prefix (execution)', async () => {
        await request(appGroup.callback()).get('/v1/grouped-test').expect(200, { group: 'v1 works' });
    });
    it('should handle GET request in a group with default prefix (execution)', async () => {
        // For a group key 'user' with no explicit prefix, camelCase2underscore will make it 'user'
        await request(appGroup.callback()).get('/user/info').expect(200, { group: 'user info' });
    });

  });
});
