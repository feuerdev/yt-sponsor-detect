import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, open, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { MODEL_SPEC } from '../src/model-spec.js';

export async function verifyAssets(directory, spec = MODEL_SPEC) {
    for (const file of spec.files) {
        const target = path.join(directory, file.path);
        const metadata = await stat(target);
        if (!metadata.isFile() || metadata.size !== file.size) throw new Error(`Invalid model asset size: ${file.path}`);
        const hash = createHash('sha256');
        for await (const chunk of createReadStream(target)) hash.update(chunk);
        if (hash.digest('hex') !== file.sha256) throw new Error(`Invalid model asset hash: ${file.path}`);
    }
}

// Stream sequentially; never initialize an inference pipeline during setup.
// Publish a complete verified directory with rename, leaving existing files intact.
export async function installAssets(parent, spec = MODEL_SPEC, fetchFile = fetch) {
    await mkdir(parent, { recursive: true });
    const target = path.join(parent, spec.directory);
    try {
        await stat(target);
        await verifyAssets(target, spec);
        return target;
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        // An existing incomplete directory is a diagnosis, not permission to overwrite it.
        try { await stat(target); throw new Error('Existing model directory is incomplete; inspect it before replacement.'); }
        catch (existing) { if (existing.code !== 'ENOENT') throw existing; }
    }
    const staging = await mkdtemp(path.join(parent, '.model-staging-'));
    try {
        for (const file of spec.files) {
            const response = await fetchFile(`https://huggingface.co/${spec.repository}/resolve/${spec.revision}/${file.path}`, {
                signal: AbortSignal.timeout(300000),
            });
            if (!response.ok || !response.body) throw new Error(`Model download failed: ${file.path}`);
            const filename = path.join(staging, file.path);
            await mkdir(path.dirname(filename), { recursive: true });
            const output = await open(filename, 'wx');
            let size = 0;
            try {
                for await (const chunk of response.body) {
                    size += chunk.byteLength;
                    if (size > file.size) throw new Error(`Oversized model download: ${file.path}`);
                    let offset = 0;
                    while (offset < chunk.byteLength) {
                        const { bytesWritten } = await output.write(chunk, offset, chunk.byteLength - offset);
                        if (bytesWritten === 0) throw new Error('Model asset write made no progress.');
                        offset += bytesWritten;
                    }
                }
            } finally { await output.close(); }
        }
        await verifyAssets(staging, spec);
        await rename(staging, target);
        return target;
    } finally { await rm(staging, { recursive: true, force: true }); }
}
