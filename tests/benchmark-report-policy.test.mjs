// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import * as policy from '../bench/report-policy.mjs';
test('report distinguishes acquired captions, runtime smoke and scored holdout evidence',()=>{
 assert.match(policy.recommendation({available:0,selected:50,hasTestScores:false}),/0\/50/);
 assert.match(policy.recommendation({available:30,selected:50,hasTestScores:false}),/30\/50/);
 assert.ok(!policy.recommendation({available:30,selected:50,hasTestScores:false}).includes('captions unavailable'));
 assert.match(policy.recommendation({available:50,selected:50,hasTestScores:true}),/provisional/);
 assert.match(policy.recommendation({available:50,selected:50,hasTestScores:true}),/reviewed negatives/);
});
test('report binds quality to the fixture observed by each run',()=>{
 const video={videoId:'example',fixtureHash:'current'};
 assert.equal(policy.observedFixture({fixtureHashes:[['example',null]]},video),false);
 assert.equal(policy.observedFixture({fixtureHashes:[['example','current']]},video),true);
 assert.throws(()=>policy.observedFixture({fixtureHashes:[['example','old']]},video),/fixture identity/);
 assert.throws(()=>policy.observedFixture({fixtureHashes:[]},video),/fixture identity/);
});
test('provisional Pareto comparison excludes smoke, diagnostics and undefined quality',()=>{
 const run=(id,precision,recall,load,inference)=>({runId:id,metadata:{split:'test',status:'complete',selectionHash:'same',fixtureHashes:[['video','hash']],spec:{id}},summary:{sponsor:{scored:1,metrics:{.5:{precision,recall}}}},performance:{coldLoadMs:load,inferenceMedianMs:inference}});
 const a=run('a',.9,.7,100,100),b=run('b',.8,.6,200,200),c=run('c',1,.6,200,200),missing=run('undefined',null,0,1,1);
 assert.deepEqual(policy.qualityCostFrontier([a,b,c,missing,run('keyword',1,1,1,1),{...a,runId:'smoke',metadata:{...a.metadata,split:'smoke'}}]),['a','c']);
 assert.throws(()=>policy.qualityCostFrontier([a,{...b,metadata:{...b.metadata,selectionHash:'other'}}]),/common frozen/);
});
