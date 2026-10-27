import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execute, inspectTarball, output, releaseInfo } from './npm-release.mjs';

// First local publication creates the npm package so its owner can configure OIDC.
// Keep the source version coordinated with the rest of the workspace.
export function bootstrapManifest(source) {
  if (source.name !== '@erest/h3') throw new Error('Expected @erest/h3');
  const manifest = structuredClone(source);
  manifest.version = '1.0.0';
  manifest.peerDependencies.erest = '^3.3.1';
  delete manifest.devDependencies;
  delete manifest.scripts;
  releaseInfo('v1.0.0', manifest);
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    if (Object.values(manifest[field] ?? {}).some((range) => range.startsWith('workspace:'))) {
      throw new Error('Bootstrap package must not contain workspace dependencies');
    }
  }
  return manifest;
}

export function packH3Bootstrap(destination = '.', root = process.cwd(), run = execute) {
  const source = resolve(root, 'packages/erest-h3');
  const manifest = bootstrapManifest(JSON.parse(readFileSync(resolve(source, 'package.json'), 'utf8')));
  const directory = resolve(destination);
  mkdirSync(directory, { recursive: true });
  const staging = mkdtempSync(resolve(tmpdir(), 'erest-h3-bootstrap-'));
  try {
    cpSync(resolve(source, 'dist'), resolve(staging, 'dist'), { recursive: true });
    writeFileSync(resolve(staging, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    // This is an isolated package with no workspace protocols or lifecycle scripts.
    output(run('npm', ['pack', '--ignore-scripts', '--pack-destination', directory], { cwd: staging }));
    const tarball = resolve(directory, 'erest-h3-1.0.0.tgz');
    const packed = inspectTarball(tarball);
    releaseInfo('v1.0.0', packed.manifest);
    if (packed.manifest.name !== '@erest/h3' || packed.manifest.peerDependencies?.erest !== '^3.3.1') {
      throw new Error('Unexpected bootstrap package identity or erest dependency');
    }
    return tarball;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length > 3) throw new Error('Usage: npm-bootstrap-h3.mjs [destination]');
    console.log(packH3Bootstrap(process.argv[2]));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
