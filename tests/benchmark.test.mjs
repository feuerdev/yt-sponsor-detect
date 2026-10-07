// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateFixture,validatePrediction,validateManifest} from '../bench/contracts.mjs';
import {union,seconds,intersection,match,evaluateVideo,summarize,bootstrap} from '../bench/evaluate.mjs';
const fixture={videoId:'synthetic',channelId:'channel-a',durationSeconds:100,language:'en',cues:[{start:0,end:100,text:'Synthetic transcript.'}],referenceSegments:[{start:10,end:30,category:'sponsor',status:'provisional'}],reviewedNegativeIntervals:[],annotationCompleteness:'partial'};
const prediction={videoId:'synthetic',runId:'test',model:'synthetic',backend:'javascript',status:'ok',supportedCategories:['sponsor'],segments:[]};
test('union/intersection do not double-count overlapping spans',()=>{
 assert.deepEqual(union([{start:1,end:3},{start:2,end:5},{start:5,end:7}]),[{start:1,end:7}]);
 assert.equal(seconds(intersection([{start:0,end:5},{start:3,end:8}],[{start:2,end:4},{start:6,end:10}])),4);
});
test('one-to-one matching uses augmenting paths and category separation',()=>{
 const refs=[{start:0,end:10,category:'sponsor'},{start:10,end:20,category:'sponsor'}];
 const preds=[{start:0,end:20,category:'sponsor'},{start:0,end:10,category:'sponsor'},{start:0,end:10,category:'selfpromo'}];
 assert.equal(match(preds,refs,.5).length,2);
 assert.equal(match([preds[1],preds[1]],[refs[0]],.5).length,1);
});
test('unknown regions never become reviewed negatives; abstention has undefined precision',()=>{
 const r=evaluateVideo(fixture,{...prediction,segments:[{start:50,end:70,category:'sponsor',score:.99}]});
 assert.equal(r.falseSkipsPerHour,null); assert.equal(r.ordinaryRemovedSeconds,0);assert.equal(r.predictedUnknownSeconds,20);assert.equal(r.metrics[.5].precision,0);
 const a=evaluateVideo(fixture,{...prediction,status:'abstained'});
 assert.equal(a.metrics[.5].precision,null);assert.equal(a.metrics[.5].recall,0);
});
test('reviewed exposure and wholly erroneous versus partial skips',()=>{
 const f={...fixture,reviewedNegativeIntervals:[{start:40,end:100,status:'reviewed'}]};
 const r=evaluateVideo(f,{...prediction,segments:[{start:20,end:50,category:'sponsor'},{start:60,end:70,category:'sponsor'}]});
 assert.equal(r.ordinaryRemovedSeconds,20);assert.equal(r.confirmedFalseSkips,1);assert.equal(r.falseSkipsPerHour,60);assert.equal(r.missedReferenceSeconds,10);
});
test('boundaries, category gaps and failed runs remain explicit',()=>{
 const r=evaluateVideo(fixture,{...prediction,segments:[{start:12,end:29,category:'sponsor'}]});
 assert.equal(r.boundaries.start.biasSeconds,2);assert.equal(r.boundaries.end.biasSeconds,-1);
 assert.equal(evaluateVideo(fixture,prediction,'selfpromo').status,'unsupported_category');
 const fail=evaluateVideo(fixture,{...prediction,status:'inference_failure'});
 const s=summarize([r,fail]);assert.equal(s.attempted,2);assert.equal(s.scored,1);assert.equal(s.statusCounts.inference_failure,1);
});
test('malformed intervals and unsupported output are rejected',()=>{
 for(const span of [{start:-1,end:3},{start:3,end:3},{start:3,end:101},{start:NaN,end:4},{start:Infinity,end:4}])assert.throws(()=>validatePrediction({...prediction,segments:[{...span,category:'sponsor'}]},fixture));
 assert.throws(()=>validatePrediction({...prediction,segments:[{start:1,end:2,category:'selfpromo'}]},fixture));
 assert.throws(()=>validateFixture({...fixture,reviewedNegativeIntervals:[{start:40,end:50}]}));
 assert.throws(()=>validateFixture({...fixture,reviewedNegativeIntervals:[{start:20,end:40,status:'reviewed'}]}));
 assert.throws(()=>validateFixture({...fixture,annotationCompleteness:'complete'}));
});
test('manifest detects channel, duplicate and known campaign leakage',()=>{
 const a={videoId:'abcdefghijk',channelId:'a',split:'tune',campaignGroup:'campaign'};
 assert.throws(()=>validateManifest({schemaVersion:1,videos:[a,{...a,videoId:'abcdefghijl',split:'test'}]}));
 assert.throws(()=>validateManifest({schemaVersion:1,videos:[a,a]}));
 assert.throws(()=>validateManifest({schemaVersion:1,videos:[a,{...a,videoId:'abcdefghijl',channelId:'b',split:'test'}]}));
});
test('bootstrap is reproducible and unavailable for a single channel',()=>{
 const r=evaluateVideo(fixture,prediction);assert.equal(bootstrap([r]).available,false);
 const rows=[r,{...r,channelId:'b'}];assert.deepEqual(bootstrap(rows,20),bootstrap(rows,20));
 assert.equal(bootstrap(rows,20).intervals.ordinarySecondsPerHour.low,null);
});

test('complete review requires explicit reviewed coverage of every second',()=>{
 assert.throws(()=>validateFixture({...fixture,referenceSegments:[{...fixture.referenceSegments[0],status:'reviewed'}],annotationCompleteness:'complete',reviewVersion:'v1'}));
});

test('paired bootstrap resamples the same channels and exposes unavailable negative exposure',async()=>{
 const {pairedBootstrap}=await import('../bench/evaluate.mjs');
 const a=evaluateVideo(fixture,{...prediction,segments:[{start:10,end:30,category:'sponsor'}]});
 const rows=[a,{...a,videoId:'second',channelId:'b'}];const result=pairedBootstrap(rows,rows,20);
 assert.equal(result.intervals.precision.low,0);assert.equal(result.intervals.precision.high,0);
 assert.equal(result.intervals.ordinarySecondsPerHour.low,null);assert.equal(pairedBootstrap([a],[a]).available,false);
});

test('category mismatches are known annotated time, not unknown regions',()=>{
 const f={...fixture,referenceSegments:[{start:10,end:30,category:'selfpromo',status:'provisional'}]};
 const r=evaluateVideo(f,{...prediction,segments:[{start:10,end:30,category:'sponsor'}]});
 assert.equal(r.metrics[.5].matched,0);assert.equal(r.predictedUnknownSeconds,0);assert.equal(r.falseSkipsPerHour,null);
 assert.throws(()=>match([],[],0));
});
