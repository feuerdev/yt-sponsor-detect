import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { installAssets, verifyAssets } from '../scripts/model-assets.mjs';

const data = Buffer.from('inert synthetic fixture, not model weights');
const spec = { repository: 'fixture/model', revision: 'pinned', directory: 'fixture', files: [
    { path: 'onnx/model.onnx', size: data.length, sha256: createHash('sha256').update(data).digest('hex') },
] };
async function fixture(run) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sponsor-assets-'));
    try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}
test('setup installs exact pinned bytes and reuses only verified existing assets', () => fixture(async root => {
    let downloads = 0;
    const fetchFile = async url => { assert.equal(url, 'https://huggingface.co/fixture/model/resolve/pinned/onnx/model.onnx'); downloads++; return new Response(data); };
    const target = await installAssets(root, spec, fetchFile);
    assert.deepEqual(await readFile(path.join(target, spec.files[0].path)), data);
    await verifyAssets(target, spec);
    await installAssets(root, spec, fetchFile); assert.equal(downloads, 1);
}));
test('wrong hash, oversized and interrupted downloads never publish partial assets', () => fixture(async root => {
    for (const body of [Buffer.alloc(data.length), Buffer.alloc(data.length + 1)]) {
        await assert.rejects(installAssets(root, spec, async () => new Response(body)));
        assert.deepEqual(await readdir(root), []);
    }
    await assert.rejects(installAssets(root, spec, async () => { throw new Error('connection lost'); }));
    assert.deepEqual(await readdir(root), []);
}));
test('existing damaged assets are preserved and diagnosed without network calls', () => fixture(async root => {
    const target = path.join(root, 'fixture'); await mkdir(target); await writeFile(path.join(target, 'owner-file'), 'retain');
    await assert.rejects(installAssets(root, spec, async () => { assert.fail('must not download'); }), /incomplete/);
    assert.equal(await readFile(path.join(target, 'owner-file'), 'utf8'), 'retain');
}));
