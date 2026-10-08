import test from 'node:test';
import assert from 'node:assert/strict';
import {filterExplicitSelfSponsorship} from '../bench/adapters/ettin-self-sponsor.mjs';
const span={start:10,end:30,category:'sponsor',score:.75};
const cue=text=>({start:11,end:20,text});
const run=text=>filterExplicitSelfSponsorship([span],[cue(text)]);
test('affirmative first-person self-sponsorship is rejected with an auditable reason',()=>{
 for(const text of ["We're self-sponsored here. Support our fundraiser.","And we are self sponsored today.","I'm self-sponsored for this video.","We’re self-sponsored here."]){
  const r=run(text);assert.deepEqual(r.segments,[]);assert.equal(r.rejected.length,1);assert.equal(r.rejected[0].reason,'explicit_self_sponsorship');assert.deepEqual(r.rejected[0].segment,span);
 }
});
test('negation, third-person discussion, quoted speech and indirect support do not authorize rejection',()=>{
 for(const text of ["We are not self-sponsored.","We aren't self-sponsored.","The creator said they were self-sponsored.",'He said: "We are self-sponsored here."',"He said: “We're self-sponsored here.”",'Your support of membership helps fund our channel.','We made this design in a cloud CAD tool. Try it using our link.'])assert.deepEqual(run(text).segments,[span]);
});
test('explicit third-party sponsorship preserves mixed promotions conservatively',()=>{
 for(const text of ["We're self-sponsored here. This section is sponsored by an outside partner.","We're self-sponsored here. Brought to you by our software partner.","We're self-sponsored here. Our sponsor is Example."])assert.deepEqual(run(text).segments,[span]);
});
test('only complete cues inside each prediction may veto it',()=>{
 const cues=[{start:9,end:12,text:"We're self-sponsored here."},cue('An unrelated product demonstration.'),{start:29,end:31,text:"We're self-sponsored here."}];
 assert.deepEqual(filterExplicitSelfSponsorship([span],cues).segments,[span]);
 assert.deepEqual(filterExplicitSelfSponsorship([span],[{start:31,end:40,text:"We're self-sponsored here."}]).segments,[span]);
});
test('the filter covers split cues, treats predictions separately, and never mutates inputs',()=>{
 const other={...span,start:40,end:50};const segments=[span,other],cues=[cue("And we're"),{start:20,end:25,text:'self-sponsored here.'},{start:41,end:49,text:'This tool saves engineering time.'}];const before=JSON.stringify({segments,cues});
 const r=filterExplicitSelfSponsorship(segments,cues);assert.deepEqual(r.segments,[other]);assert.deepEqual(r.rejected.map(x=>x.segment),[span]);assert.equal(JSON.stringify({segments,cues}),before);
});
test('malformed intervals and non-text cues are rejected rather than silently filtered',()=>{
 assert.throws(()=>filterExplicitSelfSponsorship([{...span,end:NaN}],[]),/interval/i);
 assert.throws(()=>filterExplicitSelfSponsorship([span],[{start:11,end:20,text:null}]),/cue/i);
 assert.throws(()=>filterExplicitSelfSponsorship([span],[{start:20,end:11,text:'text'}]),/cue/i);
});
