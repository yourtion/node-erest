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
    assert.equal(core.z.string().parse('published package'), 'published package');
    for (const name of ['@erest/express', '@erest/koa', '@erest/leizmweb']) {
      const adapter = await import(name);
      assert.equal(typeof adapter.createERest, 'function', name);
    }
    const cli = spawnSync('node_modules/.bin/erest-gen', [], { encoding: 'utf8' });
    assert.equal(cli.status, 1);
    assert.match(cli.stdout + cli.stderr, /erest-gen handler --from/);
    console.log('All five packed packages: consumer smoke passed');
  `);
  console.log(output(execute(process.execPath, ['smoke.mjs'], { cwd: consumer })));
} finally {
  rmSync(consumer, { recursive: true, force: true });
}
