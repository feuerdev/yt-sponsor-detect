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
