import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { MODEL_SPEC } from '../src/model-spec.js';

const source = readFileSync(new URL('../src/classifier.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
function fixture(pipeline) {
    const logs = [];
    const context = vm.createContext({ MODEL_SPEC, pipeline, env: {}, console: { error: (...args) => logs.push(args), log: (...args) => logs.push(args) } });
    vm.runInContext(source, context);
    return { classifier: vm.runInContext('Classifier', context), classify: vm.runInContext('classifyText', context), logs };
}

test('concurrent requests share one model initialization', async () => {
    let loads = 0, release;
    const model = () => {};
    const f = fixture(() => { loads++; return new Promise(resolve => { release = resolve; }); });
    const first = f.classifier.getInstance(), second = f.classifier.getInstance();
    await Promise.resolve();
    assert.equal(loads, 1);
    release(model);
    assert.equal(await first, model); assert.equal(await second, model);
});

test('missing model fails explicitly instead of producing sponsor-like neutral scores', async () => {
    const f = fixture(async () => { throw new Error('private-provider-payload'); });
    await assert.rejects(f.classify('private caption content', ['sponsor', 'neutral']), error => error.code === 'model_unavailable');
    assert.equal(JSON.stringify(f.logs).includes('private-provider-payload'), false);
    assert.equal(JSON.stringify(f.logs).includes('private caption content'), false);
});

test('inference failure emits no caption or provider text and no scores', async () => {
    const f = fixture(async () => async () => { throw new Error('private-provider-payload'); });
    await assert.rejects(f.classify('private caption content', ['sponsor']), error => error.code === 'inference_failed');
    assert.equal(JSON.stringify(f.logs).includes('private'), false);
});

test('malformed and non-finite output is not accepted as classification evidence', async () => {
    for (const result of [{ labels: ['sponsor'], scores: [NaN] },
        { labels: ['different'], scores: [0.99] }, { labels: ['sponsor'], scores: [1.5] }]) {
        const f = fixture(async () => async () => result);
        await assert.rejects(f.classify('synthetic caption', ['sponsor']), error => error.code === 'invalid_output');
    }
});


test('failed initialization can be retried without caching failure', async () => {
    let attempts = 0;
    const model = async () => ({ labels: ['neutral', 'sponsor'], scores: [0.8, 0.2] });
    const f = fixture(async () => { if (++attempts === 1) throw new Error('unavailable'); return model; });
    await assert.rejects(f.classifier.getInstance(), error => error.code === 'model_unavailable');
    const scores = await f.classify('synthetic caption', ['sponsor', 'neutral']);
    assert.equal(scores.sponsor, 0.2); assert.equal(scores.neutral, 0.8); assert.equal(attempts, 2);
});
