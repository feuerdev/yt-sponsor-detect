// SPDX-License-Identifier: GPL-3.0-or-later
// Diagnostic only: normal public CC UI; no alternate client, auth or URL replay.
import {launchChrome} from './chrome.mjs';
import {requireHeadroom,resourcePolicy} from './resources.mjs';
import path from 'node:path';
import {args,root,readJson,save} from './lib.mjs';
const options=args(),manifest=await readJson(options.manifest??'bench/datasets/pilot.json'),videoId=options.video,expected=manifest.videos.find(v=>v.videoId===videoId),policy=resourcePolicy(options),pending=new Map(),responses=[];let browser;
if(!expected||!options.chrome)throw new Error('Frozen --video and installed --chrome required');
await requireHeadroom(policy);
try {
 browser=await launchChrome({executable:options.chrome,profileParent:path.join(root,'bench/local'),url:'about:blank',readyExpression:'true',onSample:()=>requireHeadroom(policy),onEvent:m=>{
  if(m.method==='Network.responseReceived'){const r=m.params.response,u=new URL(r.url);if(u.hostname.endsWith('youtube.com')&&u.pathname==='/api/timedtext'&&u.searchParams.get('v')===videoId)pending.set(m.params.requestId,{status:r.status,lang:u.searchParams.get('lang'),translation:u.searchParams.get('tlang'),kind:u.searchParams.get('kind'),fmt:u.searchParams.get('fmt')});}
  if(m.method==='Network.loadingFinished'&&pending.has(m.params.requestId)){const info=pending.get(m.params.requestId);browser.command('Network.getResponseBody',{requestId:m.params.requestId}).then(r=>responses.push({...info,body:r.base64Encoded?Buffer.from(r.body,'base64').toString():r.body}),e=>responses.push({...info,error:e.message}));}
 }});
 await browser.command('Network.enable');await browser.command('Page.navigate',{url:`https://www.youtube.com/watch?v=${videoId}&hl=en`});
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 for(let i=0;i<40;i++){const r=await browser.eval(`(()=>{const node=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Reject all'&&b.getClientRects().length);if(node){const r=node.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,consent:true};}const p=window.ytInitialPlayerResponse;if(!p?.videoDetails)return null;document.querySelector('video')?.pause();const node2=document.querySelector('.ytp-subtitles-button');if(!node2||!node2.getClientRects().length)return null;const r=node2.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,pressed:node2.getAttribute('aria-pressed'),disabled:node2.getAttribute('aria-disabled')};})()`);if(r){if(r.consent){await browser.clickAt(r.x,r.y);await wait(1000);continue;}console.log('Public player CC',r);if(r.disabled!=='true'&&r.pressed!=='true')await browser.clickAt(r.x,r.y);break;}await wait(500);}
 for(let i=0;i<60&&!responses.length;i++)await wait(500);
 const player=await browser.eval(`(()=>{const p=window.ytInitialPlayerResponse;return {videoId:p?.videoDetails?.videoId,channelId:p?.videoDetails?.channelId,durationSeconds:Number(p?.videoDetails?.lengthSeconds),captionTracks:(p?.captions?.playerCaptionsTracklistRenderer?.captionTracks??[]).map(t=>({vssId:t.vssId,languageCode:t.languageCode,kind:t.kind}))}})()`);
 if(player.videoId!==expected.videoId||player.channelId!==expected.channelId)throw new Error('Public player identity mismatch');
 console.log('Native response metadata',responses.map(({body,...metadata})=>({...metadata,bytes:body?.length})),player);
 await save('bench/local/acquisition-debug/'+videoId+'.native.json',{source:'YouTube public caption player',acquiredAt:new Date().toISOString(),player,responses});
} finally{if(browser)await browser.close();}
