import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJson = file => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
const pkg = readJson('package.json');
const lock = readJson('package-lock.json');
const manifest = readJson('src/manifest.json');

assert.equal(pkg.name, lock.name, 'Lockfile package name must match package.json');
assert.equal(pkg.name, lock.packages[''].name, 'Lockfile root name must match');
assert.equal(pkg.version, lock.version, 'Lockfile version must match package.json');
assert.equal(pkg.version, manifest.version, 'Extension/package version must match');
assert.equal(manifest.manifest_version, 3, 'Extension must use Manifest V3');
assert.equal(pkg.type, 'module', 'Build scripts use ES modules');

const files = [
    ...readdirSync(root).filter(file => /\.(m?js)$/.test(file)),
    ...['src', 'scripts'].flatMap(dir => readdirSync(path.join(root, dir))
        .filter(file => /\.(m?js)$/.test(file)).map(file => `${dir}/${file}`)),
];

for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', path.join(root, file)], {
        encoding: 'utf8',
    });
    assert.equal(result.status, 0, `Invalid JavaScript in ${file}: ${result.error || result.stderr}`);
}

for (const file of [manifest.background.service_worker,
    manifest.action.default_popup,
    ...manifest.content_scripts.flatMap(script => script.js)]) {
    readFileSync(path.join(root, 'src', file));
}

console.log(`Validated ${files.length} JavaScript files and extension/package configuration. No ML executed.`);
