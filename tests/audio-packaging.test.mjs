// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import webpack from 'webpack';
import CopyPlugin from 'copy-webpack-plugin';
import config from '../audio-poc/webpack.config.js';

test('audio bundle preserves nested Whisper model files and their bytes', async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), 'audio-packaging-'));
    let compiler;
    try {
        const model = path.join(temp, 'whisper-tiny.en');
        await mkdir(path.join(model, 'onnx'), {recursive: true});
        const files = {'config.json': '{"model_type":"whisper"}', 'tokenizer.json': '{"tokens":[]}', 'onnx/encoder_model_quantized.onnx': 'distinct encoder bytes'};
        for (const [name, bytes] of Object.entries(files)) await writeFile(path.join(model, name), bytes);
        await writeFile(path.join(temp, 'entry.js'), 'export default 1;');
        const productionPattern = config.plugins[0].patterns.find(p => p.to === 'model/whisper-tiny.en');
        assert.ok(productionPattern, 'production model copy pattern exists');
        compiler = webpack({mode: 'production', entry: path.join(temp, 'entry.js'), output: {path: path.join(temp, 'dist')}, plugins: [new CopyPlugin({patterns: [{...productionPattern, from: model}]})]});
        await new Promise((resolve, reject) => compiler.run((error, stats) => error || stats.hasErrors() ? reject(error || Error(stats.toString('errors-only'))) : resolve()));
        for (const [name, bytes] of Object.entries(files)) assert.equal(await readFile(path.join(temp, 'dist/model/whisper-tiny.en', name), 'utf8'), bytes);
    } finally {
        if (compiler) await new Promise(resolve => compiler.close(resolve));
        await rm(temp, {recursive: true, force: true});
    }
});
