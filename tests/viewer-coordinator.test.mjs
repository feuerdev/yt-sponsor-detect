import assert from 'node:assert/strict';
import test from 'node:test';
import {SessionCoordinator} from '../src/viewer/coordinator.js';
import {ResultCache} from '../src/viewer/cache.js';
import {DetectorQueue,createNliAdapter} from '../src/viewer/detector.js';
const wait=()=>new Promise(resolve=>setImmediate(resolve));
function storage(initial={}) {
    const values=structuredClone(initial);
    return {values,get:async key=>key===null?structuredClone(values):{[key]:structuredClone(values[key])},
        set:async changes=>Object.assign(values,structuredClone(changes)),remove:async keys=>{for(const key of [].concat(keys))delete values[key];}};
}
const transcript={videoId:'first',duration:30,timing:'word',track:'automatic',language:'en',words:[{text:'sponsor',start:1,end:2}]};
const result={segments:[{start:1,end:4,category:'sponsor'}],diagnostics:{model:'test'}};
function fixture(detect=async()=>result) {
    const local=storage(),settings=storage({viewerSchema:1,isEnabled:true,autoSkip:true}),states=[],cancelled=[];
    const cache=new ResultCache(local);
    const coordinator=new SessionCoordinator({settings,cache,detect,modelKey:'pinned-v1',cancel:id=>cancelled.push(id),notify:(tab,state)=>states.push({tab,state:structuredClone(state)})});
    return {local,settings,states,cancelled,cache,coordinator};
}
test('successful current analysis emits and caches only complete validated intervals',async()=>{
    const f=fixture();const begin=await f.coordinator.begin(1,'first','a');assert.equal(begin.status,'loading');
    const state=await f.coordinator.submit(1,'a',transcript);assert.equal(state.status,'ready');assert.equal(state.segments.length,1);
    assert.equal(f.local.values['viewer-cache:first'].complete,true);
    assert.ok(f.states.some(s=>s.state.status==='analyzing'));
});
test('navigation, tab close and recreated same-video sessions reject stale completion and cache writes',async()=>{
    for(const action of ['navigate','close','revisit']) {
        let finish;const f=fixture(()=>new Promise(resolve=>{finish=resolve;}));await f.coordinator.begin(1,'first','a');
        const work=f.coordinator.submit(1,'a',transcript);await wait();
        if(action==='close')f.coordinator.clear(1);else await f.coordinator.begin(1,action==='navigate'?'second':'first','b');
        finish(result);assert.equal(await work,null);assert.equal(f.local.values['viewer-cache:first'],undefined);
        assert.equal(f.states.some(s=>s.state.token==='a'&&s.state.status==='ready'),false);assert.ok(f.cancelled.includes('1:a'));
    }
});
test('cache read after disable cannot restore an obsolete session',async()=>{
    const f=fixture();let release;f.cache.get=()=>new Promise(resolve=>{release=resolve;});const pending=f.coordinator.begin(1,'first','a');await wait();
    f.coordinator.disabled();release({...result,duration:30});assert.equal(await pending,null);
    assert.equal(f.states.at(-1).state.status,'disabled');
});
test('ready empty results survive worker restart under same model key, never a different key or expiry',async()=>{
    const local=storage();let now=1000;const cache=new ResultCache(local,{clock:()=>now,ttl:100});
    await cache.put('first','model',{segments:[],duration:30});assert.deepEqual((await new ResultCache(local,{clock:()=>now,ttl:100}).get('first','model')).segments,[]);
    assert.equal(await cache.get('first','other'),null);now=1200;assert.equal(await cache.get('first','model'),null);
});
test('serialized concurrent cache writes enforce the shared bound and cancellation',async()=>{
    const local=storage(),cache=new ResultCache(local,{maxEntries:3});
    await Promise.all(Array.from({length:8},(_,i)=>cache.put('v'+i,'model',{...result,duration:30})));
    assert.equal(Object.keys(local.values).length,3);
    await cache.put('cancelled','model',{...result,duration:30},()=>false);assert.equal(local.values['viewer-cache:cancelled'],undefined);
});
test('partial current results can arrive during analysis; stale progress cannot alter next video',async()=>{
    let finish;const f=fixture(()=>new Promise(resolve=>{finish=resolve;}));await f.coordinator.begin(1,'first','a');const work=f.coordinator.submit(1,'a',transcript);await wait();
    f.coordinator.progress('1:a',{processed:1,total:2,segments:result.segments});assert.equal(f.states.at(-1).state.segments.length,1);
    assert.equal(f.local.values['viewer-cache:first'],undefined);await f.coordinator.begin(1,'second','b');
    f.coordinator.progress('1:a',{processed:2,total:2,segments:result.segments});assert.equal(f.states.at(-1).state.videoId,'second');finish(result);await work;
});
test('errors clear provisional intervals and stay retriable without caching failures',async()=>{
    let calls=0;const f=fixture(async()=>{if(++calls===1)throw Object.assign(new Error('private detail'),{code:'model_unavailable'});return result;});
    await f.coordinator.begin(1,'first','a');const first=await f.coordinator.submit(1,'a',transcript);
    assert.equal(first.status,'model_unavailable');assert.equal(first.segments.length,0);assert.equal(Object.keys(f.local.values).length,0);
    await f.coordinator.begin(1,'first','b',{retry:true});assert.equal((await f.coordinator.submit(1,'b',transcript)).status,'ready');
});
test('viewing preferences and pause preserve analysis/cache, retry explicitly clears cache',async()=>{
    const f=fixture();await f.coordinator.begin(1,'first','a');await f.coordinator.submit(1,'a',transcript);
    await f.settings.set({autoSkip:false,selfPromotion:true});f.coordinator.pause(1,true);
    assert.equal(f.coordinator.snapshot(f.coordinator.sessions.get(1)).segments.length,1);
    assert.ok(await f.cache.get('first','pinned-v1'));
    const state=await f.coordinator.begin(1,'first','b',{retry:true});assert.equal(state.paused,true);assert.equal(state.status,'loading');assert.equal(await f.cache.get('first','pinned-v1'),null);
});
test('forged timing, video identity and non-finite output are never accepted',async()=>{
    const f=fixture(async()=>({segments:[{start:1,end:Infinity,category:'sponsor'}]}));await f.coordinator.begin(1,'first','a');
    assert.equal((await f.coordinator.submit(1,'a',{...transcript,videoId:'second'})).status,'invalid_captions');
    assert.equal((await f.coordinator.submit(1,'a',transcript)).status,'invalid_output');assert.equal(Object.keys(f.local.values).length,0);
});
test('detector loads once, serializes work, and cancelled jobs never run inference',async()=>{
    let loads=0,active=0,max=0,calls=0;
    const queue=new DetectorQueue({descriptor:{model:'test'},initialize:async()=>{loads++;return {detect:async()=>{calls++;active++;max=Math.max(max,active);await wait();active--;return result;}};}});
    const first=queue.run(transcript,{jobId:'a'}),second=queue.run(transcript,{jobId:'b'});queue.cancel('b');
    assert.equal((await first).segments.length,1);await assert.rejects(second,error=>error.code==='cancelled');assert.equal(loads,1);assert.equal(max,1);assert.equal(calls,1);
});
test('detector initialization retries after failure and cannot accept invalid intervals',async()=>{
    let attempts=0;const queue=new DetectorQueue({descriptor:{model:'test'},initialize:async()=>{if(++attempts===1)throw new Error('failed');return {detect:async()=>({segments:[{start:-1,end:3,category:'sponsor'}]})};}});
    await assert.rejects(queue.run(transcript,{jobId:'a'}),e=>e.code==='model_unavailable');
    await assert.rejects(queue.run(transcript,{jobId:'b'}),e=>e.code==='invalid_output');assert.equal(attempts,2);
});
test('NLI comparison adapter covers short transcripts and the final tail, honoring cancellation',async()=>{
    const seen=[];const adapter=createNliAdapter(async text=>{seen.push(text);return {'paid sponsorship':0.99,'self promotion':0};});
    const words=Array.from({length:81},(_,i)=>({text:'w'+i,start:i,end:i+1}));
    const detected=await adapter.detect({...transcript,duration:81,words},{cancelled:()=>{},onProgress:()=>{}});
    assert.ok(seen.at(-1).includes('w80'));assert.equal(detected.segments.at(-1).end,81);
    await assert.rejects(adapter.detect(transcript,{cancelled:()=>{throw new Error('cancelled');},onProgress:()=>{}}),/cancelled/);
});

test('partial panel analysis stays useful without a false complete-video cache',async()=>{
    const f=fixture(async()=>({segments:[{start:1,end:2,category:'sponsor'}]}));await f.coordinator.begin(1,'first','partial');
    const state=await f.coordinator.submit(1,'partial',{...transcript,coverage:'partial',coverageStart:1,coverageEnd:2});
    assert.equal(state.status,'ready');assert.equal(state.diagnostics.coverage,'partial');assert.equal(f.local.values['viewer-cache:first'],undefined);
});
