// SPDX-License-Identifier: GPL-3.0-or-later
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
import {launchChrome} from './chrome.mjs';
import {pathToFileURL} from 'node:url';
import {args,root,readJson,save} from './lib.mjs';
import {importSnapshot} from './caption-import.mjs';
import {requireHeadroom,resources,resourcePolicy,assertHeadroom} from './resources.mjs';

export function panelSnapshot(panel,player,expected) {
 if(player.videoDetails?.videoId!==expected.videoId||player.videoDetails?.channelId!==expected.channelId)throw new Error('Public player identity mismatch');
 const tracks=player.captions?.playerCaptionsTracklistRenderer?.captionTracks??[];
 const candidates=Array.isArray(panel)?panel:[panel];let selectedPanel,segments=[],incomplete=false;
 function collect(value,rows){let continuation=false;if(!value||typeof value!=='object')return false;for(const [key,item] of Object.entries(value)){if(key==='continuationItemRenderer')continuation=true;if(['transcriptSegmentViewModel','transcriptSegmentRenderer'].includes(key))rows.push({[key]:item});else continuation=collect(item,rows)||continuation;}return continuation;}
 for(const candidate of candidates){const rows=[],continuation=collect(candidate,rows);if(rows.length>segments.length){segments=rows;selectedPanel=candidate;incomplete=continuation;}}
 if(incomplete)throw new Error('Incomplete transcript continuation');
 if(!segments.length)throw new Error('Incomplete or empty public transcript panel');
 const matches=new Set();
 function inspectBytes(bytes,depth=0){if(depth>8)return;
  const text=bytes.toString('utf8');for(const track of tracks)if(track.vssId&&text===track.vssId)matches.add(track.vssId);
  if(/^[A-Za-z0-9_%+/=-]{8,}$/.test(text)){try{const decoded=Buffer.from(decodeURIComponent(text),'base64');if(!decoded.equals(bytes))inspectBytes(decoded,depth+1);}catch{}}
  let offset=0;const varint=()=>{let value=0,shift=0;for(let i=0;i<10;i++){if(offset>=bytes.length)throw new Error();const byte=bytes[offset++];value+=(byte&127)*2**shift;if(!(byte&128))return value;shift+=7;}throw new Error();};
  try{while(offset<bytes.length){const tag=varint(),wire=tag%8;if(!tag)break;if(wire===0)varint();else if(wire===1)offset+=8;else if(wire===5)offset+=4;else if(wire===2){const size=varint();if(size<0||offset+size>bytes.length)break;inspectBytes(bytes.subarray(offset,offset+size),depth+1);offset+=size;}else break;}}catch{/* Opaque non-protobuf fields are not track evidence. */}
 }
 function selectors(value){if(!value||typeof value!=='object')return;for(const [key,item] of Object.entries(value)){if(['token','params'].includes(key)&&typeof item==='string')inspectBytes(Buffer.from(item));else selectors(item);}}
 selectors(selectedPanel);
 let track=tracks.length===1?tracks[0]:matches.size===1?tracks.find(t=>t.vssId===[...matches][0]):null;
 if(!track||track.languageCode.split('-')[0]!=='en')throw new Error('Ambiguous transcript language/track selection');
 return {schemaVersion:1,source:'YouTube public transcript panel',videoId:expected.videoId,channelId:expected.channelId,durationSeconds:Number(player.videoDetails.lengthSeconds),language:'en',captionType:track.kind==='asr'?'automatic':'manual',captionTrackId:track.vssId??null,trackSelectionMethod:tracks.length===1?'only public caption track':'exact selected track ID in public transcript continuation',acquiredAt:new Date().toISOString(),complete:true,segments};
}
async function main() {
 const options=args(),policy=resourcePolicy(options),manifestFile=options.manifest??'bench/datasets/pilot.json',manifest=await readJson(manifestFile);
 if(!options.chrome)throw new Error('--chrome required for isolated per-video acquisition');
 const requested=options.videos?String(options.videos).split(','):options.video?[options.video]:null;
 if(requested?.some(id=>!manifest.videos.some(v=>v.videoId===id)))throw new Error('Retry ID outside frozen selection');
 for(const video of manifest.videos) {
  if(requested&&!requested.includes(video.videoId))continue;
  if(video.captionAvailability==='ok')continue;
  if(video.captionAvailability==='failure'&&!options['retry-failures'])continue;
  let browser,resourceError=null,stage='launch';
  try {
   await requireHeadroom(policy);
   browser=await launchChrome({executable:options.chrome,profileParent:path.join(root,'bench/local'),url:`https://www.youtube.com/watch?v=${video.videoId}&hl=en`,readyExpression:'document.readyState==="complete"',onSample:async()=>{try{assertHeadroom(await resources(),policy);}catch(e){resourceError=e;throw e;}}});
   async function waitFor(expression){for(let i=0;i<150;i++){if(resourceError)throw resourceError;const result=await browser.eval(expression);if(result)return result;await new Promise(r=>setTimeout(r,200));}throw new Error('Public UI timeout at '+stage);}
   async function clickControl(findNode) {
    for(let attempt=0;attempt<8;attempt++) {
     const control=await waitFor(`(()=>{document.querySelector('video')?.pause();const reject=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Reject all'&&b.getClientRects().length);const node=reject??(${findNode});if(!node||!node.getClientRects().length||node.disabled)return false;node.scrollIntoView({block:'center'});const r=node.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);if(!hit||!(hit===node||node.contains(hit)))return false;return {x,y,action:reject?'reject':'target'};})()`);
     await browser.clickAt(control.x,control.y);
     if(control.action==='target')return;
     await new Promise(r=>setTimeout(r,500));
    }
    throw new Error('Consent did not settle');
   }
   stage='description';
   await clickControl("document.querySelector('#description-inline-expander #expand')");
   stage='transcript button';
   await clickControl("Array.from(document.querySelectorAll('button,[role=button]')).find(b=>b.textContent.trim()==='Show transcript'&&b.getClientRects().length)");
   stage='transcript contents';
   await waitFor('document.querySelectorAll("transcript-segment-view-model,ytd-transcript-segment-renderer").length>0');
   const page=JSON.parse(await browser.eval(`JSON.stringify((()=>{const p=window.ytInitialPlayerResponse;const panel=document.querySelector('[target-id="PAmodern_transcript_view"]')??document.querySelector('[target-id="engagement-panel-searchable-transcript"]');return {panel:panel?.data,panels:Array.from(document.querySelectorAll('ytd-engagement-panel-section-list-renderer')).filter(e=>e.querySelector('transcript-segment-view-model,ytd-transcript-segment-renderer')).map(e=>e.data),player:{videoDetails:{videoId:p.videoDetails.videoId,channelId:p.videoDetails.channelId,lengthSeconds:p.videoDetails.lengthSeconds},captions:{playerCaptionsTracklistRenderer:{captionTracks:(p.captions?.playerCaptionsTracklistRenderer?.captionTracks??[]).map(t=>({languageCode:t.languageCode,kind:t.kind,name:t.name,vssId:t.vssId}))}}},panelTextTail:panel?.textContent.slice(-500),browser:navigator.userAgent};})())`));
   stage='validation';
   if(options.debug)await save(`bench/local/acquisition-debug/${video.videoId}.json`,page);
   const snapshot={...panelSnapshot(page.panels,page.player,video),browser:page.browser,browserFlags:browser.flags};
   const fixture=await importSnapshot({manifest,videoId:video.videoId,raw:Buffer.from(JSON.stringify(snapshot,null,2)+'\n')});
   await save(manifestFile,manifest);console.log('Caption UI',video.videoId,'ok',fixture.cues.length,'cues');
  }catch(e){if(resourceError)throw resourceError;if(options.debug&&browser){await writeFile(path.join(root,'bench/local/caption-debug.png'),await browser.screenshot()).catch(()=>{});console.log('Debug',await browser.eval(`({url:location.href,title:document.title,body:document.body.innerText.slice(0,500),expand:Array.from(document.querySelectorAll('#expand')).map(e=>({text:e.textContent,visible:!!e.getClientRects().length,rect:e.getBoundingClientRect().toJSON()})),cookie:Array.from(document.querySelectorAll('button')).filter(e=>e.textContent.includes('Reject')).map(e=>({text:e.textContent,visible:!!e.getClientRects().length}))})`).catch(()=>null));}video.acquisitionFailure=(stage+': '+String(e.message)).replace(/https?:\/\/\S+/g,'[URL]').slice(0,1000);manifest.attemptLedger.push({videoId:video.videoId,channelId:video.channelId,phase:'captions',method:'public-transcript-ui',status:'failure',reason:video.acquisitionFailure,at:new Date().toISOString()});await save(manifestFile,manifest);console.log('Caption UI',video.videoId,'failure',video.acquisitionFailure.slice(0,160));}
  finally{if(browser)await browser.close();}
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
