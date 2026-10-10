// Source/rendering fixture only: actual built viewer, controlled captions/detector/API doubles.
import http from 'node:http';
import path from 'node:path';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {launchChrome} from '../bench/chrome.mjs';
import {resources,requireHeadroom} from '../bench/resources.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const executable=process.argv[2];if(!executable)throw new Error('Usage: node scripts/capture-viewer.mjs <chrome-headless-shell>');
const out=path.join(root,'artifacts/viewer-render');await mkdir(out,{recursive:true});
const data=Buffer.alloc(44+16000*2*30);data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(16000,24);data.writeUInt32LE(32000,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(data.length-44,40);
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Local sponsor viewer — rendered fixture evidence</title><link rel="stylesheet" href="/dist/viewer.css"><style>
body{margin:24px;background:#0b1220;color:#e5edf8;font:16px/1.5 system-ui}h1{font-size:25px;margin-bottom:4px}p{color:#aabbd2;margin:0 0 18px}.layout{display:flex;gap:24px;align-items:flex-start}#movie_player{width:760px;position:relative;border-radius:12px;overflow:hidden;background:linear-gradient(140deg,#23354c,#0d1727)}video{display:block;width:760px;height:430px}.ytp-progress-bar{position:relative;height:9px;background:#34465f}iframe{width:350px;height:650px;border:1px solid #34465f;border-radius:10px}#results{font:14px/1.6 monospace;white-space:pre-wrap;padding:14px;background:#142137;border-radius:8px;max-width:730px}#position{margin:10px 0}small{color:#aabbd2}
</style></head><body><h1>Local sponsor viewer</h1><p>Synthetic captions and detector · Actual built viewer code · Native media seeking<br>Fixture evidence only: no live YouTube, extension API integration or model accuracy claim.</p><div class="layout"><main><div id="movie_player"><video src="/media.wav" controls autoplay muted></video><div class="ytp-progress-bar"></div></div><div id="position"></div><pre id="results">Waiting for automatic skip…</pre><small>Undo returns to the interval start and suppresses a second automatic skip.</small></main><iframe title="Actual built popup with controlled browser APIs" src="about:blank"></iframe></div><script>window.fixtureErrors=[];window.addEventListener("error",e=>window.fixtureErrors.push(e.message));window.addEventListener("unhandledrejection",e=>window.fixtureErrors.push(String(e.reason)));</script><script type="module">
import {SessionCoordinator} from '/src/viewer/coordinator.js';
import {ResultCache} from '/src/viewer/cache.js';
const listeners=[],changes=[];const stored={viewerSchema:1,isEnabled:true,autoSkip:true,selfPromotion:false},cached={};
const storage=values=>({get:async key=>key===null?{...values}:{[key]:values[key]},set:async value=>{Object.assign(values,value);},remove:async keys=>{for(const key of [].concat(keys))delete values[key];}});
const sync=storage(stored);sync.set=async values=>{Object.assign(stored,values);for(const listener of changes)listener(Object.fromEntries(Object.entries(values).map(([key,newValue])=>[key,{newValue}])),'sync');};
const coordinator=new SessionCoordinator({settings:sync,cache:new ResultCache(storage(cached)),modelKey:'synthetic-fixture-v1',detect:async()=>({segments:[{start:1,end:4,category:'sponsor'}],diagnostics:{model:'synthetic fixture',quality:'no model inference',backend:'fixture'}}),notify:(_,state)=>listeners.forEach(fn=>fn({type:'VIEWER_STATE',state},{id:'fixture'}))});
window.chrome={storage:{sync,onChanged:{addListener:fn=>changes.push(fn)}},runtime:{id:'fixture',onMessage:{addListener:fn=>listeners.push(fn)},sendMessage:async message=>{
 if(message.type==='START_SESSION')return {state:await coordinator.begin(1,message.videoId,message.token,{retry:message.retry})};
 if(message.type==='SUBMIT_TRANSCRIPT')return {state:await coordinator.submit(1,message.token,message.transcript)};
 if(message.type==='TRANSCRIPT_UNAVAILABLE')return {state:coordinator.unavailable(1,message.token,message.reason)};
 if(message.type==='GET_VIDEO_STATUS')return {state:coordinator.snapshot(coordinator.sessions.get(1))};
 if(message.type==='PAUSE_VIDEO')return {state:coordinator.pause(1,message.paused)};
 if(message.type==='RETRY_VIDEO'){listeners.forEach(fn=>fn({type:'RETRY_VIDEO'},{id:'fixture'}));return {retry:true};}
 return {};
}}};
window.ytInitialPlayerResponse={videoDetails:{videoId:'first',lengthSeconds:'30'},playabilityStatus:{status:'OK'},captions:{playerCaptionsTracklistRenderer:{captionTracks:[{languageCode:'en',kind:'asr',baseUrl:'https://www.youtube.com/api/timedtext?v=first'}]}}};
const nativeFetch=window.fetch;window.fetch=async(url,options)=>{
 if(String(url).startsWith('https://www.youtube.com/api/timedtext'))return new Response(JSON.stringify({events:[{tStartMs:1000,dDurationMs:3000,segs:[{utf8:'sponsored',tOffsetMs:0},{utf8:'by',tOffsetMs:1000},{utf8:'example',tOffsetMs:2000}]}]}),{status:200});
 return nativeFetch(url,options);
};
function load(src){return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=reject;document.body.appendChild(script);});}
await load('/dist/viewer-page.js');await load('/dist/viewer-content.js');document.querySelector('iframe').src='/popup';
window.fixtureReady=true;window.fixtureCoordinator=coordinator;
window.fixtureResult={scope:'built viewer with browser API doubles, synthetic caption response/detector, actual HTMLVideoElement over a local PCM media fixture'};
const video=document.querySelector('video');video.addEventListener('timeupdate',()=>{document.querySelector('#position').textContent='Playback position: '+video.currentTime.toFixed(2)+' seconds';});
</script></body></html>`;
const server=http.createServer(async(req,res)=>{
 try {
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  if(pathname==='/watch'){res.setHeader('Content-Type','text/html');res.end(html);return;}
  if(pathname==='/media.wav'){
   res.setHeader('Content-Type','audio/wav');res.setHeader('Accept-Ranges','bytes');
   const match=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);if(match){const start=Number(match[1]),end=match[2]?Number(match[2]):data.length-1;res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${data.length}`,'Content-Length':end-start+1});res.end(data.subarray(start,end+1));}else{res.setHeader('Content-Length',data.length);res.end(data);}return;
  }
  if(pathname==='/popup'){
   const popup=(await readFile(path.join(root,'dist/popup.html'),'utf8')).replace('src="viewer-popup.js"','src="/dist/viewer-popup.js"').replace('<body>','<body><script>window.chrome=parent.chrome;</script>');
   res.setHeader('Content-Type','text/html');res.end(popup);return;
  }
  if(!/^\/(dist\/viewer-[\w-]+\.js|dist\/viewer\.css|src\/viewer\/[\w-]+\.js)$/.test(pathname)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',pathname.endsWith('.css')?'text/css':'text/javascript');res.end(await readFile(path.join(root,pathname.slice(1))));
 }catch{res.writeHead(500);res.end('Fixture unavailable');}
});
const record={purpose:'viewer rendering and real media seek/Undo only; no model or live YouTube evidence',before:await requireHeadroom(650)};record.peakAccountMiB=record.before.accountMiB;let browser;
try {
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await launchChrome({executable,profileParent:out,url:`http://127.0.0.1:${server.address().port}/watch?v=first`,singleProcess:true,cpuOnly:true,readyExpression:'window.fixtureReady===true||window.fixtureErrors?.length>0',onSample:async()=>{
  const sample=await resources();record.peakAccountMiB=Math.max(record.peakAccountMiB,sample.accountMiB);
  if(sample.accountMiB>650||sample.availableMiB<768)throw new Error('Conservative fixture resource guard');
 }});
 record.version=browser.version;record.flags=browser.flags;const errors=await browser.eval('window.fixtureErrors');if(errors?.length)throw new Error(errors.join('; '));
 record.skipped=await browser.eval(`(async()=>{for(let i=0;i<100;i++){if(document.querySelector('.ss-skip-notice')){const v=document.querySelector('video');v.pause();document.querySelector('#results').textContent='PASS — automatic skip sought to '+v.currentTime.toFixed(2)+'s\\nUndo available in the player; current-video popup rendered.';return {position:v.currentTime,notice:document.querySelector('.ss-skip-notice').textContent};}await new Promise(r=>setTimeout(r,50));}throw new Error('Automatic skip fixture timed out');})()`);
 await writeFile(path.join(out,'skipped.png'),await browser.screenshot());
 record.restored=await browser.eval(`(async()=>{document.querySelector('.ss-skip-notice button').click();await new Promise(r=>setTimeout(r,100));const v=document.querySelector('video');v.dispatchEvent(new Event('timeupdate'));document.querySelector('#results').textContent+='\\nPASS — Undo restored '+v.currentTime.toFixed(2)+'s; no repeat skip.';return {position:v.currentTime,repeatNotice:!!document.querySelector('.ss-skip-notice')};})()`);
 await writeFile(path.join(out,'restored.png'),await browser.screenshot());
 if(record.skipped.position<4||record.restored.position<0.95||record.restored.position>1.05||record.restored.repeatNotice)throw new Error('Seek/Undo evidence mismatch');
 record.settings=await browser.eval(`(async()=>{const doc=document.querySelector('iframe').contentDocument;doc.querySelector('#automatic').click();await new Promise(r=>setTimeout(r,100));doc.querySelector('#pause').click();await new Promise(r=>setTimeout(r,100));const paused=window.fixtureCoordinator.snapshot(window.fixtureCoordinator.sessions.get(1)).paused;doc.querySelector('#enabled').click();await new Promise(r=>setTimeout(r,100));return {automatic:doc.querySelector('#automatic').checked,paused,disabled:document.querySelector('.ss-status').textContent.includes('off')};})()`);
 if(record.settings.automatic||!record.settings.paused||!record.settings.disabled)throw new Error('Live fixture settings mismatch');
 record.status='passed';
}catch(error){record.status='unavailable';record.error=String(error.message).slice(0,500);}
finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));await writeFile(path.join(out,'evidence.json'),JSON.stringify(record,null,2));console.log(JSON.stringify(record,null,2));}
if(record.status!=='passed')process.exitCode=1;
