// SPDX-License-Identifier: GPL-3.0-or-later
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {args,root,hash,readJson,save} from './lib.mjs';
import {validateFixture} from './contracts.mjs';
export function captionFixture(raw,video) {
 const source=JSON.parse(raw);
 if(source.schemaVersion!==1||source.source!=='YouTube public transcript panel'||source.videoId!==video.videoId||source.channelId!==video.channelId||source.language!=='en'||source.complete!==true)throw new Error('Caption source identity/language/completeness mismatch');
 const duration=source.durationSeconds;
 if(!Number.isFinite(duration)||duration<=0||!['automatic','manual'].includes(source.captionType)||!Number.isFinite(Date.parse(source.acquiredAt)))throw new Error('Invalid caption provenance');
 if(video.durationSeconds&&Math.abs(video.durationSeconds-duration)>1)throw new Error('Caption duration mismatch');
 const rows=source.segments.map(s=>{
  if(s.transcriptSegmentRenderer){const r=s.transcriptSegmentRenderer;return {start:Number(r.startMs)/1000,end:Number(r.endMs)/1000,text:(r.snippet?.runs??[]).map(x=>x.text).join('')};}
  const r=s.transcriptSegmentViewModel;
  if(!r||!/^\d+(?::[0-5]\d){1,2}$/.test(r.timestamp))throw new Error('Invalid transcript timestamp');
  return {start:r.timestamp.split(':').reduce((n,v)=>n*60+Number(v),0),text:r.simpleText};
 });
 if(!rows.length)throw new Error('Empty transcript');
 const coarse=rows.some(r=>r.end===undefined),cues=[];
 for(const row of rows){if(!Number.isFinite(row.start)||row.start<0||row.start>=duration||typeof row.text!=='string'||!row.text.trim())throw new Error('Invalid transcript cue');
  const last=cues.at(-1);if(last&&row.start<last.start)throw new Error('Unordered transcript');
  if(last&&row.start===last.start&&coarse){last.text+=' '+row.text;continue;}
  cues.push({...row});
 }
 for(let i=0;i<cues.length;i++)if(cues[i].end===undefined)cues[i].end=cues[i+1]?.start??duration;
 const referenceSegments=(video.crowdReferences??[]).map(r=>({start:r.segment[0],end:r.segment[1],category:r.category,status:'provisional',source:video.referenceSource??'SponsorBlock',votes:r.votes??null,locked:r.locked??null,uuid:r.UUID??null})).filter(r=>r.start>=0&&r.end<=duration&&r.end>r.start);
 return validateFixture({videoId:video.videoId,channelId:video.channelId,durationSeconds:duration,language:'en',cues,referenceSegments,reviewedNegativeIntervals:[],annotationCompleteness:'partial',provenance:{captionSource:source.source,captionType:source.captionType,captionTrackId:source.captionTrackId??null,trackSelectionMethod:source.trackSelectionMethod??'locally supplied snapshot metadata',acquiredAt:source.acquiredAt,rawHash:hash(raw),timingResolutionSeconds:coarse?1:.001,endBoundaryMethod:coarse?'next cue start; final cue ends at video duration; same-second cues coalesced':'native transcript startMs/endMs',labelSource:video.referenceSource??'SponsorBlock',labelSnapshotAt:video.referenceSnapshotAt,labelLicense:'CC-BY-NC-SA-4.0',captionRights:'Private acquisition from public YouTube interface; no redistribution',browser:source.browser??null}});
}
export async function importSnapshot({manifest,videoId,raw,baseDirectory=root}) {
 const video=manifest.videos.find(v=>v.videoId===videoId);if(!video)throw new Error('Video outside frozen selection');
 if(video.captionAvailability==='ok')throw new Error('Successful frozen fixture cannot be overwritten');
 const fixture=captionFixture(raw,video),bytes=Buffer.from(JSON.stringify(fixture,null,2)+'\n');
 const rawPath=`bench/local/raw/${videoId}.public-ui.json`,fixturePath=`bench/local/fixtures/${videoId}.json`;
 const created=[];
 try{for(const [relative,data] of [[rawPath,raw],[fixturePath,bytes]]){const file=path.join(baseDirectory,relative);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,data,{flag:'wx'});created.push(file);}}
 catch(e){for(const file of created)await rm(file);throw e;}
 Object.assign(video,{captionAvailability:'ok',durationSeconds:fixture.durationSeconds,captionType:fixture.provenance.captionType,rawSourceHash:hash(raw),fixtureHash:hash(bytes),fixturePath,acquiredAt:fixture.provenance.acquiredAt,captionSource:fixture.provenance.captionSource,timingResolutionSeconds:fixture.provenance.timingResolutionSeconds});
 delete video.acquisitionFailure;
 manifest.attemptLedger.push({videoId,channelId:video.channelId,phase:'captions',method:'public-transcript-ui',status:'ok',at:fixture.provenance.acquiredAt,rawSourceHash:hash(raw),fixtureHash:hash(bytes)});
 manifest.acquisitionSummary={selected:manifest.videos.length,available:manifest.videos.filter(v=>v.captionAvailability==='ok').length,channelsSelected:new Set(manifest.videos.map(v=>v.channelId)).size,channelsAvailable:new Set(manifest.videos.filter(v=>v.captionAvailability==='ok').map(v=>v.channelId)).size,verifiedNegativeHours:0,qualityClaims:'provisional reference agreement only'};
 return fixture;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const options=args();if(!options.file||!options.video)throw new Error('--file private snapshot and --video ID required');const manifestFile=options.manifest??'bench/datasets/pilot.json',manifest=await readJson(manifestFile);await importSnapshot({manifest,videoId:options.video,raw:await readFile(options.file)});await save(manifestFile,manifest);console.log('Imported',options.video);}
