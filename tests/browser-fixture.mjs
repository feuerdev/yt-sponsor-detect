import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {MODEL_SPEC} from '../src/model-spec.js';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const repo = new URL('../', import.meta.url);
if (!process.argv[2]) throw new Error('Usage: node tests/browser-fixture.mjs <output-directory>');
const out = pathToFileURL(path.resolve(process.argv[2]) + path.sep);
await mkdir(out,{recursive:true});
const manifest = {manifest_version:3,name:'PR 1 isolated regression fixture',version:'1.0.0',
  permissions:['storage','tabs','webRequest'],host_permissions:['http://127.0.0.1/*','https://www.youtube.com/*'],
  background:{service_worker:'background.js'},
  content_scripts:[{matches:['http://127.0.0.1/*'],js:['content.js']}]};
await writeFile(new URL('manifest.json',out),JSON.stringify(manifest));
let source=await readFile(new URL('src/background.js',repo),'utf8');
source=source.replace(/^import .*;\n/gm,'').replace('chrome.webRequest.onCompleted.addListener(', 'registerReviewCaptionListener(');
const prelude=`
const MODEL_SPEC=${JSON.stringify(MODEL_SPEC)};
${(await readFile(new URL('src/sponsor-policy.js',repo),'utf8')).replace(/^export /gm,'')}
${(await readFile(new URL('src/caption-contract.js',repo),'utf8')).replace(/^export /gm,'')}
let reviewCaptionListener;
function registerReviewCaptionListener(fn,...args) { reviewCaptionListener=fn;chrome.webRequest.onCompleted.addListener(fn,...args); }
let attempts=0;
async function classifyCaptions(captions,threshold,onProgress) {
  const text=captions.map(c=>c.text).join(' ');
  if(text.includes('retry-fixture') && ++attempts===1) throw Object.assign(new Error('synthetic transient failure'),{code:'model_unavailable'});
  onProgress?.({processed:1,total:1});return {segments:[{start:0,end:20,category:'sponsor',score:.99}]};
}
async function fetch(url) {
  const videoId=new URL(url).searchParams.get('v');
  return {ok:true,text:async()=>JSON.stringify({events:[
    {tStartMs:0,dDurationMs:24000,id:1,wpWinPosId:1,wsWinStyleId:1},
    ...Array.from({length:20},(_,i)=>({tStartMs:i*1000,dDurationMs:1000,wWinId:1,segs:[{utf8:videoId+' synthetic speech caption'}]})),
    {tStartMs:1000,wWinId:1,aAppend:1,segs:[{utf8:'\\n'}]}
  ]})};
}
`;
const driver=`
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(check) {
  for(let i=0;i<200;i++) { const result=await check();if(result) return result;await sleep(25); }
  throw new Error('Fixture timed out');
}
chrome.runtime.onMessage.addListener((request,sender,respond)=>{
  if(request.type!=='REVIEW_RUN') return;
  (async()=>{
    await chrome.storage.local.clear();
    await chrome.storage.sync.set({isEnabled:true,labels:[{name:'sponsor',threshold:0.9,blocked:true}]});
    await sleep(100);
    const tabId=sender.tab.id;
    const caption=id=>reviewCaptionListener({tabId,url:'https://www.youtube.com/api/timedtext?lang=en&v='+id});
    await caption('retry-fixture');
    await waitFor(()=>!tabState[tabId]);
    if((await chrome.storage.local.get(null))['sponsor-cache:retry-fixture']) throw new Error('Failed inference was cached');
    await caption('retry-fixture');
    await waitFor(async()=> (await chrome.storage.local.get(null))['sponsor-cache:retry-fixture']);
    const retryAttempts=attempts;
    await chrome.storage.local.clear();
    await chrome.storage.local.set(Object.fromEntries(Array.from({length:30},(_,i)=>['sponsor-cache:old'+i,{createdAt:i}])));
    const second=await chrome.tabs.create({url:'http://127.0.0.1:8765/watch?v=second',active:false});
    try {
      await waitFor(async()=> (await chrome.tabs.get(second.id)).status==='complete');
      await Promise.all([
        reviewCaptionListener({tabId,url:'https://www.youtube.com/api/timedtext?lang=en&v=first'}),
        reviewCaptionListener({tabId:second.id,url:'https://www.youtube.com/api/timedtext?lang=en&v=second'})
      ]);
      const cache=await waitFor(async()=> {const all=await chrome.storage.local.get(null);return all['sponsor-cache:first']&&all['sponsor-cache:second']?all:false;});
      const count=Object.keys(cache).filter(key=>key.startsWith('sponsor-cache:')).length;
      if(count!==30) throw new Error('Cache bound exceeded: '+count);
      respond({ok:true,retryAttempts,entries:count,segments:cache['sponsor-cache:first'].segments});
    } finally { await chrome.tabs.remove(second.id); }
  })().catch(error=>respond({ok:false,error:error.message}));
  return true;
});
`;
await writeFile(new URL('background.js',out),prelude+source+driver);
const content=await readFile(new URL('src/content.js',repo),'utf8');
await writeFile(new URL('content.js',out),content+`
window.addEventListener('message',event=>{
  if(event.source!==window || event.data?.type!=='REVIEW_RUN') return;
  chrome.runtime.sendMessage({type:'REVIEW_RUN'},response=>window.postMessage({type:'REVIEW_RESULT',response},'*'));
});
`);
await writeFile(new URL('index.html',out),`<!doctype html><meta charset="utf-8"><title>PR 1 regression evidence</title>
<style>body{font:17px system-ui;background:#101722;color:#eef4ff;margin:40px auto;max-width:1000px}h1{font-size:30px}p{color:#b5c4dc}button{font:inherit;padding:8px 14px;cursor:pointer}#movie_player{position:relative;width:800px;margin-top:28px}video{display:block;width:800px;border-radius:12px}.ytp-progress-bar{height:12px;position:relative;background:#35465e}#results{padding:18px;background:#1c2a3e;border-radius:12px;line-height:1.8}#playback{margin-top:12px}small{color:#b5c4dc}</style>
<h1>PR #1: caption, retry and cache regressions</h1>
<p>Isolated Chromium extension fixture. Real background/content source and Chrome storage APIs.<br>Synthetic captions and classifier output. No YouTube traffic or model inference.</p>
<button id="run">Run regressions</button><pre id="results">Ready.</pre>
<div id="movie_player"><video src="/fixture.mp4" controls muted preload="auto"></video><div class="ytp-progress-bar"></div></div>
<div id="playback"></div><small>Manual Skip and Undo use the actual content script and video element.</small>
<script>
document.querySelector('#run').onclick=()=>{document.querySelector('#results').textContent='Running real extension APIs…';window.postMessage({type:'REVIEW_RUN'},'*');};
window.addEventListener('message',event=>{if(event.data?.type!=='REVIEW_RESULT')return;const r=event.data.response;
document.querySelector('#results').textContent=r?.ok?'PASS — newline-only JSON3 event without duration accepted\\nPASS — transient classifier failure retried ('+r.retryAttempts+' attempts)\\nPASS — simultaneous tab completions retained '+r.entries+' / 30 videos':JSON.stringify(r);window.reviewResult=r;
const video=document.querySelector('video');video.currentTime=1.5;video.dispatchEvent(new Event('timeupdate'));});
const video=document.querySelector('video');function showTime(){document.querySelector('#playback').textContent='Playback position: '+video.currentTime.toFixed(1)+' seconds';}video.addEventListener('timeupdate',showTime);showTime();
</script>`);
await writeFile(new URL('serve.mjs',out),`import http from 'node:http';
import fs from 'node:fs';
http.createServer((req,res)=>{
  const media=new URL(req.url,'http://localhost').pathname==='/fixture.mp4';
  const file=new URL(media?'fixture.mp4':'index.html',import.meta.url);
  const size=fs.statSync(file).size;
  res.setHeader('Content-Type',media?'video/mp4':'text/html');
  res.setHeader('Accept-Ranges','bytes');
  if(req.headers.range){
    const [,a,b]=req.headers.range.match(/bytes=(\\d+)-(\\d*)/);
    const start=Number(a),end=b?Number(b):size-1;
    res.writeHead(206,{'Content-Range':\`bytes \${start}-\${end}/\${size}\`,'Content-Length':end-start+1});
    fs.createReadStream(file,{start,end}).pipe(res);
  }else{res.setHeader('Content-Length',size);fs.createReadStream(file).pipe(res);}
}).listen(8765,'127.0.0.1',()=>console.log('Fixture ready on 127.0.0.1:8765'));
`);
console.log(out.pathname);
