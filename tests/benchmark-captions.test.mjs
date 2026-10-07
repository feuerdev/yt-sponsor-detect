// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as captions from '../bench/caption-import.mjs';
const video={videoId:'testvideo01',channelId:'channel-a',split:'tune',durationSeconds:20,crowdReferences:[{segment:[2,4],category:'sponsor',UUID:'reference'}],referenceSnapshotAt:'2026-10-07',captionAvailability:'failure'};
const snapshot={schemaVersion:1,source:'YouTube public transcript panel',videoId:video.videoId,channelId:video.channelId,durationSeconds:20,language:'en',captionType:'automatic',acquiredAt:'2026-10-07T00:00:00Z',complete:true,segments:[{transcriptSegmentViewModel:{timestamp:'0:00',simpleText:'Synthetic first cue.'}},{transcriptSegmentViewModel:{timestamp:'0:10',simpleText:'Synthetic final cue.'}}]};
test('public transcript import preserves source bytes, provisional references and explicit coarse cue boundaries',()=>{
 const raw=Buffer.from(JSON.stringify(snapshot));const fixture=captions.captionFixture(raw,video);
 assert.deepEqual(fixture.cues,[{start:0,end:10,text:'Synthetic first cue.'},{start:10,end:20,text:'Synthetic final cue.'}]);
 assert.equal(fixture.provenance.timingResolutionSeconds,1);assert.match(fixture.provenance.endBoundaryMethod,/next cue/);
 assert.deepEqual(fixture.reviewedNegativeIntervals,[]);assert.equal(fixture.referenceSegments[0].status,'provisional');
 assert.equal(fixture.provenance.rawHash.length,64);
});
test('caption imports reject wrong identity, incomplete tracks and non-monotone cue timestamps',()=>{
 for(const change of [{videoId:'different'},{channelId:'different'},{complete:false},{language:'de'},{segments:[snapshot.segments[1],snapshot.segments[0]]}])assert.throws(()=>captions.captionFixture(Buffer.from(JSON.stringify({...snapshot,...change})),video));
});
test('imports retain failed attempts and never overwrite a successful frozen fixture',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caption-import-'));
 try {
  const manifest={videos:[{...video}],attemptLedger:[{videoId:video.videoId,status:'failure'}]};
  await captions.importSnapshot({manifest,videoId:video.videoId,raw:Buffer.from(JSON.stringify(snapshot)),baseDirectory:dir});
  assert.equal(manifest.attemptLedger[0].status,'failure');assert.equal(manifest.attemptLedger[1].status,'ok');
  const bytes=await readFile(path.join(dir,manifest.videos[0].fixturePath));
  await assert.rejects(captions.importSnapshot({manifest,videoId:video.videoId,raw:Buffer.from(JSON.stringify({...snapshot,acquiredAt:'later'})),baseDirectory:dir}));
  assert.deepEqual(await readFile(path.join(dir,manifest.videos[0].fixturePath)),bytes);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('panel extraction rejects continuations and binds transcript to the public player identity',async()=>{
 const {panelSnapshot}=await import('../bench/caption-ui.mjs');
 const player={videoDetails:{videoId:video.videoId,channelId:video.channelId,lengthSeconds:'20'},captions:{playerCaptionsTracklistRenderer:{captionTracks:[{languageCode:'en',kind:'asr'}]}}};
 const panel={sectionListRenderer:{contents:snapshot.segments}};
 const got=panelSnapshot(panel,player,video);
 assert.equal(got.complete,true);assert.equal(got.segments.length,2);
 assert.throws(()=>panelSnapshot({...panel,continuationItemRenderer:{}},player,video));
 assert.throws(()=>panelSnapshot(panel,{...player,videoDetails:{...player.videoDetails,videoId:'wrong'}},video));
});
test('a failed second write rolls back only the importer-owned raw file',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'caption-import-failure-'));
 try {
  const fixture=path.join(dir,'bench/local/fixtures',video.videoId+'.json');await mkdir(path.dirname(fixture),{recursive:true});await writeFile(fixture,'existing');
  const manifest={videos:[{...video}],attemptLedger:[]};
  await assert.rejects(captions.importSnapshot({manifest,videoId:video.videoId,raw:Buffer.from(JSON.stringify(snapshot)),baseDirectory:dir}),{code:'EEXIST'});
  assert.equal(await readFile(fixture,'utf8'),'existing');
  await assert.rejects(readFile(path.join(dir,'bench/local/raw',video.videoId+'.public-ui.json')),{code:'ENOENT'});
  assert.equal(manifest.videos[0].captionAvailability,'failure');assert.deepEqual(manifest.attemptLedger,[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('modern populated panel identifies its selected English track among manual and ASR alternatives',async()=>{
 const {panelSnapshot}=await import('../bench/caption-ui.mjs');
 const player={videoDetails:{videoId:video.videoId,channelId:video.channelId,lengthSeconds:'20'},captions:{playerCaptionsTracklistRenderer:{captionTracks:[{languageCode:'en',vssId:'.en'},{languageCode:'en',vssId:'a.en',kind:'asr'},{languageCode:'ja',vssId:'.ja'}]}}};
 const token=Buffer.from([0x32,3,...Buffer.from('.en')]).toString('base64');
 const got=panelSnapshot([{content:{}},{contents:snapshot.segments,search:{continuationCommand:{token}}}],player,video);
 assert.equal(got.captionType,'manual');assert.equal(got.language,'en');assert.equal(got.segments.length,2);
 assert.throws(()=>panelSnapshot({contents:snapshot.segments},player,video));
});
test('unrelated lazy panels do not make the populated transcript incomplete',async()=>{
 const {panelSnapshot}=await import('../bench/caption-ui.mjs');
 const player={videoDetails:{videoId:video.videoId,channelId:video.channelId,lengthSeconds:'20'},captions:{playerCaptionsTracklistRenderer:{captionTracks:[{languageCode:'en',kind:'asr'}]}}};
 assert.equal(panelSnapshot([{comments:{continuationItemRenderer:{}}},{contents:snapshot.segments}],player,video).segments.length,2);
});
