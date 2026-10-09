import test from 'node:test';import assert from 'node:assert/strict';
const {developmentCaptionFixture}=await import('../bench/development-captions.mjs').catch(()=>({developmentCaptionFixture:()=>null}));
const video=()=>({videoId:'abcdefghijk',channelId:'channel-one',split:'tune',durationSeconds:20,referenceSource:'SponsorBlock',referenceSnapshotAt:'2026-10-01T00:00:00Z',crowdReferences:[{segment:[12,18],category:'sponsor',votes:2}]});
const source=()=>({schemaVersion:1,source:'YouTube public transcript panel',videoId:'abcdefghijk',channelId:'channel-one',complete:true,language:'en',captionType:'unknown',captionTrackId:null,acquiredAt:'2026-10-08T12:00:00Z',languageVerification:{isReliable:true,languages:[{language:'en',percentage:100}]},browser:'Synthetic test metadata',panel:{videoId:'abcdefghijk',durationSeconds:20,rows:[{start:0,text:'An ordinary opening sentence.'},{start:10,text:'This final sentence is an example.'}]}});
const convert=(s=source(),v=video())=>developmentCaptionFixture(JSON.stringify(s),v);
test('verified English development captions retain unknown track type and partial annotation status',()=>{
 const fixture=convert();assert.ok(fixture,'development converter is missing');assert.equal(fixture.provenance.captionType,'unknown');assert.equal(fixture.provenance.captionTrackId,null);assert.equal(fixture.annotationCompleteness,'partial');assert.deepEqual(fixture.reviewedNegativeIntervals,[]);assert.equal(fixture.referenceSegments[0].status,'provisional');assert.equal(fixture.cues.at(-1).end,20);assert.match(fixture.provenance.rawHash,/^[a-f0-9]{64}$/);
});
test('development conversion rejects test split and does not mutate the source or references',()=>{
 const s=source(),v=video(),before=JSON.stringify({s,v});assert.throws(()=>convert(s,{...v,split:'test'}),/tune/);convert(s,v);assert.equal(JSON.stringify({s,v}),before);
});
test('video, channel, duration and completeness inconsistencies cannot become a fixture',()=>{
 for(const s of [{...source(),videoId:'other-video'},{...source(),channelId:'other-channel'},{...source(),complete:false},{...source(),panel:{...source().panel,durationSeconds:200}}])assert.throws(()=>convert(s),/source|duration|complete/i);
});
test('unknown caption type does not waive reliable English verification',()=>{
 for(const lang of [{isReliable:false,languages:[{language:'en',percentage:100}]},{isReliable:true,languages:[{language:'de',percentage:100}]}])assert.throws(()=>convert({...source(),languageVerification:lang}),/unsupported_language/);
});
test('paid and self-promotion reference conflicts remain disputed before any inference',()=>{
 const v=video();v.crowdReferences.push({segment:[10,15],category:'selfpromo',votes:1},{segment:[1,5],category:'sponsor',votes:1});const fixture=convert(source(),v);assert.ok(fixture,'development converter is missing');assert.deepEqual(fixture.referenceSegments.map(r=>r.status),['disputed','disputed','provisional']);assert.match(fixture.provenance.referenceAdjudication,/before inference/);
});
test('unknown source type is explicit and invalid type or missing acquisition time is rejected',()=>{
 for(const s of [{...source(),captionType:'guessed'},{...source(),acquiredAt:'unknown'}])assert.throws(()=>convert(s),/provenance/);
});
