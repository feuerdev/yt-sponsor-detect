// SPDX-License-Identifier: GPL-3.0-or-later
// Prepares local evaluation data; never loads models or changes reference labels.
import {mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {args,root,readJson,hash,fixtureFor} from './lib.mjs';
import {validateFixture,validateManifest} from './contracts.mjs';
import {parseJson3,validateTranscript,TRANSCRIPT_VERSION} from '../src/viewer/transcript.js';
import {wordCaptions} from '../src/viewer/ettin.js';
export const VIEWER_INPUT_VERSION='viewer-word-cues-v1';

export function prepareViewerFixture(f,{sourceFixtureHash=hash(f)}={}) {
    validateFixture(f);
    if(f.viewerInput!==undefined)throw Error('Already contains viewer word input');
    const hasEvents=Object.hasOwn(f,'viewerCaptionEvents');
    // Old cue-only fixtures cannot recover ASR offsets. Apply the actual creator
    // caption interpolation, and retain its estimated timing provenance.
    const events=hasEvents?f.viewerCaptionEvents:f.cues.map(cue=>({
        tStartMs:cue.start*1000,dDurationMs:(cue.end-cue.start)*1000,segs:[{utf8:cue.text}]
    }));
    const transcript={videoId:f.videoId,duration:f.durationSeconds,...parseJson3(events,f.durationSeconds)};
    if(!validateTranscript(transcript,f.videoId))throw Error('Invalid viewer transcript');
    const viewerInput={version:VIEWER_INPUT_VERSION,transcriptVersion:TRANSCRIPT_VERSION,
        source:hasEvents?'json3':'estimated_from_cues',timing:transcript.timing,
        sourceFixtureHash,wordCount:transcript.words.length};
    const {viewerCaptionEvents,...rest}=f;
    // Match the production worker's end=start+duration arithmetic exactly.
    const cues=wordCaptions(transcript).map(caption=>({text:caption.text,start:caption.start,end:caption.start+caption.duration}));
    return validateFixture({...rest,cues,viewerInput});
}

export async function convertViewerDataset(manifest,{loadFixture,storeFixture}) {
    validateManifest(manifest);
    if(manifest.viewerInput!==undefined)throw Error('Already contains viewer word input');
    const videos=[],timings={word:0,estimated:0};
    for(const video of manifest.videos) {
        if(video.captionAvailability!=='ok'){videos.push({...video});continue;}
        const fixture=await loadFixture(video);
        if(fixture.videoId!==video.videoId||fixture.channelId!==video.channelId)throw Error('Fixture video/channel identity mismatch');
        const converted=prepareViewerFixture(fixture,{sourceFixtureHash:video.fixtureHash});
        const bytes=JSON.stringify(converted,null,2)+'\n';
        const fixturePath=await storeFixture(video.videoId,bytes);
        videos.push({...video,fixturePath,fixtureHash:hash(bytes)});
        timings[converted.viewerInput.timing]++;
    }
    return validateManifest({...manifest,videos,viewerInput:{version:VIEWER_INPUT_VERSION,
        transcriptVersion:TRANSCRIPT_VERSION,sourceManifestHash:hash(manifest),timings}});
}

export async function main(options=args()) {
    if(typeof options.manifest!=='string')throw Error('Pass --manifest with the original caption dataset');
    const output=options.output||'bench/local/viewer-input-'+new Date().toISOString().replace(/[:.]/g,'-');
    if(typeof output!=='string')throw Error('Invalid output directory');
    const local=path.join(root,'bench/local'),directory=path.resolve(root,output);
    if(!directory.startsWith(local+path.sep)||directory===path.resolve(root,options.manifest))throw Error('Output must be a new directory under bench/local');
    const manifest=await readJson(options.manifest);
    validateManifest(manifest);
    await mkdir(path.dirname(directory),{recursive:true});
    // Refuse existing output instead of overwriting an earlier frozen snapshot.
    await mkdir(directory,{recursive:false});
    let complete=false;
    try {
        const converted=await convertViewerDataset(manifest,{loadFixture:fixtureFor,storeFixture:async(id,bytes)=>{
            const filename=path.join(directory,'fixtures',id+'.json');
            await mkdir(path.dirname(filename),{recursive:true});await writeFile(filename,bytes,{flag:'wx'});
            return path.relative(root,filename).split(path.sep).join('/');
        }});
        await writeFile(path.join(directory,'dataset.json'),JSON.stringify(converted,null,2)+'\n',{flag:'wx'});
        complete=true;
        console.log(JSON.stringify({manifest:path.relative(root,path.join(directory,'dataset.json')),
            timings:converted.viewerInput.timings,note:'Prepared viewer inputs only; no model inference or quality evidence.'}));
        return converted;
    } finally {if(!complete)await rm(directory,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
