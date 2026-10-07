import test from 'node:test';import assert from 'node:assert/strict';
import {channelFolds,selectOperatingPoint,promotionGate} from '../bench/overlap-validation.mjs';
const item=(id,channel,split='tune')=>({split,f:{videoId:id,channelId:channel}});
const trial=(id,recall,precision=.95,unknown=0)=>({id,family:id==='baseline'?'flow-window-union':'context-logit-consensus',config:{threshold:.8},status:'valid',summary:{metrics:{.5:{matched:1,precision,recall}},coverageRecall:recall,predictedUnknownSeconds:unknown}});
test('each channel is evaluated only after selecting from the other channels',()=>{
 const items=[item('a','one'),item('b','one'),item('c','two'),item('d','three')],folds=channelFolds(items);
 assert.equal(folds.length,3);
 assert.equal(folds.flatMap(f=>f.validation).length,items.length);
 for(const f of folds){assert.ok(f.training.every(x=>x.f.channelId!==f.channelId));assert.ok(f.validation.every(x=>x.f.channelId===f.channelId));}
});
test('exposed test data and duplicate video identities are rejected',()=>{
 assert.throws(()=>channelFolds([item('a','one','test')]),/tune/i);
 assert.throws(()=>channelFolds([item('a','one'),item('a','two')]),/duplicate/i);
});
test('a high recall point below conservative agreement precision cannot win',()=>{
 const baseline=trial('baseline',.5),highRecall=trial('bad',1,.5),better=trial('better',.8,.96);
 assert.equal(selectOperatingPoint([baseline,highRecall,better],'baseline').point.id,'better');
});
test('invalid output and absence of positive evidence fall back to baseline',()=>{
 const baseline=trial('baseline',null,null);baseline.summary.metrics[.5].matched=0;
 const invalid={...trial('bad',1,1),status:'invalid_output'};
 assert.equal(selectOperatingPoint([baseline,invalid],'baseline').reason,'no_conservative_point');
 assert.equal(selectOperatingPoint([baseline,invalid],'baseline').point.id,'baseline');
});
test('small single-positive-channel data cannot authorize changing the algorithm',()=>{
 const result=promotionGate({positiveChannels:1,referenceSegments:4,baseline:{precision:1,recall:1,coverageRecall:.8,unknownSeconds:40},candidate:{precision:1,recall:1,coverageRecall:.9,unknownSeconds:20}});
 assert.equal(result.eligible,false);assert.ok(result.reasons.includes('too_few_positive_channels'));assert.ok(result.reasons.includes('too_few_references'));
});
test('a recall regression or extra unknown removal cannot be hidden by better boundary coverage',()=>{
 const result=promotionGate({positiveChannels:4,referenceSegments:20,baseline:{precision:1,recall:1,coverageRecall:.8,unknownSeconds:40},candidate:{precision:1,recall:.9,coverageRecall:.99,unknownSeconds:45}});
 assert.equal(result.eligible,false);assert.ok(result.reasons.includes('recall_regression'));assert.ok(result.reasons.includes('more_unknown_prediction_seconds'));
});
test('missing sample counts cannot authorize promotion even with apparently strong metrics',()=>{
 const result=promotionGate({baseline:{precision:1,recall:.8,coverageRecall:.8,unknownSeconds:40},candidate:{precision:1,recall:.9,coverageRecall:.9,unknownSeconds:20}});
 assert.equal(result.eligible,false);assert.ok(result.reasons.includes('invalid_sample_counts'));
});
