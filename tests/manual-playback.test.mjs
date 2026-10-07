import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/content.js', import.meta.url), 'utf8');
function fixture(settings = { isEnabled: true }) {
    class Element {
        constructor(tag) { this.tag = tag; this.style = {}; this.children = []; this.events = {}; this.textContent = ''; }
        appendChild(child) { child.parent = this; this.children.push(child); return child; }
        remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
        setAttribute(key, value) { this[key] = value; }
        addEventListener(type, handler) { this.events[type] = handler; }
        removeEventListener(type, handler) { if (this.events[type] === handler) delete this.events[type]; }
        click() { this.events.click?.({ currentTarget: this }); }
    }
    const player = new Element('player'), video = new Element('video');
    Object.assign(video, { readyState: 1, duration: 120, currentTime: 1.5, src: 'first' });
    const all = () => { const result = []; const visit = node => { result.push(node); node.children.forEach(visit); }; visit(player); return result; };
    let changed, message;
    const context = vm.createContext({ console: { log() {}, error() {} }, URLSearchParams,
        setTimeout() { return 1; }, clearTimeout() {},
        window: { location: { search: '?v=first' } }, MutationObserver: class { observe() {} },
        document: { body: {}, createElement: tag => new Element(tag),
            getElementById: id => all().find(node => node.id === id) || null,
            querySelector: selector => selector === 'video' ? video : selector === '#movie_player' ? player : null,
            querySelectorAll: () => [],
        },
        chrome: { storage: { sync: { get: async () => settings }, onChanged: { addListener(fn) { changed = fn; } } },
            runtime: { onMessage: { addListener(fn) { message = fn; } }, sendMessage(request, callback) { callback?.({ segments: [] }); } },
        },
    });
    vm.runInContext(source, context);
    return { context, video, all, change: updates => changed(updates, 'sync'), message,
        run: code => vm.runInContext(code, context),
        add: () => vm.runInContext("addSponsoredSegment({startTime:1,endTime:4,label:'synthetic sponsor'})", context),
        check: () => vm.runInContext('checkForSponsorBlock()', context),
        button: text => all().find(node => node.tag === 'button' && node.textContent === text),
    };
}
async function ready(f) { await Promise.resolve(); await Promise.resolve(); f.add(); f.check(); }

test('default mode highlights and suggests without changing playback', async () => {
    const f = fixture(); await ready(f);
    assert.equal(f.video.currentTime, 1.5);
    assert.ok(f.button('Skip suggestion'));
});
test('manual skip has Undo which replays the segment without another skip', async () => {
    const f = fixture(); await ready(f);
    const skip = f.button('Skip suggestion'); assert.ok(skip); skip.click();
    assert.equal(f.video.currentTime, 4);
    const undo = f.button('Undo'); assert.ok(undo); undo.click();
    assert.equal(f.video.currentTime, 1.5); f.check();
    assert.equal(f.video.currentTime, 1.5);
});
test('legacy automatic opt-in remains manual until independent reliability evidence exists', async () => {
    const f = fixture({ isEnabled: true, autoSkip: true }); await ready(f);
    assert.equal(f.video.currentTime, 1.5);
    assert.ok(f.button('Skip suggestion'));
});
test('a retained suggestion cannot seek after disable', async () => {
    const f = fixture(); await ready(f);
    const skip = f.button('Skip suggestion'); assert.ok(skip);
    f.change({ isEnabled: { newValue: false } }); skip.click();
    assert.equal(f.video.currentTime, 1.5);
});
test('a retained Undo cannot seek a new video in a reused player', async () => {
    const f = fixture({ isEnabled: true, autoSkip: true }); await ready(f);
    const skip = f.button('Skip suggestion'); assert.ok(skip); skip.click();
    const undo = f.button('Undo'); assert.ok(undo);
    f.context.window.location.search = '?v=second'; f.video.currentTime = 7;
    f.run('initializeVideoListener()'); undo.click();
    assert.equal(f.video.currentTime, 7);
});
test('model failure is visible and leaves playback unchanged', async () => {
    const f = fixture(); await Promise.resolve();
    f.message({ type: 'ANALYSIS_ERROR', payload: { code: 'model_unavailable' } });
    assert.equal(f.video.currentTime, 1.5);
    assert.ok(f.all().some(node => node.role === 'status' && node.textContent.includes('unavailable')));
});

test('label changes invalidate retained suggestions and obsolete cache callbacks', async () => {
    const f = fixture(); await ready(f);
    const skip = f.button('Skip suggestion'); assert.ok(skip);
    f.change({ labels: { newValue: [{name: 'other', threshold: 0.9, blocked: true}] } });
    skip.click();
    assert.equal(f.video.currentTime, 1.5);
    f.check(); assert.equal(f.button('Skip suggestion'), undefined);
});
