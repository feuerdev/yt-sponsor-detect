// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import * as tuning from '../bench/tune-trial.mjs';
test('an invalid decoded operating point is retained and cannot abort other threshold trials',()=>{
 const f={videoId:'synthetic',channelId:'channel',durationSeconds:10,language:'en',cues:[{start:0,end:10,text:'Synthetic caption.'}],referenceSegments:[{start:2,end:4,category:'sponsor',status:'provisional'}],reviewedNegativeIntervals:[],annotationCompleteness:'partial'};
 const p={videoId:f.videoId,runId:'run',model:'model',backend:'wasm',supportedCategories:['sponsor'],status:'ok',segments:[]};
 const cached=[{f,p,raw:{kind:'nli-windows',windows:[{start:0,end:12,scores:{sponsor:.7,selfpromo:0}}]}}];
 const invalid=tuning.evaluateTrial(cached,{threshold:.5,mergeGapSeconds:0});
 assert.equal(invalid.status,'invalid_output');assert.equal(invalid.summary.scored,0);assert.equal(invalid.summary.statusCounts.invalid_output,1);assert.equal(invalid.failures[0].videoId,f.videoId);
 const valid=tuning.evaluateTrial(cached,{threshold:.9,mergeGapSeconds:0});assert.equal(valid.status,'valid');assert.equal(valid.summary.scored,1);assert.deepEqual(valid.failures,[]);
});
