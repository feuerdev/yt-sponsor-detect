// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile,stat,rm} from 'node:fs/promises';
import path from 'node:path';
import {prepareViewerFixture,convertViewerDataset,VIEWER_INPUT_VERSION,main} from '../bench/viewer-dataset.mjs';
import {parseJson3,TRANSCRIPT_VERSION} from '../src/viewer/transcript.js';
import {EttinAdapter} from '../src/viewer/ettin.js';
import {normalizeTimed} from '../bench/adapters/ettin-text.mjs';
import {hash,root,readJson} from '../bench/lib.mjs';
const fixture={videoId:'abcdefghijk',channelId:'channel',durationSeconds:12,language:'en',
    cues:[{start:1,end:10,text:'Long sponsor'}],referenceSegments:[{start:1,end:10,category:'sponsor',status:'reviewed'}],
    reviewedNegativeIntervals:[{start:0,end:1,status:'reviewed'},{start:10,end:12,status:'reviewed'}],
    annotationCompleteness:'complete',reviewVersion:'review-v1',provenance:{method:'reviewed fixture'}};
const events=[{tStartMs:1000,dDurationMs:9000,segs:[{utf8:'Long',tOffsetMs:0},{utf8:' sponsor',tOffsetMs:8000}]}];
const manifest={schemaVersion:1,selectionHash:'unchanged-selection',reviewExposureLedgerPath:'bench/local/exposure.json',
    videos:[{videoId:fixture.videoId,channelId:fixture.channelId,split:'tune',campaignGroup:'campaign',captionAvailability:'ok',fixturePath:'original.json',fixtureHash:'original-hash'},
        {videoId:'lmnopqrstuv',channelId:'other',split:'test',captionAvailability:'missing_captions',acquisitionFailure:'no captions'}]};

test('JSON3 benchmark input matches the actual viewer worker message and timing normalization',async()=>{
    const input={...fixture,viewerCaptionEvents:events},converted=prepareViewerFixture(input);
    const transcript={videoId:fixture.videoId,duration:fixture.durationSeconds,...parseJson3(events,fixture.durationSeconds)};
    let posted;
    const adapter=new EttinAdapter({createWorker:()=>({postMessage:message=>{posted=message;},terminate(){}})});
    const pending=adapter.detect(transcript,{jobId:'input-check',cancelled(){},onProgress(){}});
    try {
        const workerFixture={cues:posted.captions.map(c=>({text:c.text,start:c.start,end:c.start+c.duration}))};
        assert.deepEqual(converted.cues,workerFixture.cues);
        assert.deepEqual(normalizeTimed(converted),normalizeTimed(workerFixture));
        assert.notDeepEqual(normalizeTimed(converted).timing,normalizeTimed(fixture).timing);
        assert.equal(converted.cues[1].start,9);assert.equal(converted.viewerInput.timing,'word');
        assert.equal(converted.viewerInput.transcriptVersion,TRANSCRIPT_VERSION);
        assert.equal(converted.viewerCaptionEvents,undefined);
    }finally{adapter.cancel('input-check');await assert.rejects(pending,error=>error.code==='cancelled');}
});

test('cue-only input is explicitly estimated and preserves all reviewed labels and exposure',()=>{
    const before=structuredClone(fixture),converted=prepareViewerFixture(fixture);
    assert.equal(converted.viewerInput.source,'estimated_from_cues');assert.equal(converted.viewerInput.timing,'estimated');
    assert.equal(converted.viewerInput.version,VIEWER_INPUT_VERSION);
    assert.deepEqual(converted.cues.map(c=>[c.text,c.start,c.end]),[['Long',1,5.5],['sponsor',5.5,10]]);
    for(const key of ['videoId','channelId','referenceSegments','reviewedNegativeIntervals','annotationCompleteness','reviewVersion','provenance'])assert.deepEqual(converted[key],fixture[key]);
    assert.deepEqual(fixture,before);assert.throws(()=>prepareViewerFixture(converted),/Already/);
});

test('malformed JSON3 cannot silently fall back to apparently valid cue timings',()=>{
    for(const viewerCaptionEvents of [null,[],[{tStartMs:1000,dDurationMs:9000,segs:[{utf8:'word',tOffsetMs:-2}]}]])assert.throws(()=>prepareViewerFixture({...fixture,viewerCaptionEvents}));
});

test('new fixture hashes bind the viewer snapshot while split, campaign and test ledger stay unchanged',async()=>{
    const before=structuredClone(manifest),stored=new Map();
    const converted=await convertViewerDataset(manifest,{loadFixture:async()=>fixture,storeFixture:async(id,bytes)=>{stored.set(id,bytes);return 'bench/local/new/'+id+'.json';}});
    assert.deepEqual(manifest,before);assert.equal(converted.selectionHash,manifest.selectionHash);
    assert.equal(converted.reviewExposureLedgerPath,manifest.reviewExposureLedgerPath);
    assert.equal(converted.videos[0].fixtureHash,hash(stored.get(fixture.videoId)));
    assert.notEqual(converted.videos[0].fixtureHash,manifest.videos[0].fixtureHash);
    assert.equal(converted.videos[0].split,'tune');assert.equal(converted.videos[0].campaignGroup,'campaign');
    assert.deepEqual(converted.videos[1],manifest.videos[1]);assert.deepEqual(converted.viewerInput.timings,{word:0,estimated:1});
    assert.equal(JSON.parse(stored.get(fixture.videoId)).viewerInput.sourceFixtureHash,'original-hash');
    await assert.rejects(convertViewerDataset(converted,{loadFixture:async()=>fixture,storeFixture(){}}),/Already/);
});

test('snapshot preparation rejects cross-video captions before writing any fixture',async()=>{
    let written=false;
    await assert.rejects(convertViewerDataset(manifest,{loadFixture:async()=>({...fixture,videoId:'wrong-video'}),storeFixture(){written=true;}}),/identity mismatch/);
    assert.equal(written,false);
});

test('CLI snapshot checks actual source hashes, refuses overwrites and cleans only failed new output',async()=>{
    const local=path.join(root,'bench/local');await mkdir(local,{recursive:true});
    const temporary=await mkdtemp(path.join(local,'viewer-input-check-'));
    const source=await readJson('bench/datasets/synthetic.json');
    const manifestPath=path.join(temporary,'source.json'),output=path.join(temporary,'snapshot');
    const protectedFiles=['bench/models.json','bench/frozen-config.json','bench/datasets/synthetic.json'];
    const before=await Promise.all(protectedFiles.map(async file=>hash(await readFile(path.join(root,file)))));
    try {
        await writeFile(manifestPath,JSON.stringify(source));
        await main({manifest:manifestPath,output});
        const converted=JSON.parse(await readFile(path.join(output,'dataset.json'),'utf8'));
        const bytes=await readFile(path.join(root,converted.videos[0].fixturePath));
        assert.equal(converted.videos[0].fixtureHash,hash(bytes));
        assert.equal(converted.viewerInput.timings.estimated,1);
        await assert.rejects(main({manifest:manifestPath,output}),error=>error.code==='EEXIST');
        const bad=structuredClone(source);bad.videos[0].fixtureHash='wrong';
        await writeFile(manifestPath,JSON.stringify(bad));
        const failed=path.join(temporary,'failed');
        await assert.rejects(main({manifest:manifestPath,output:failed}),/Frozen fixture hash mismatch/);
        await assert.rejects(stat(failed),error=>error.code==='ENOENT');
        assert.equal((await stat(path.join(output,'dataset.json'))).isFile(),true);
        await assert.rejects(main({manifest:manifestPath,output:'bench/fixtures/outside'}),/under bench\/local/);
        const after=await Promise.all(protectedFiles.map(async file=>hash(await readFile(path.join(root,file)))));
        assert.deepEqual(after,before);
    } finally {await rm(temporary,{recursive:true,force:true});}
});
