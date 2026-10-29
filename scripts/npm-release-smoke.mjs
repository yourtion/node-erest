import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { execute, output, readBundle } from './npm-release.mjs';

const [tag, destination] = process.argv.slice(2);
if (!destination) throw new Error('Usage: npm-release-smoke.mjs v<version> <bundle-directory>');
const packages = readBundle(tag, destination);
const consumer = mkdtempSync(resolve(tmpdir(), 'erest-release-consumer-'));
try {
  writeFileSync(resolve(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  output(execute('npm', [
    'install', '--ignore-scripts', '--no-audit', '--no-fund',
    ...packages.map((pkg) => pkg.tarball),
  ], { cwd: consumer }));
  writeFileSync(resolve(consumer, 'smoke.mjs'), `
    import assert from 'node:assert/strict';
    import { spawnSync } from 'node:child_process';
    const core = await import('erest');
    assert.equal(typeof core.ERest, 'function');
    const api = new core.ERest({ groups: { demo: 'demo' } });
    api.api.post('/items').group('demo').title('items').registerTyped({
      body: core.z.object({ id: core.z.union([core.z.string(), core.z.number()]) }),
    }, () => {});
    const document = api.buildOpenAPI();
    assert.equal(document.openapi, '3.0.3');
    assert.equal(document.paths['/items'].post.requestBody.content['application/json'].schema.$ref.startsWith('#/components/schemas/'), true);
    assert.equal(core.z.string().parse('published package'), 'published package');
    for (const name of ['@erest/express', '@erest/koa', '@erest/leizmweb', '@erest/h3']) {
      const adapter = await import(name);
      assert.equal(typeof adapter.createERest, 'function', name);
      assert.equal(typeof adapter.createErrorHandler, 'function', name);
    }
    const { H3 } = await import('h3');
    const { createERest, h3Adapter } = await import('@erest/h3');
    const h3 = new H3();
    const service = createERest({ groups: { demo: 'Demo' } });
    service.api.post('/items/:id').group('demo').registerTyped({
      params: core.z.object({ id: core.z.coerce.number() }),
      body: core.z.object({ name: core.z.string() }),
    }, (req, ctx) => ctx.reply.status(201).json({ id: req.params.id, name: req.body.name }));
    service.bind({ adapter: h3Adapter, router: h3 });
    const response = await h3.request('/items/42', { method: 'POST', body: JSON.stringify({ name: 'packed' }) });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { id: 42, name: 'packed' });
    const cli = spawnSync('node_modules/.bin/erest-gen', [], { encoding: 'utf8' });
    assert.equal(cli.status, 1);
    assert.match(cli.stdout + cli.stderr, /erest-gen handler --from/);
    console.log('All six packed packages: consumer smoke passed');
  `);
  console.log(output(execute(process.execPath, ['smoke.mjs'], { cwd: consumer })));
} finally {
  rmSync(consumer, { recursive: true, force: true });
}
