// SPDX-License-Identifier: GPL-3.0-or-later
// Native WebAudio fixture: no tabCapture API, YouTube or Whisper inference.
import http from 'node:http';
import path from 'node:path';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {launchChrome} from '../bench/chrome.mjs';
import {resources,requireHeadroom} from '../bench/resources.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),executable=process.argv[2];
if(!executable)throw Error('Usage: node scripts/capture-audio-poc.mjs <chrome-headless-shell>');
const out=path.join(root,'artifacts/audio-render');await mkdir(out,{recursive:true});
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Local audio — native PCM fixture</title><style>body{margin:24px;background:#0b1220;color:#e5edf8;font:16px/1.5 system-ui}h1{font-size:25px}p{color:#aabbd2}.layout{display:flex;gap:24px}pre{width:640px;white-space:pre-wrap;background:#142137;padding:20px;border-radius:10px}iframe{width:405px;height:680px;border:1px solid #34465f;border-radius:10px}</style></head><body><h1>Local audio experiment</h1><p>Native oscillator → MediaStream → AudioWorklet → bounded PCM · Synthetic ASR<br>Fixture only: no tabCapture API, YouTube, audio-hardware continuity or Whisper inference.</p><div class="layout"><pre id="results">Waiting for an explicit popup action…</pre><iframe src="about:blank" title="Actual built experiment popup"></iframe></div><script>window.fixtureErrors=[];window.addEventListener('error',e=>fixtureErrors.push(e.message));window.addEventListener('unhandledrejection',e=>fixtureErrors.push(String(e.reason)));</script><script type="module">
import {AudioExperiment} from '/audio-poc/experiment.js';
const toneContext=new AudioContext({sampleRate:48000}),oscillator=toneContext.createOscillator(),destination=toneContext.createMediaStreamDestination();oscillator.frequency.value=220;oscillator.connect(destination);oscillator.start();
const record={scope:'native oscillator/MediaStream/worklet/controller, synthetic ASR and controlled browser APIs'};
const experiment=new AudioExperiment({mediaDevices:{getUserMedia:async()=>destination.stream},workletURL:'/audio-poc-dist/worklet.js',createContext:options=>{const context=new AudioContext(options);window.fixtureCaptureContext=context;context.makeCollector=()=>new AudioWorkletNode(context,'local-audio-collector');return context;},createWorker:()=>{
 const worker={terminate:()=>{record.workerTerminated=true;},postMessage:({pcm})=>{record.samples=pcm.length;record.finite=pcm.every(Number.isFinite);record.nonSilent=pcm.some(value=>Math.abs(value)>.01);queueMicrotask(()=>worker.onmessage({data:{text:'Synthetic ASR fixture: no speech model executed.',chunks:[{text:'Synthetic ASR fixture',timestamp:[0,pcm.length/16000]}]}}));}};return worker;
},notify:state=>{document.querySelector('#results').textContent=JSON.stringify({status:state.status,samples:record.samples,finite:record.finite,nonSilent:record.nonSilent,streamActive:destination.stream.active,workerTerminated:record.workerTerminated},null,2);}});
window.chrome={runtime:{sendMessage:async message=>{
 if(message.type==='AUDIO_START'){await toneContext.resume();await experiment.start('synthetic-stream');}
 if(message.type==='AUDIO_FINISH')await experiment.finish();
 if(message.type==='AUDIO_CANCEL')await experiment.cancel();
 return experiment.state;
}}};
window.fixtureRecord=record;window.fixtureExperiment=experiment;window.fixtureStream=destination.stream;window.fixtureReady=true;document.querySelector('iframe').src='/popup';
window.addEventListener('pagehide',()=>{void experiment.cancel();oscillator.stop();void toneContext.close();});
</script></body></html>`;
const server=http.createServer(async(req,res)=>{
 try{const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
  if(pathname==='/popup'){const popup=(await readFile(path.join(root,'audio-poc-dist/popup.html'),'utf8')).replace('src="popup.js"','src="/audio-poc-dist/popup.js"').replace('<body>','<body><script>window.chrome=parent.chrome;</script>');res.setHeader('Content-Type','text/html');res.end(popup);return;}
  if(!/^\/(audio-poc\/(experiment|resampler)\.js|audio-poc-dist\/(popup|worklet)\.js)$/.test(pathname)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type','text/javascript');res.end(await readFile(path.join(root,pathname.slice(1))));
 }catch{res.writeHead(500);res.end('Fixture unavailable');}
});
const record={purpose:'native AudioWorklet capture and PCM/cleanup, actual built popup; synthetic ASR/browser APIs; no Whisper, tabCapture or sound-hardware evidence',before:await requireHeadroom(650)};record.peakAccountMiB=record.before.accountMiB;let browser;
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await launchChrome({executable,profileParent:out,url:`http://127.0.0.1:${server.address().port}`,singleProcess:true,cpuOnly:true,readyExpression:'window.fixtureReady===true||window.fixtureErrors?.length>0',onSample:async()=>{const sample=await resources();record.peakAccountMiB=Math.max(record.peakAccountMiB,sample.accountMiB);if(sample.accountMiB>650||sample.availableMiB<768)throw Error('Conservative audio fixture resource guard');}});
 record.version=browser.version;record.flags=browser.flags;const errors=await browser.eval('window.fixtureErrors');if(errors?.length)throw Error(errors.join('; '));
 async function click(id){const point=await browser.eval(`(()=>{const iframe=document.querySelector('iframe'),button=iframe.contentDocument.getElementById('${id}');if(!button)throw Error('Popup not ready');const box=button.getBoundingClientRect(),frame=iframe.getBoundingClientRect();return {x:frame.x+box.x+box.width/2,y:frame.y+box.y+box.height/2};})()`);await browser.command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await browser.command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});}
 await browser.eval(`(async()=>{for(let i=0;i<50;i++){if(document.querySelector('iframe').contentDocument?.getElementById('start'))return;await new Promise(r=>setTimeout(r,50));}throw Error('Popup not ready');})()`);
 await click('start');
 await browser.eval(`(async()=>{for(let i=0;i<100;i++){if(window.fixtureExperiment.state.status==='recording')return;if(window.fixtureErrors.length)throw Error(window.fixtureErrors.join('; '));await new Promise(r=>setTimeout(r,50));}throw Error('Recording not started');})()`);
 await new Promise(resolve=>setTimeout(resolve,3000));await browser.eval('window.scrollTo(0,0)');await writeFile(path.join(out,'recording.png'),await browser.screenshot());
 await click('finish');
 record.result=await browser.eval(`(async()=>{for(let i=0;i<100;i++){if(window.fixtureExperiment.state.status==='ready')return {...window.fixtureRecord,streamActive:window.fixtureStream.active,contextState:window.fixtureCaptureContext.state,status:window.fixtureExperiment.state.status};await new Promise(r=>setTimeout(r,50));}throw Error('PCM fixture not completed');})()`);
 await browser.eval('window.scrollTo(0,0)');await writeFile(path.join(out,'transcribed.png'),await browser.screenshot());
 if(!record.result.finite||!record.result.nonSilent||record.result.samples<16000||record.result.samples>320000||record.result.streamActive||record.result.contextState!=='closed'||!record.result.workerTerminated)throw Error('PCM/cleanup evidence mismatch');
 await click('cancel');record.cleared=await browser.eval('window.fixtureExperiment.state.status');if(record.cleared!=='idle')throw Error('Result clearing failed');record.status='passed';
}catch(error){record.status='unavailable';record.error=String(error.message).slice(0,500);}
finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));await writeFile(path.join(out,'evidence.json'),JSON.stringify(record,null,2));console.log(JSON.stringify(record,null,2));}
if(record.status!=='passed')process.exitCode=1;
