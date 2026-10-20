import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  completeRelease,
  isPublished,
  publish,
  releaseInfo,
  validatePack,
  orderPackages,
  packageDirectories,
  workspaceRelease,
  packWorkspace,
  readBundle,
  validatePackedPackage,
  inspectTarball,
  publishReleaseSet,
  publishingRuntime,
} from './npm-release.mjs';

const manifest = {
  name: '@example/library',
  version: '1.2.3',
  main: './src/index.tsx',
  types: './src/index.tsx',
  exports: {
    '.': { import: './src/index.tsx' },
    './styles': './dist/styles.css',
  },
};
const info = releaseInfo('v1.2.3', manifest);
const ok = (value) => ({ status: 0, stdout: value, stderr: '' });
const failure = (code) => ({
  status: 1,
  stdout: JSON.stringify({ error: { code } }),
  stderr: code,
});

test('stable and prerelease tags choose distinct npm channels', () => {
  assert.equal(info.distTag, 'latest');
  for (const version of ['1.2.3-beta.1', '1.2.3-0', '1.2.3-1alpha']) {
    const pre = releaseInfo(`v${version}`, { ...manifest, version });
    assert.equal(pre.distTag, 'next');
    assert.equal(pre.prerelease, true);
  }
});

test('reject malformed, mismatched and non-publishable releases', () => {
  for (const tag of [
    undefined,
    '1.2.3',
    'v1.2',
    'v01.2.3',
    'v1.2.4',
    'v1.2.3+build',
    'v1.2.3-01',
  ]) {
    assert.throws(() => releaseInfo(tag, manifest));
  }
  assert.throws(() => releaseInfo(info.tag, { ...manifest, private: true }));
  assert.throws(() => releaseInfo(info.tag, { ...manifest, name: '--bad' }));
});

test('pack checks nested exports, types and generated CSS without changing source exports', () => {
  const pack = {
    name: manifest.name,
    version: manifest.version,
    filename: 'example-library-1.2.3.tgz',
    files: ['package.json', 'src/index.tsx', 'dist/styles.css'].map((path) => ({
      path,
    })),
  };
  validatePack(pack, manifest);
  assert.throws(
    () => validatePack({ ...pack, files: pack.files.slice(0, 2) }, manifest),
    /styles.css/,
  );
  assert.throws(
    () => validatePack({ ...pack, version: '9.0.0' }, manifest),
    /name\/version/,
  );
  assert.throws(() =>
    validatePack({ ...pack, filename: '../other.tgz' }, manifest),
  );
  assert.throws(
    () => validatePack(pack, { ...manifest, types: './missing.d.ts' }),
    /missing.d.ts/,
  );
  assert.throws(
    () => validatePack(pack, { ...manifest, bin: { cli: './missing.js' } }),
    /missing.js/,
  );
  assert.throws(
    () => validatePack(pack, { ...manifest, exports: './dist/*.js' }),
    /wildcard/,
  );
});

test('only exact version or structured E404 establish registry state', () => {
  assert.equal(
    isPublished(info, () => ok(JSON.stringify(info.version))),
    true,
  );
  assert.equal(
    isPublished(info, () => failure('E404')),
    false,
  );
  for (const code of [
    'E401',
    'E403',
    'E429',
    'E500',
    'ENOTFOUND',
    'ECONNRESET',
  ]) {
    assert.throws(
      () => isPublished(info, () => failure(code)),
      new RegExp(code),
    );
  }
  assert.throws(() => isPublished(info, () => ok('not json')), /Invalid/);
  assert.throws(() => isPublished(info, () => ok('"1.2.4"')), /Unexpected/);
  assert.throws(
    () => isPublished(info, () => ({ error: new Error('spawn failed') })),
    /spawn failed/,
  );
});

test('reruns skip published npm versions', () => {
  const calls = [];
  publish(info, '/tmp/validated.tgz', (command, args) => {
    calls.push([command, args]);
    return ok(JSON.stringify(info.version));
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1][0], 'view');
});

test('publish the exact validated tarball with explicit channel and no lifecycle rebuild', () => {
  for (const version of ['1.2.3', '1.2.3-rc.0']) {
    const release = releaseInfo(`v${version}`, { ...manifest, version });
    const calls = [];
    publish(release, '/tmp/validated.tgz', (command, args) => {
      calls.push([command, args]);
      return args[0] === 'view' ? failure('E404') : ok('published');
    });
    assert.deepEqual(calls[1], [
      'npm',
      [
        'publish',
        '/tmp/validated.tgz',
        '--access',
        'public',
        '--tag',
        release.distTag,
        '--ignore-scripts',
      ],
    ]);
  }
});

test('registry and publish failures stop completion', () => {
  const calls = [];
  assert.throws(
    () =>
      publish(info, '/tmp/validated.tgz', (command, args) => {
        calls.push([command, args]);
        return failure('E401');
      }),
    /E401/,
  );
  assert.equal(calls.length, 1);
  assert.throws(
    () =>
      publish(info, '/tmp/validated.tgz', (_, args) =>
        failure(args[0] === 'view' ? 'E404' : 'E403'),
      ),
    /E403/,
  );
});

test('GitHub list errors abort instead of being treated as a missing release', () => {
  const calls = [];
  assert.throws(
    () =>
      completeRelease(info, 'owner/repo', (command, args) => {
        calls.push([command, args]);
        return { status: 1, stderr: 'network failure' };
      }),
    /network failure/,
  );
  assert.equal(calls.length, 1);
  assert.throws(() => completeRelease(info, undefined), /GITHUB_REPOSITORY/);
});

test('create or complete GitHub release with the matching prerelease state', () => {
  for (const version of ['1.2.3', '1.2.3-rc.0']) {
    const release = releaseInfo(`v${version}`, { ...manifest, version });
    for (const existing of [false, true]) {
      const calls = [];
      completeRelease(release, 'owner/repo', (command, args) => {
        calls.push([command, args]);
        return ok(
          args[0] === 'api'
            ? existing
              ? `${release.tag}\n`
              : 'v0.1.0\n'
            : 'done',
        );
      });
      assert.ok(calls[0][1].includes('--paginate'));
      assert.equal(calls[1][1][1], existing ? 'edit' : 'create');
      assert.ok(
        calls[1][1].includes(
          existing ? `--prerelease=${release.prerelease}` : '--verify-tag',
        ),
      );
      if (!existing)
        assert.equal(calls[1][1].includes('--prerelease'), release.prerelease);
    }
  }
});

const repository = { type: 'git', url: 'git+https://github.com/yourtion/node-erest.git' };
const names = ['erest', '@erest/express', '@erest/koa', '@erest/leizmweb', '@erest/gen'];

function fixture(t, version = '3.2.3') {
  const root = mkdtempSync(join(tmpdir(), 'erest-release-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [index, directory] of packageDirectories.entries()) {
    const path = resolve(root, directory);
    mkdirSync(path, { recursive: true });
    const manifest = {
      name: names[index], version, repository, type: 'module',
      main: './dist/index.js', types: './dist/index.d.ts',
    };
    if (index > 0 && index < 4) manifest.peerDependencies = { erest: 'workspace:^' };
    writeFileSync(join(path, 'package.json'), JSON.stringify(manifest));
  }
  mkdirSync(join(root, 'examples'));
  writeFileSync(join(root, 'examples/package.json'), JSON.stringify({ name: 'erest-example', version: '1.0.0', private: true }));
  return root;
}

// A local pack stand-in writes real .tgz files; no test contacts a registry.
function localPacker(root, changeManifest = (value) => value) {
  return (command, args, options) => {
    if (command !== 'pnpm') return spawnSync(command, args, { encoding: 'utf8' });
    assert.equal(options.env.npm_config_ignore_scripts, 'true');
    const manifest = JSON.parse(readFileSync(join(options.cwd, 'package.json')));
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const [name, range] of Object.entries(manifest[field] ?? {})) {
        if (range === 'workspace:^') manifest[field][name] = `^${manifest.version}`;
        else if (range === 'workspace:*') manifest[field][name] = manifest.version;
      }
    }
    const staging = join(root, '.pack-staging');
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(join(staging, 'package/dist'), { recursive: true });
    writeFileSync(join(staging, 'package/package.json'), JSON.stringify(changeManifest(manifest)));
    writeFileSync(join(staging, 'package/dist/index.js'), 'export default {};');
    writeFileSync(join(staging, 'package/dist/index.d.ts'), 'export {};');
    const filename = `${manifest.name.replace(/^@/, '').replace('/', '-')}-${manifest.version}.tgz`;
    const target = join(args[args.indexOf('--pack-destination') + 1], filename);
    return spawnSync('tar', ['-czf', target, '-C', staging, 'package'], { encoding: 'utf8' });
  };
}

test('release set includes exactly five public packages, matching versions and repository metadata', (t) => {
  const root = fixture(t);
  const packages = workspaceRelease('v3.2.3', root);
  assert.deepEqual(packages.map((pkg) => pkg.name), names);
  assert.ok(!packages.some((pkg) => pkg.name === 'erest-example'));
  const target = join(root, 'packages/erest-koa/package.json');
  const original = readFileSync(target, 'utf8');
  for (const edit of [
    { version: '3.2.2' }, { private: true }, { repository: undefined },
    { publishConfig: { registry: 'https://other.example/' } },
    { peerDependencies: { unknown: 'workspace:*' } },
    { peerDependencies: { erest: 'workspace:../unexpected' } },
  ]) {
    writeFileSync(target, JSON.stringify({ ...JSON.parse(original), ...edit }));
    assert.throws(() => workspaceRelease('v3.2.3', root));
  }
});

test('dependency graph orders dependencies first, handles optional/peer edges and rejects cycles/duplicates', () => {
  const pkg = (name, fields = {}) => ({ manifest: { name, ...fields } });
  const a = pkg('a');
  const b = pkg('b', { peerDependencies: { a: '*' } });
  const c = pkg('c', { optionalDependencies: { b: '*' } });
  assert.deepEqual(orderPackages([c, b, a]).map((p) => p.manifest.name), ['a', 'b', 'c']);
  assert.throws(() => orderPackages([a, a]), /Duplicate/);
  assert.throws(() => orderPackages([pkg('a', { dependencies: { b: '*' } }), pkg('b', { peerDependencies: { a: '*' } })]), /Cyclic/);
});

test('workspace-aware pack checks real tarball contents and records integrity for all packages', (t) => {
  const root = fixture(t);
  const destination = join(root, '.bundle');
  const bundle = packWorkspace('v3.2.3', destination, root, localPacker(root));
  assert.equal(bundle.packages.length, 5);
  const restored = readBundle('v3.2.3', destination, root);
  assert.deepEqual(restored.map((pkg) => pkg.name), names);
  const adapter = inspectTarball(restored[1].tarball);
  assert.equal(adapter.manifest.peerDependencies.erest, '^3.2.3');
  const tarball = restored[3].tarball;
  writeFileSync(tarball, 'tampered after verification');
  assert.throws(() => readBundle('v3.2.3', destination, root), /integrity mismatch/);
});

test('bundle rejects missing packages, path traversal, wrong identity and tag before any publication', (t) => {
  const root = fixture(t);
  const destination = join(root, '.bundle');
  const bundle = packWorkspace('v3.2.3', destination, root, localPacker(root));
  for (const edit of [
    { ...bundle, tag: 'v3.2.4' },
    { ...bundle, packages: bundle.packages.slice(1) },
    { ...bundle, packages: bundle.packages.map((p, i) => i ? p : { ...p, filename: '../outside.tgz' }) },
    { ...bundle, packages: bundle.packages.map((p, i) => i ? p : { ...p, name: 'wrong-package' }) },
  ]) {
    writeFileSync(join(destination, 'release.json'), JSON.stringify(edit));
    assert.throws(() => readBundle('v3.2.3', destination, root), /bundle/);
  }
});

test('packed workspace dependencies must be rewritten to the coordinated version', (t) => {
  const root = fixture(t);
  const packages = workspaceRelease('v3.2.3', root);
  const pkg = packages[1];
  const packedManifest = { ...pkg.manifest, peerDependencies: { erest: '^3.2.3' } };
  const pack = { name: pkg.name, version: pkg.version, filename: 'package.tgz', files: ['package.json', 'dist/index.js', 'dist/index.d.ts'].map((path) => ({ path })) };
  validatePackedPackage(pkg, { manifest: packedManifest, pack }, packages);
  for (const range of ['workspace:^', '^3.2.2', '*']) {
    assert.throws(() => validatePackedPackage(pkg, { manifest: { ...packedManifest, peerDependencies: { erest: range } }, pack }, packages), /workspace|dependency/);
  }
  assert.throws(() => validatePackedPackage(pkg, { manifest: { ...packedManifest, main: './other.js' }, pack }, packages), /main/);
});

test('release publication resumes after a partial npm failure and completes GitHub only after every package', () => {
  const packages = names.map((name) => ({ ...releaseInfo('v3.2.3', { name, version: '3.2.3' }), tarball: `/${name.replace('/', '-')}.tgz` }));
  const published = new Set();
  const npmCalls = [];
  let failPackage = '@erest/koa';
  let githubCalls = 0;
  const run = (command, args) => {
    if (command === 'gh') {
      assert.equal(published.size, names.length);
      githubCalls++;
      return ok('');
    }
    const pkg = args[0] === 'view'
      ? packages.find((pkg) => `${pkg.name}@3.2.3` === args[1])
      : packages.find((pkg) => pkg.tarball === args[1]);
    if (args[0] === 'view') return published.has(pkg.name) ? ok('"3.2.3"') : failure('E404');
    npmCalls.push(pkg.name);
    if (pkg.name === failPackage) return failure('E403');
    published.add(pkg.name);
    return ok('published');
  };
  assert.throws(() => publishReleaseSet(packages, 'yourtion/node-erest', run), /E403/);
  assert.deepEqual([...published], ['erest', '@erest/express']);
  assert.equal(githubCalls, 0);
  failPackage = undefined;
  publishReleaseSet(packages, 'yourtion/node-erest', run);
  assert.equal(published.size, 5);
  assert.equal(npmCalls.filter((name) => name === 'erest').length, 1);
  assert.equal(githubCalls, 2);
});

test('GitHub failure after successful npm publishing can be retried without republishing npm versions', () => {
  const pkg = { ...releaseInfo('v3.2.3', { name: 'erest', version: '3.2.3' }), tarball: '/erest.tgz' };
  let published = false;
  let publishCount = 0;
  const run = (command, args) => {
    if (command === 'gh') return { status: 1, stderr: 'GitHub unavailable' };
    if (args[0] === 'view') return published ? ok('"3.2.3"') : failure('E404');
    published = true;
    publishCount++;
    return ok('published');
  };
  assert.throws(() => publishReleaseSet([pkg], 'yourtion/node-erest', run), /GitHub unavailable/);
  publishReleaseSet([pkg], 'yourtion/node-erest', (command, args) => command === 'gh' ? ok('v3.2.3\n') : run(command, args));
  assert.equal(publishCount, 1);
  assert.throws(() => publishReleaseSet([pkg], 'wrong/repo', run), /repository/);
});

test('OIDC runtime and strict SemVer reject unsupported or lossy versions', () => {
  publishingRuntime('24.0.0', '11.5.1');
  publishingRuntime('22.14.0', '12.0.0');
  for (const [node, npm] of [['22.13.0', '11.5.1'], ['24.0.0', '11.5.0'], ['24.0.0', '11.5.1-beta']]) {
    assert.throws(() => publishingRuntime(node, npm), /requires/);
  }
  assert.throws(() => releaseInfo('v9007199254740992.0.0', { ...manifest, version: '9007199254740992.0.0' }), /numeric/);
});

test('CLI tarball validation rejects missing shebang or executable permission', () => {
  const manifest = { name: '@erest/gen', version: '3.2.3', bin: { 'erest-gen': './dist/index.js' } };
  const inspect = (source, mode) => inspectTarball('/gen.tgz', (_command, args) => {
    if (args[0] === '-tzf') return ok('package/package.json\npackage/dist/index.js\n');
    if (args[0] === '-tvzf') return ok(`${mode} user/group 10 date package/dist/index.js`);
    return ok(args.at(-1) === 'package/package.json' ? JSON.stringify(manifest) : source);
  });
  inspect('#!/usr/bin/env node\n', '-rwxr-xr-x');
  assert.throws(() => inspect('console.log("missing shebang");', '-rwxr-xr-x'), /shebang/);
  assert.throws(() => inspect('#!/usr/bin/env node\n', '-rw-r--r--'), /executable/);
});

test('CLI validation fails before attempting dependencies or publishing for bad tags', () => {
  const script = new URL('./npm-release.mjs', import.meta.url);
  const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version;
  for (const tag of ['v3.2', 'v3.2.3+build', `v${version}-mismatched-test`]) {
    const result = spawnSync(process.execPath, [script.pathname, 'check', tag], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Tag/);
  }
});
