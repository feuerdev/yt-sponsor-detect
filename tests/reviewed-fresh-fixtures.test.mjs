import test from'node:test';import assert from'node:assert/strict';
import{hash}from'../bench/lib.mjs';import{reviewedFreshFixtures}from'../bench/reviewed-fresh-fixtures.mjs';
const id='freshvid001',other='freshvid002',missing='freshvid003';
const fixture=videoId=>({videoId,channelId:videoId===id?'tune-channel':'test-channel',durationSeconds:10,language:'en',cues:[{start:0,end:5,text:'Ordinary introduction.'},{start:5,end:10,text:'A paid external sponsor supports this video.'}],referenceSegments:[{start:4,end:9,category:'sponsor',status:'provisional',source:'SponsorBlock'}],reviewedNegativeIntervals:[],annotationCompleteness:'partial',provenance:{rawHash:'a'.repeat(64),acquiredAt:'2026-10-08T00:00:00Z'}});
function input(){
 const bytes=new Map([id,other].map(id=>[id,JSON.stringify(fixture(id))+'\n']));
 const videos=[id,other,missing].map(videoId=>({videoId,channelId:videoId===id?'tune-channel':'test-channel',split:videoId===id?'tune':'test',captionAvailability:videoId===missing?'failure':'ok',fixtureHash:bytes.has(videoId)?hash(bytes.get(videoId)):undefined,fixturePath:bytes.has(videoId)?'/unchanged/'+videoId+'.json':undefined,crowdReferences:[{segment:[4,9],category:'sponsor'}]}));
 const manifest={schemaVersion:1,selectionHash:hash(videos.map(v=>({videoId:v.videoId,channelId:v.channelId,split:v.split}))),registeredPlanHash:'b'.repeat(64),testExposure:'none',videos};
 const policy={version:'paid-selfpromo-v1'},policyHash=hash(policy);
 const review={schemaVersion:1,status:'human-reviewed',candidatePredictionsVisible:false,referenceSetVersion:'human-review-v1',policyVersion:policy.version,policyHash,selectionHash:manifest.selectionHash,registeredPlanHash:manifest.registeredPlanHash,videos:videos.map(v=>({...v,originalFixtureHash:v.fixtureHash??null,reviewer:v.captionAvailability==='ok'?'Synthetic test-only reviewer':null,reviewerAttestation:v.captionAvailability==='ok',reviewedAt:v.captionAvailability==='ok'?'2026-10-08T01:00:00Z':null,annotationCompleteness:'complete',reviewedSegments:v.captionAvailability==='ok'?[{start:5,end:10,category:'sponsor'}]:[],reviewedNegativeIntervals:v.captionAvailability==='ok'?[{start:0,end:5}]:[],uncertainIntervals:[],campaignGroup:null}))};
 return {manifest,review,bytes,options:{policy,policyHash,at:'2026-10-08T02:00:00Z'}};
}
const run=i=>reviewedFreshFixtures(i.manifest,i.review,i.bytes,i.options);
test('human references form a new common version while original captions, crowd labels and fixture bytes remain intact',()=>{
 const i=input(),before=JSON.stringify(i.manifest),original=new Map(i.bytes),r=run(i),f=r.fixtures.get(id);
 assert.equal(f.referenceSegments[0].start,5);assert.equal(f.referenceSegments[0].status,'reviewed');assert.equal(f.reviewVersion,'human-review-v1');assert.deepEqual(f.reviewedNegativeIntervals,[{start:0,end:5,status:'reviewed'}]);assert.equal(f.provenance.priorFixtureHash,hash(original.get(id)));assert.deepEqual(f.provenance.provisionalReferenceSegments,fixture(id).referenceSegments);assert.deepEqual(f.cues,fixture(id).cues);assert.equal(r.manifest.referenceSetVersion,'human-review-v1');assert.equal(r.manifest.videos[2].captionAvailability,'failure');assert.equal(JSON.stringify(i.manifest),before);assert.deepEqual(i.bytes,original);
});
test('pending or prediction-exposed reviews cannot become blind human ground truth',()=>{
 for(const edit of[{status:'pending-human-review'},{candidatePredictionsVisible:true},{candidatePredictionsVisible:undefined},{referenceSetVersion:''},{policyHash:'wrong'},{policyVersion:'other'},{selectionHash:'wrong'},{registeredPlanHash:'wrong'}]){const i=input();Object.assign(i.review,edit);assert.throws(()=>run(i),/review|policy|selection|registration|blind/i);}
});
test('all acquired selected sources require the exact original fixture, reviewer identity, attestation and valid review time',()=>{
 for(const edit of[{originalFixtureHash:'wrong'},{reviewer:null},{reviewer:' '},{reviewerAttestation:false},{reviewedAt:'invalid'},{reviewedAt:'2026-10-09T01:00:00Z'},{channelId:'wrong'},{split:'test'}]){const i=input();Object.assign(i.review.videos[0],edit);assert.throws(()=>run(i),/source|fixture|review|identity|split/i);}
 const i=input();i.bytes.set(id,JSON.stringify({...fixture(id),durationSeconds:11}));assert.throws(()=>run(i),/fixture|source/i);
});
test('missing, duplicate and added IDs cannot alter the selected evaluation population',()=>{
 for(const mode of['missing','duplicate','extra']){const i=input();if(mode==='missing')i.review.videos.pop();if(mode==='duplicate')i.review.videos.push(i.review.videos[0]);if(mode==='extra')i.review.videos[2]={...i.review.videos[2],videoId:'notchosen01'};assert.throws(()=>run(i),/population|selected|duplicate|identity/i);}
});
test('test exposure stops fresh reference import even when the manifest still says none',()=>{
 const i=input();i.options.exposureLedger={firstTestAt:'2026-10-08T01:30:00Z'};assert.throws(()=>run(i),/exposed|exposure/i);const j=input();j.manifest.testExposure='2026-10-08T01:30:00Z';assert.throws(()=>run(j),/exposed|exposure/i);
});
test('human ordinary intervals cannot overlap known or uncertain promotion and complete coverage cannot have gaps',()=>{
 for(const mode of['positive-overlap','uncertain-overlap','gap','invalid-bound']){const i=input(),r=i.review.videos[0];if(mode==='positive-overlap')r.reviewedNegativeIntervals[0].end=6;if(mode==='uncertain-overlap'){r.annotationCompleteness='partial';r.reviewedSegments=[];r.uncertainIntervals=[{start:3,end:5,category:'sponsor'}];}if(mode==='gap')r.reviewedNegativeIntervals[0].end=4;if(mode==='invalid-bound')r.reviewedSegments[0].end=11;assert.throws(()=>run(i),/conflict|coverage|reference|negative|interval/i);}
});
test('uncertain labels stay uncertain, unreviewed time stays unknown and partial review never invents negatives',()=>{
 const i=input(),r=i.review.videos[0];r.annotationCompleteness='partial';r.reviewedSegments=[];r.reviewedNegativeIntervals=[];r.uncertainIntervals=[{start:5,end:8,category:'sponsor',notes:'Compensation unclear.'}];const f=run(i).fixtures.get(id);assert.equal(f.referenceSegments[0].status,'uncertain');assert.equal(f.referenceSegments[0].end,8);assert.deepEqual(f.reviewedNegativeIntervals,[]);assert.equal(f.annotationCompleteness,'partial');assert.equal(f.provenance.review.campaignGroup,null);
});
test('reviewed campaign identities cannot silently cross channel splits',()=>{
 const i=input();i.review.videos[0].campaignGroup='same-campaign';i.review.videos[1].campaignGroup='same-campaign';assert.throws(()=>run(i),/campaign leakage/i);
});

function llmInput(){const i=input();i.options.reviewerKind='llm';i.review.status='llm-reviewed';i.review.reviewMethod='transcript-only';i.review.referenceSetVersion='assistant-transcript-v1';i.review.crowdReferencesVisible=true;for(const r of i.review.videos){r.llmReviewerAttestation=r.reviewerAttestation;r.reviewerAttestation=false;r.reviewMethod='transcript-only';}return i;}
test('explicit LLM transcript review imports separately without becoming a human watch attestation',()=>{
 const i=llmInput(),before=JSON.stringify(i.manifest),r=run(i),f=r.fixtures.get(id);
 assert.equal(f.referenceSegments[0].source,'LLM transcript review');assert.equal(f.provenance.review.reviewerKind,'llm');assert.equal(f.provenance.review.reviewerAttestation,false);assert.equal(f.provenance.review.llmReviewerAttestation,true);assert.equal(f.provenance.review.reviewMethod,'transcript-only');assert.equal(f.provenance.review.crowdReferencesVisible,true);assert.match(f.provenance.evaluationScope,/LLM|transcript/);assert.equal(r.manifest.videos[0].referenceStatus,'llm-reviewed');assert.equal(r.manifest.referenceReviewerKind,'llm');assert.equal(JSON.stringify(i.manifest),before);
});
test('LLM reviews require explicit route and transcript attestation and cannot impersonate human review',()=>{
 for(const mode of['default-route','human-claim','missing-attestation','wrong-method','invalid-kind']){const i=llmInput();if(mode==='default-route')delete i.options.reviewerKind;if(mode==='human-claim')i.review.videos[0].reviewerAttestation=true;if(mode==='missing-attestation')i.review.videos[0].llmReviewerAttestation=false;if(mode==='wrong-method')i.review.reviewMethod='watched-video';if(mode==='invalid-kind')i.options.reviewerKind='unknown';assert.throws(()=>run(i),/review|kind|attestation|transcript/i);}
});
test('LLM review retains exposure, missing source and ordinary interval conflict checks',()=>{
 const a=llmInput();a.options.exposureLedger={firstTestAt:'2026-10-08T01:30:00Z'};assert.throws(()=>run(a),/exposure/);
 const b=llmInput();b.review.videos[2].llmReviewerAttestation=true;assert.throws(()=>run(b),/unavailable/i);
 const c=llmInput();c.review.videos[0].reviewedNegativeIntervals[0].end=6;assert.throws(()=>run(c),/conflict/);
});
