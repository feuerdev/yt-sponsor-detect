import test from 'node:test';import assert from 'node:assert/strict';
import {hash} from '../bench/lib.mjs';
import {freshCaptionFixture} from '../bench/fresh-validation-captions.mjs';
const video={videoId:'freshvid001',channelId:'new-channel',split:'test',crowdReferences:[{segment:[2,4],category:'sponsor',votes:3}],referenceSnapshotAt:'2026-10-08T00:00:00Z'};
const registrationRaw=JSON.stringify({schemaVersion:1,channels:[{channelId:video.channelId,split:'test'}]});
const manifest={schemaVersion:1,videos:[video],registeredPlanHash:hash(registrationRaw),selectionHash:hash(JSON.stringify([{videoId:video.videoId,channelId:video.channelId,split:video.split}])),frozenAt:'2026-10-08T00:00:00Z',testExposure:'none',originalPilotSelectionHash:hash('prior-selection')};
const scope={registrationRaw,manifest,priorManifest:{schemaVersion:1,selectionHash:hash('prior-selection'),videos:[{videoId:'oldvideo001',channelId:'old-channel',split:'test'}]},knownExcludedIds:['canaryvid01']};
const source={schemaVersion:1,source:'YouTube public transcript panel',videoId:video.videoId,channelId:video.channelId,complete:true,language:'en',captionType:'unknown',acquiredAt:'2026-10-08T00:01:00Z',durationSeconds:10,panel:{schemaVersion:1,videoId:video.videoId,durationSeconds:10,timing:'whole-second-starts',rows:[{start:0,text:'This is an English transcript for this testing example.'},{start:5,text:'This is the remainder of the complete transcript.'}]},languageVerification:{isReliable:true,languages:[{language:'en',percentage:100}]}};
const run=(s=source,v=video,sc=scope)=>freshCaptionFixture(JSON.stringify(s),v,sc);
test('a registered unexposed fresh test caption retains actual split and unknown type without inventing negatives',()=>{
 const f=run();assert.equal(f.provenance.evaluationSplit,'test');assert.equal(f.provenance.captionType,'unknown');assert.deepEqual(f.reviewedNegativeIntervals,[]);assert.equal(f.referenceSegments[0].status,'provisional');assert.equal(f.provenance.registeredSelectionHash,manifest.selectionHash);
});
test('altered registration, selection and already exposed holdouts cannot acquire new fixtures',()=>{
 for(const m of [{...manifest,registeredPlanHash:'wrong'},{...manifest,selectionHash:'wrong'},{...manifest,testExposure:'2026-10-08T01:00:00Z'},{...manifest,originalPilotSelectionHash:'wrong'}])assert.throws(()=>run(source,video,{...scope,manifest:m}),/registration|selection|exposed/i);
});
test('prior channels, prior videos and known published canaries are excluded before conversion',()=>{
 for(const prior of [{videoId:'oldvideo001',channelId:video.channelId,split:'tune'},{videoId:video.videoId,channelId:'another-channel',split:'test'}])assert.throws(()=>run(source,video,{...scope,priorManifest:{schemaVersion:1,selectionHash:hash('prior-selection'),videos:[prior]}}),/previous|exposed/i);
 assert.throws(()=>run(source,video,{...scope,knownExcludedIds:[video.videoId]}),/excluded/i);
});
test('registration channel split and exact selected identity are required',()=>{
 assert.throws(()=>run(source,{...video,split:'tune'}),/selection|identity|split/i);
 assert.throws(()=>run(source,{...video,videoId:'othernew001'}),/selection|identity/i);
 const reg=JSON.stringify({schemaVersion:1,channels:[{channelId:video.channelId,split:'tune'}]});
 assert.throws(()=>run(source,video,{...scope,registrationRaw:reg,manifest:{...manifest,registeredPlanHash:hash(reg)}}),/split/i);
});
test('conflicting crowd categories are both disputed before inference',()=>{
 const v={...video,crowdReferences:[...video.crowdReferences,{segment:[3,5],category:'selfpromo'}]};
 assert.deepEqual(run(source,v,{...scope,manifest:{...manifest,videos:[v]}}).referenceSegments.map(r=>r.status),['disputed','disputed']);
});
test('language, source identity, duration and reference bounds remain fail-closed',()=>{
 for(const s of [{...source,videoId:'othernew001'},{...source,durationSeconds:20},{...source,captionType:'guessed'},{...source,languageVerification:{isReliable:false,languages:[{language:'en',percentage:100}]}}])assert.throws(()=>run(s),/identity|duration|provenance|unsupported_language/i);
 const v={...video,crowdReferences:[{segment:[2,20],category:'sponsor'}]};assert.throws(()=>run(source,v,{...scope,manifest:{...manifest,videos:[v]}}),/reference/i);
});
