import test from 'node:test';import assert from 'node:assert/strict';
import {CorrectionStore,matchesCorrection} from '../src/viewer/corrections.js';
import {ResultCache} from '../src/viewer/cache.js';import {SessionCoordinator} from '../src/viewer/coordinator.js';
const segment={start:10,end:20,category:'sponsor'};
function storage(){const values={};return {values,get:async key=>key===null?structuredClone(values):{[key]:structuredClone(values[key])},set:async update=>Object.assign(values,structuredClone(update)),remove:async key=>{for(const k of [].concat(key))delete values[k];}};}
test('durable correction survives cache eviction, another store, and detector retries; reset affects only video',async()=>{
 const local=storage(),corrections=new CorrectionStore(local),cache=new ResultCache(local,{maxEntries:1});
 await corrections.reject('first',segment);await corrections.reject('second',segment);
 await cache.put('first','m',{segments:[segment],duration:30});await cache.put('second','m',{segments:[],duration:30});
 const coordinator=new SessionCoordinator({settings:{get:async()=>({})},cache,corrections:new CorrectionStore(local),modelKey:'m',detect:async()=>({segments:[segment]})});
 assert.deepEqual((await coordinator.begin(1,'first','a',{retry:true})).rejected,[segment]);
 const transcript={videoId:'first',duration:30,timing:'word',language:'en',track:'automatic',words:[{text:'x',start:1,end:2}]};
 assert.deepEqual((await coordinator.submit(1,'a',transcript)).rejected,[segment]);
 await coordinator.correct(1,'a',0,true);assert.deepEqual(await corrections.get('first'),[]);assert.deepEqual(await corrections.get('second'),[segment]);
});
test('conservative shifted matching excludes adjacent blocks, merged estimates, category changes and small overlaps',()=>{
 assert.equal(matchesCorrection(segment,{...segment,start:9,end:21}),true);
 for(const estimate of [{start:19,end:30},{start:0,end:30},{start:10,end:12},{start:30,end:40}])assert.equal(matchesCorrection(segment,{...estimate,category:'sponsor'}),false);
 assert.equal(matchesCorrection(segment,{...segment,category:'selfpromo'}),false);
});
test('concurrent corrections are serialized and malformed entries cannot suppress playback',async()=>{
 const local=storage(),store=new CorrectionStore(local);
 await Promise.all([store.reject('first',segment),store.reject('first',{...segment,start:30,end:40})]);assert.equal((await store.get('first')).length,2);
 local.values['viewer-corrections:v1:first']={schema:1,rejected:[{...segment,end:Infinity}]};assert.deepEqual(await store.get('first'),[]);
 await assert.rejects(store.reject('first',{...segment,start:-1}));
});
test('navigation ends the visit pause, retry preserves it, and stale correction actions are rejected',async()=>{
 const local=storage(),coordinator=new SessionCoordinator({settings:{get:async()=>({})},cache:new ResultCache(local),corrections:new CorrectionStore(local),modelKey:'m'});
 await coordinator.begin(1,'first','a');coordinator.pause(1,true);assert.equal((await coordinator.begin(1,'first','b',{retry:true})).paused,true);
 assert.equal((await coordinator.begin(1,'second','c')).paused,false);assert.equal((await coordinator.begin(1,'first','d')).paused,false);
 await assert.rejects(coordinator.correct(1,'a',0),/stale_session/);
});
