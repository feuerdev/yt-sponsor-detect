import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/content.js', import.meta.url), 'utf8');
function element(src = '') {
    const listeners = new Map();
    return { src, duration: 0, listeners,
        addEventListener(type, handler) { listeners.set(type, handler); },
        removeEventListener(type, handler) { if (listeners.get(type) === handler) listeners.delete(type); },
    };
}
function fixture() {
    const state = { video: element(), bar: element(), requests: [] };
    const context = vm.createContext({
        console: { log() {}, error() {} }, URLSearchParams, setTimeout,
        window: { location: { search: '?v=first' } },
        document: { body: {},
            querySelector(selector) { return selector === 'video' ? state.video : selector === '.ytp-progress-bar' ? state.bar : null; },
            querySelectorAll() { return []; }, getElementById() { return null; },
        },
        chrome: { runtime: { onMessage: { addListener() {} },
            sendMessage(request, callback) { state.requests.push({ request, callback }); },
        } },
        MutationObserver: class { observe() {} },
    });
    vm.runInContext(source, context);
    state.context = context;
    state.refresh = () => vm.runInContext('initializeVideoListener()', context);
    state.segments = () => vm.runInContext('sponsoredSegments.length', context);
    return state;
}

test('rebinds a replaced video element even when its source is unchanged', () => {
    const f = fixture(), old = f.video;
    f.video = element(); f.refresh();
    assert.equal(old.listeners.has('timeupdate'), false);
    assert.equal(f.video.listeners.has('timeupdate'), true);
});

test('navigation on the same player requests the new video and ignores stale cached results', () => {
    const f = fixture();
    f.context.window.location.search = '?v=second'; f.refresh();
    assert.equal(f.requests.at(-1).request.videoId, 'second');
    f.requests[0].callback({ segments: [{ startTime: 1, endTime: 2 }] });
    assert.equal(f.segments(), 0);
    f.requests.at(-1).callback({ segments: [{ startTime: 3, endTime: 4 }] });
    assert.equal(f.segments(), 1);
});

test('removing an empty-source video releases listeners and segments', () => {
    const f = fixture(), old = f.video, bar = f.bar;
    f.requests[0].callback({ segments: [{ startTime: 1, endTime: 2 }] });
    f.video = null; f.refresh();
    assert.equal(old.listeners.has('timeupdate'), false);
    assert.equal(bar.listeners.has('click'), false);
    assert.equal(f.segments(), 0);
});

test('replacing or removing the progress bar releases its old click listener', () => {
    const f = fixture(), old = f.bar;
    f.bar = element(); f.refresh();
    assert.equal(old.listeners.has('click'), false);
    assert.equal(f.bar.listeners.has('click'), true);
    const replacement = f.bar;
    f.bar = null; f.refresh();
    assert.equal(replacement.listeners.has('click'), false);
});

test('unchanged player observation preserves listeners and cached segments', () => {
    const f = fixture();
    f.requests[0].callback({ segments: [{ startTime: 1, endTime: 2 }] });
    f.refresh(); f.refresh();
    assert.equal(f.requests.length, 1);
    assert.equal(f.segments(), 1);
    assert.equal(f.video.listeners.size, 1);
});

test('returning to a video rejects a cache callback from its previous visit', () => {
    const f = fixture();
    f.context.window.location.search = '?v=second'; f.refresh();
    f.context.window.location.search = '?v=first'; f.refresh();
    f.requests[0].callback({ segments: [{ startTime: 1, endTime: 2 }] });
    assert.equal(f.segments(), 0);
    f.requests.at(-1).callback({ segments: [{ startTime: 3, endTime: 4 }] });
    assert.equal(f.segments(), 1);
});

test('cache callbacks after player removal cannot restore segments', () => {
    const f = fixture();
    f.video = null; f.refresh();
    f.requests[0].callback({ segments: [{ startTime: 1, endTime: 2 }] });
    assert.equal(f.segments(), 0);
});
