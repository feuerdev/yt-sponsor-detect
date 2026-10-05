import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
const source = readFileSync(new URL('../src/background.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function fixture() {
    const pending = deferred(), cache = deferred(), messages = [], writes = [];
    const context = vm.createContext({ console: { log() {}, error() {} },
        env: { backends: { onnx: { wasm: {} } } },
        classifyText: () => pending.promise,
        chrome: {
            tabs: { async sendMessage(id, message) { messages.push(message); }, onRemoved: { addListener() {} } },
            storage: { local: { get: () => cache.promise, async set(value) { writes.push(value); } } },
            webRequest: { onCompleted: { addListener() {} } },
            runtime: { onMessage: { addListener() {} } },
        },
    });
    vm.runInContext(source, context);
    vm.runInContext(`tabState[1] = { videoId: 'first', isAnalyzing: false,
        windowQueue: [[{ text: 'caption '.repeat(10), start: '0', duration: '2' }]],
        windowScores: [], foundSegments: [] }`, context);
    return { context, pending, cache, messages, writes,
        run: text => vm.runInContext(text, context),
    };
}

test('closed or cleared tab cancels in-flight analysis messages', async () => {
    const f = fixture();
    const work = f.run("processWindowQueue(1, 'first', [{ name: 'sponsor', blocked: true, threshold: 0.5 }])");
    await Promise.resolve(); await Promise.resolve();
    f.run('delete tabState[1]');
    f.pending.resolve({ sponsor: 0.9 }); await work;
    assert.deepEqual(f.messages.map(message => message.type), ['ANALYSIS_STARTED']);
});

test('recreated state for the same video does not accept an older analysis', async () => {
    const f = fixture();
    const work = f.run("processWindowQueue(1, 'first', [{ name: 'sponsor', blocked: true, threshold: 0.5 }])");
    await Promise.resolve(); await Promise.resolve();
    f.run("tabState[1] = { videoId: 'first', windowScores: [], foundSegments: [] }");
    f.pending.resolve({ sponsor: 0.9 }); await work;
    assert.deepEqual(f.messages.map(message => message.type), ['ANALYSIS_STARTED']);
    assert.equal(f.run('tabState[1].foundSegments.length'), 0);
});

test('clearing state while reading cached segments prevents an obsolete cache write', async () => {
    const f = fixture();
    const work = f.run("processNewSegment(1, 'first', { startTime: 0, endTime: 2, label: 'sponsor' })");
    await Promise.resolve(); await Promise.resolve();
    f.run('delete tabState[1]');
    f.cache.resolve({}); await work;
    assert.equal(f.writes.length, 0);
});

test('current analysis still emits and caches a successful segment', async () => {
    const f = fixture();
    f.cache.resolve({}); f.pending.resolve({ sponsor: 0.9 });
    await f.run("processWindowQueue(1, 'first', [{ name: 'sponsor', blocked: true, threshold: 0.5 }])");
    assert.deepEqual(f.messages.map(message => message.type), [
        'ANALYSIS_STARTED', 'ANALYSIS_PROGRESS', 'SPONSORED_SEGMENT_FOUND', 'ANALYSIS_FINISHED',
    ]);
    assert.equal(f.writes.length, 1);
    assert.equal(f.writes[0].first[0].endTime, 2);
    assert.equal(f.run('tabState[1].isAnalyzing'), false);
});

function captionFixture() {
    let listener, removed;
    const requests = [], messages = [];
    const context = vm.createContext({ URL, console: { log() {}, error() {} },
        env: { backends: { onnx: { wasm: {} } } },
        classifyText: async () => ({ sponsor: 0 }),
        fetch: url => { const work = deferred(); requests.push({ url, ...work }); return work.promise; },
        chrome: {
            tabs: { async sendMessage(id, message) { messages.push(message); },
                onRemoved: { addListener(fn) { removed = fn; } } },
            storage: { sync: { async get() { return { isEnabled: true,
                labels: [{ name: 'sponsor', blocked: true, threshold: 0.5 }] }; } },
                local: { async get() { return {}; }, async set() {} } },
            webRequest: { onCompleted: { addListener(fn) { listener = fn; } } },
            runtime: { id: 'fixture', onMessage: { addListener() {} } },
        },
    });
    vm.runInContext(source, context);
    const reply = () => ({ ok: true, async text() { return JSON.stringify({ events:
        Array.from({ length: 20 }, (_, i) => ({ tStartMs: i * 1000, dDurationMs: 1000,
            segs: [{ utf8: 'caption fixture text' }] })) }); } });
    return { context, requests, messages, reply, removed: id => removed(id),
        request: videoId => listener({ tabId: 1, url: `https://www.youtube.com/api/timedtext?v=${videoId}` }),
        run: text => vm.runInContext(text, context),
    };
}

test('a slower caption fetch cannot restore the previous video state', async () => {
    const f = captionFixture();
    const old = f.request('old'); await new Promise(setImmediate);
    const current = f.request('current'); await new Promise(setImmediate);
    f.requests[1].resolve(f.reply()); await current;
    f.requests[0].resolve(f.reply()); await old;
    assert.equal(f.run('tabState[1].videoId'), 'current');
    assert.equal(f.run('tabState[1].allCaptions.length'), 20);
    assert.equal(f.messages.filter(m => m.type === 'ANALYSIS_STARTED').length, 1);
});

for (const cancellation of ['removed', 'cleared']) {
    test(`${cancellation} tab does not revive after an in-flight caption fetch`, async () => {
        const f = captionFixture();
        const work = f.request('first'); await new Promise(setImmediate);
        if (cancellation === 'removed') f.removed(1);
        else f.run('delete tabState[1]');
        f.requests[0].resolve(f.reply()); await work;
        assert.equal(f.run('tabState[1]'), undefined);
        assert.equal(f.messages.length, 0);
    });
}

test('current caption fetch still collects and analyzes captions', async () => {
    const f = captionFixture();
    const work = f.request('current'); await new Promise(setImmediate);
    f.requests[0].resolve(f.reply()); await work;
    assert.equal(f.run('tabState[1].allCaptions.length'), 20);
    assert.equal(f.messages[0].type, 'ANALYSIS_STARTED');
});

test('classifier failure clears partial evidence and reports unavailable instead of finished', async () => {
    const f = fixture();
    f.context.classifyText = async () => { throw Object.assign(new Error('inert failure'), { code: 'model_unavailable' }); };
    await f.run("processWindowQueue(1, 'first', [{ name: 'sponsor', blocked: true, threshold: 0.5 }])");
    assert.deepEqual(f.messages.map(message => message.type), ['ANALYSIS_STARTED', 'CLEAR_SEGMENTS', 'ANALYSIS_ERROR']);
    assert.equal(f.run('tabState[1].windowScores.length'), 0);
    assert.equal(f.run('tabState[1].isAnalyzing'), false);
});
