import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// npm drops SemVer build metadata; reject tags that cannot round-trip.
const number = '(?:0|[1-9][0-9]*)';
const identifier = `(?:${number}|[0-9]*[A-Za-z-][0-9A-Za-z-]*)`;
const versionPattern = new RegExp(
  `^${number}\\.${number}\\.${number}(?:-${identifier}(?:\\.${identifier})*)?$`,
);

export function releaseInfo(tag, manifest) {
  const version = tag?.startsWith('v') ? tag.slice(1) : '';
  if (!versionPattern.test(version) || manifest.version !== version) {
    throw new Error(
      `Tag ${tag} must be v<SemVer> and match package.json version`,
    );
  }
  if (version.length > 256 || version.split(/[-.]/).some((part) => /^\d+$/.test(part) && !Number.isSafeInteger(Number(part)))) {
    throw new Error('Version contains an unsupported numeric component');
  }
  if (
    manifest.private ||
    typeof manifest.name !== 'string' ||
    !/^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/.test(manifest.name)
  ) {
    throw new Error('Expected a named, public npm package');
  }
  return {
    tag,
    name: manifest.name,
    version,
    prerelease: version.includes('-'),
    distTag: version.includes('-') ? 'next' : 'latest',
  };
}

export function validatePack(pack, manifest) {
  if (
    pack.name !== manifest.name ||
    pack.version !== manifest.version ||
    !pack.filename?.endsWith('.tgz') ||
    basename(pack.filename) !== pack.filename
  ) {
    throw new Error('Packed name/version/filename does not match the release');
  }
  const files = new Set(pack.files.map((file) => file.path));
  const targets = [];
  function collect(value) {
    if (typeof value === 'string') targets.push(value);
    else if (value && typeof value === 'object') {
      for (const nested of Object.values(value)) collect(nested);
    }
  }
  collect(manifest.main);
  collect(manifest.types);
  collect(manifest.bin);
  collect(manifest.exports);
  for (const target of ['package.json', ...targets]) {
    const path = target.replace(/^\.\//, '');
    if (path.includes('*')) {
      throw new Error(
        `Add package-specific validation for wildcard export ${target}`,
      );
    }
    if (!files.has(path))
      throw new Error(`Tarball is missing entry point ${target}`);
  }
}

export function execute(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    ...options,
    env: {
      ...process.env,
      ...options.env,
      NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org/',
      npm_config_registry: 'https://registry.npmjs.org/',
    },
  });
}

export function output(result) {
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'Release command failed');
  }
  return result.stdout;
}

export function isPublished(info, run = execute) {
  const result = run('npm', [
    'view',
    `${info.name}@${info.version}`,
    'version',
    '--json',
  ]);
  if (result.error) throw result.error;
  let data;
  try {
    data = JSON.parse(result.stdout);
  } catch {
    throw new Error(result.stderr || 'Invalid npm registry response');
  }
  // Only a structured npm E404 means absent. Auth/network errors must propagate.
  if (result.status !== 0 && data?.error?.code === 'E404') return false;
  output(result);
  if (data !== info.version) throw new Error('Unexpected npm registry version');
  return true;
}

export function publish(info, tarball, run = execute) {
  if (isPublished(info, run)) {
    console.log(`${info.name}@${info.version} already published; skipping npm`);
    return;
  }
  console.log(
    output(
      run('npm', [
        'publish',
        tarball,
        '--access',
        'public',
        '--tag',
        info.distTag,
        '--ignore-scripts',
      ]),
    ),
  );
}

export function completeRelease(info, repository, run = execute) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '')) {
    throw new Error('GITHUB_REPOSITORY must be owner/repo');
  }
  const tags = output(
    run('gh', [
      'api',
      '--paginate',
      `repos/${repository}/releases`,
      '--jq',
      '.[].tag_name',
    ]),
  ).split('\n');
  const args = tags.includes(info.tag)
    ? [
        'release',
        'edit',
        info.tag,
        '--draft=false',
        `--prerelease=${info.prerelease}`,
      ]
    : [
        'release',
        'create',
        info.tag,
        '--verify-tag',
        '--title',
        info.tag,
        '--generate-notes',
      ];
  if (!tags.includes(info.tag) && info.prerelease) args.push('--prerelease');
  console.log(output(run('gh', args)));
}

// Explicit public release set: examples is private and is never published.
export const packageDirectories = [
  '.', 'packages/erest-express', 'packages/erest-koa',
  'packages/erest-leizmweb', 'packages/erest-gen',
];
const repositoryUrl = 'git+https://github.com/yourtion/node-erest.git';
const dependencyFields = ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies'];
const hashFile = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

export function orderPackages(packages) {
  const byName = new Map(packages.map((pkg) => [pkg.manifest.name, pkg]));
  if (byName.size !== packages.length) throw new Error('Duplicate release package name');
  const active = new Set();
  const complete = new Set();
  const ordered = [];
  function visit(pkg) {
    const { name } = pkg.manifest;
    if (active.has(name)) throw new Error(`Cyclic release dependency: ${name}`);
    if (complete.has(name)) return;
    active.add(name);
    for (const field of dependencyFields.filter((field) => field !== 'devDependencies')) {
      for (const dependency of Object.keys(pkg.manifest[field] ?? {})) {
        if (byName.has(dependency)) visit(byName.get(dependency));
      }
    }
    active.delete(name);
    complete.add(name);
    ordered.push(pkg);
  }
  packages.forEach(visit);
  return ordered;
}

function expectedInternalRange(range, version) {
  if (range === 'workspace:*') return version;
  if (range === 'workspace:^') return `^${version}`;
  if (range === 'workspace:~') return `~${version}`;
  if ([version, `^${version}`, `~${version}`, '*'].includes(range)) return range;
  throw new Error(`Unsupported internal dependency range: ${range}; adapt the release validator first`);
}

export function workspaceRelease(tag, root = process.cwd()) {
  const packages = packageDirectories.map((directory) => {
    const manifest = JSON.parse(readFileSync(resolve(root, directory, 'package.json'), 'utf8'));
    const info = releaseInfo(tag, manifest);
    if (manifest.repository?.url !== repositoryUrl || manifest.repository?.type !== 'git') {
      throw new Error(`Repository metadata must match yourtion/node-erest: ${info.name}`);
    }
    if (manifest.publishConfig?.registry && !/^https:\/\/registry\.npmjs\.org\/?$/.test(manifest.publishConfig.registry)) {
      throw new Error(`Unexpected registry for ${info.name}`);
    }
    return { ...info, directory, manifest };
  });
  const names = new Set(packages.map((pkg) => pkg.name));
  for (const pkg of packages) {
    for (const field of dependencyFields) {
      for (const [name, range] of Object.entries(pkg.manifest[field] ?? {})) {
        if (range.startsWith('workspace:') && !names.has(name)) throw new Error(`Unreleased workspace dependency: ${name}`);
        if (names.has(name)) expectedInternalRange(range, pkg.version);
      }
    }
  }
  return orderPackages(packages);
}

export function inspectTarball(tarball, run = execute) {
  const manifest = JSON.parse(output(run('tar', ['-xOf', tarball, 'package/package.json'])));
  const entries = output(run('tar', ['-tzf', tarball])).trim().split('\n');
  for (const entry of entries) {
    if (!entry.startsWith('package/') || entry.split('/').includes('..')) throw new Error('Unsafe tarball entry');
  }
  const pack = {
    name: manifest.name, version: manifest.version, filename: basename(tarball),
    files: entries.map((path) => ({ path: path.slice('package/'.length) })),
  };
  validatePack(pack, manifest);
  const bin = manifest.bin;
  for (const target of typeof bin === 'string' ? [bin] : Object.values(bin ?? {})) {
    const path = `package/${target.replace(/^\.\//, '')}`;
    if (!output(run('tar', ['-xOf', tarball, path])).startsWith('#!')) throw new Error('CLI is missing its shebang');
    const mode = output(run('tar', ['-tvzf', tarball, path])).split(/\s+/)[0];
    if (!mode.includes('x')) throw new Error('CLI is not executable');
  }
  return { manifest, pack };
}

export function validatePackedPackage(pkg, packed, packages) {
  releaseInfo(pkg.tag, packed.manifest);
  validatePack(packed.pack, pkg.manifest);
  if (packed.manifest.name !== pkg.name || packed.manifest.repository?.url !== repositoryUrl) {
    throw new Error('Packed identity or repository does not match source');
  }
  for (const field of ['main', 'types', 'exports', 'bin', 'publishConfig']) {
    if (JSON.stringify(packed.manifest[field]) !== JSON.stringify(pkg.manifest[field])) {
      throw new Error(`Packed ${field} differs from source`);
    }
  }
  const names = new Set(packages.map((pkg) => pkg.name));
  for (const field of dependencyFields) {
    const source = pkg.manifest[field] ?? {};
    const actual = packed.manifest[field] ?? {};
    if (Object.keys(source).sort().join('\0') !== Object.keys(actual).sort().join('\0')) throw new Error('Packed dependencies changed');
    for (const [name, range] of Object.entries(actual)) {
      if (range.startsWith('workspace:')) throw new Error(`Unresolved workspace protocol in ${pkg.name}`);
      const expected = names.has(name) ? expectedInternalRange(source[name], pkg.version) : source[name];
      if (range !== expected) throw new Error(`Unexpected packed dependency ${name}: ${range}`);
    }
  }
}

export function packWorkspace(tag, destination, root = process.cwd(), run = execute) {
  const packages = workspaceRelease(tag, root);
  const directory = resolve(destination);
  mkdirSync(directory, { recursive: true });
  const records = packages.map((pkg) => {
    // pnpm rewrites workspace protocols. Required lifecycle work ran explicitly
    // in CI; ignore pack/publish hooks so they cannot rebuild or push Git tags.
    output(run('pnpm', ['pack', '--pack-destination', directory], {
      cwd: resolve(root, pkg.directory), env: { npm_config_ignore_scripts: 'true' },
    }));
    const filename = `${pkg.name.replace(/^@/, '').replace('/', '-')}-${pkg.version}.tgz`;
    const tarball = resolve(directory, filename);
    validatePackedPackage(pkg, inspectTarball(tarball, run), packages);
    return { name: pkg.name, version: pkg.version, filename, sha256: hashFile(tarball) };
  });
  const bundle = { tag, packages: records };
  writeFileSync(resolve(directory, 'release.json'), `${JSON.stringify(bundle, null, 2)}\n`);
  return bundle;
}

export function readBundle(tag, destination, root = process.cwd(), run = execute) {
  const packages = workspaceRelease(tag, root);
  const bundle = JSON.parse(readFileSync(resolve(destination, 'release.json'), 'utf8'));
  if (bundle.tag !== tag || !Array.isArray(bundle.packages) || bundle.packages.length !== packages.length) {
    throw new Error('Release bundle does not match the release set');
  }
  // Validate every file before the first registry query or irreversible publish.
  return packages.map((pkg, index) => {
    const record = bundle.packages[index];
    if (record.name !== pkg.name || record.version !== pkg.version || typeof record.filename !== 'string'
      || basename(record.filename) !== record.filename || !record.filename.endsWith('.tgz')) throw new Error('Unexpected release bundle entry');
    const tarball = resolve(destination, record.filename);
    if (hashFile(tarball) !== record.sha256) throw new Error(`Tarball integrity mismatch: ${pkg.name}`);
    validatePackedPackage(pkg, inspectTarball(tarball, run), packages);
    return { ...pkg, tarball };
  });
}

export function publishReleaseSet(packages, repository, run = execute) {
  if (repository !== 'yourtion/node-erest') throw new Error('Unexpected GitHub publishing repository');
  if (!packages.length || new Set(packages.map((pkg) => pkg.version)).size !== 1) throw new Error('Expected one coordinated release');
  for (const pkg of packages) publish(pkg, pkg.tarball, run);
  completeRelease(packages[0], repository, run);
}

export function publishingRuntime(nodeVersion, npmVersion) {
  const atLeast = (version, minimum) => {
    if (!/^\d+\.\d+\.\d+$/.test(version)) return false;
    const parts = version.split('.').map(Number);
    for (let index = 0; index < 3; index++) {
      if (parts[index] !== minimum[index]) return parts[index] > minimum[index];
    }
    return true;
  };
  if (!atLeast(nodeVersion, [22, 14, 0]) || !atLeast(npmVersion, [11, 5, 1])) {
    throw new Error('npm Trusted Publishing requires Node >=22.14.0 and npm >=11.5.1');
  }
}

function main() {
  const [command, tag, destination, ...extra] = process.argv.slice(2);
  if (extra.length) throw new Error('Unexpected release arguments');
  if (command === 'runtime') {
    const npmVersion = output(execute('npm', ['--version'])).trim();
    publishingRuntime(process.versions.node, npmVersion);
    console.log(`Node ${process.versions.node}, npm ${npmVersion}: OIDC capable`);
    return;
  }
  const packages = workspaceRelease(tag);
  if (command === 'check') console.log(JSON.stringify(packages.map(({ manifest, ...pkg }) => pkg), null, 2));
  else if (command === 'pack' && destination) console.log(JSON.stringify(packWorkspace(tag, destination), null, 2));
  else if (command === 'publish' && destination) {
    publishingRuntime(process.versions.node, output(execute('npm', ['--version'])).trim());
    publishReleaseSet(readBundle(tag, destination), process.env.GITHUB_REPOSITORY);
  } else throw new Error('Usage: npm-release.mjs check|pack|publish v<version> [directory], or runtime');
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
