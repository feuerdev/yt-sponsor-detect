// SPDX-License-Identifier: GPL-3.0-or-later
import {nativeChrome} from '../tests/browser/native-chrome.mjs';
import {connect} from '../tests/browser/cdp-client.mjs';
import {resources,resourcePolicy,requireHeadroom,assertHeadroom} from '../bench/resources.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import path from 'node:path';import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)), output=path.resolve(process.argv[3]||'artifacts/installed-audio');
if(!process.argv[2])throw Error('Usage: node scripts/capture-installed-audio-poc.mjs <spoken-fixture.wav> [output-directory]');
const policy=resourcePolicy({'memory-budget':process.env.BENCH_MEMORY_BUDGET,'minimum-available':process.env.BENCH_MIN_AVAILABLE});await mkdir(output,{recursive:true});
const wav=await readFile(process.argv[2]),expected='This is a local audio test. The video is sponsored by Acme.';
const record={scope:'Actual installed audio MV3, tabCapture/offscreen/AudioWorklet and local Whisper. YouTube watch page/media are fulfilled with a local synthetic spoken fixture. No public-video ASR or hardware listening claim.',expected,sourceSHA256:createHash('sha256').update(wav).digest('hex'),policy,startedAt:new Date().toISOString(),network:[],errors:[]};
let browser,c,guardFailure,guard,closing=false,pageSid,popupSid,extensionId;
const evalAt=async(sid,expression)=>{const r=await c.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sid);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
const attach=async targetId=>(await c.call('Target.attachToTarget',{targetId,flatten:true})).sessionId;
const wait=async(fn,ms=30000)=>{const end=Date.now()+ms;while(Date.now()<end){if(guardFailure)throw guardFailure;const r=await fn();if(r)return r;await new Promise(r=>setTimeout(r,200));}throw Error('Timed out at '+record.stage)};
try{
 record.before=await requireHeadroom(policy);record.peakAccountMiB=record.before.accountMiB;browser=await nativeChrome('gpu');record.flags=browser.flags;
 c=await connect(browser.endpoint,m=>{
  if(m.method==='Target.attachedToTarget'){const sid=m.params.sessionId;Promise.resolve().then(async()=>{await c.call('Runtime.enable',{},sid);await c.call('Network.enable',{},sid);await c.call('Runtime.runIfWaitingForDebugger',{},sid)}).catch(e=>record.errors.push(e.message));}

  if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')record.errors.push(m.params.args.map(a=>a.description||a.value).join(' '));
  if(m.method==='Runtime.exceptionThrown')record.errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
  if(m.method==='Network.requestWillBeSent'){const u=new URL(m.params.request.url);if(u.protocol!=='data:')record.network.push({protocol:u.protocol,host:u.hostname,path:u.pathname,sessionId:m.sessionId});}
  if(m.method==='Fetch.requestPaused'){
   const url=m.params.request.url;let body,type;
   if(url.includes('/watch?')){body=Buffer.from('<!doctype html><html lang="en"><title>Local spoken fixture for installed tab capture</title><style>body{font:18px system-ui;margin:40px}button{padding:20px;font:inherit}audio{display:block;margin-top:30px}</style><h1>Installed tab capture + local Whisper</h1><p>Local synthesized English speech, actual capture APIs and model. No real-video accuracy claim.</p><button style="position:absolute;left:40px;top:190px" onclick="document.querySelector(\'audio\').play()">Play local speech</button><audio src="https://www.youtube.com/speech.wav" controls loop preload="auto"></audio></html>');type='text/html';}
   else if(url.endsWith('/speech.wav')){body=wav;type='audio/wav';}
   else {c.call('Fetch.failRequest',{requestId:m.params.requestId,errorReason:'Aborted'},m.sessionId).catch(()=>{});return;}
   const headers=[{name:'Content-Type',value:type},{name:'Accept-Ranges',value:'bytes'}];let code=200;
   const match=(m.params.request.headers.Range||m.params.request.headers.range)?.match(/^bytes=(\d+)-(\d*)/);if(type==='audio/wav'&&match){const start=Number(match[1]),end=match[2]?Number(match[2]):body.length-1;headers.push({name:'Content-Range',value:`bytes ${start}-${end}/${body.length}`});body=body.subarray(start,end+1);code=206;}
   headers.push({name:'Content-Length',value:String(body.length)});c.call('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:code,responseHeaders:headers,body:body.toString('base64')},m.sessionId).catch(e=>{if(!closing)record.errors.push(e.message)});
  }
 });
 guard=setInterval(async()=>{try{const r=assertHeadroom(await resources(),policy);record.peakAccountMiB=Math.max(record.peakAccountMiB,r.accountMiB)}catch(e){guardFailure=e}},1500);
 record.browserVersion=await c.call('Browser.getVersion');await c.call('Target.setDiscoverTargets',{discover:true});({id:extensionId}=await c.call('Extensions.loadUnpacked',{path:path.join(root,'audio-poc-dist')}));record.extensionId=extensionId;
 const {targetId}=await c.call('Target.createTarget',{url:'about:blank'});pageSid=await attach(targetId);await c.call('Network.enable',{},pageSid);await c.call('Fetch.enable',{patterns:[{urlPattern:'https://www.youtube.com/*'}]},pageSid);await c.call('Page.navigate',{url:'https://www.youtube.com/watch?v=audiosmoke1'},pageSid);record.stage='fixture page';await wait(()=>evalAt(pageSid,'document.querySelector("audio")?.readyState>=2'));
 const tabTarget=(await c.call('Target.getTargets',{filter:[{type:'tab',exclude:false},{exclude:true}]})).targetInfos.find(t=>t.url.includes('/watch?v=audiosmoke1'));await c.call('Extensions.triggerAction',{id:extensionId,targetId:tabTarget.targetId});
 const sw=await wait(async()=> (await c.call('Target.getTargets')).targetInfos.find(t=>t.url===`chrome-extension://${extensionId}/background.js`));const swSid=await attach(sw.targetId);
 const [videoTab]=await evalAt(swSid,'chrome.tabs.query({active:true,currentWindow:true})');record.videoTabId=videoTab.id;
 const popup=await evalAt(swSid,`chrome.tabs.create({url:chrome.runtime.getURL('popup.html'),active:false,windowId:${videoTab.windowId}})`);
 const popupTarget=await wait(async()=>(await c.call('Target.getTargets')).targetInfos.find(t=>t.url===`chrome-extension://${extensionId}/popup.html`));popupSid=await attach(popupTarget.targetId);await evalAt(popupSid,`chrome.tabs.update(${videoTab.id},{active:true})`);
 record.stage='actual tab capture';console.log(record.stage);record.start=await evalAt(popupSid,'chrome.runtime.sendMessage({type:"AUDIO_START"})');console.log(record.start);if(record.start.status!=='recording')throw Error('Capture did not start: '+JSON.stringify(record.start));
 const position=await evalAt(pageSid,'(()=>{const r=document.querySelector("button").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');for(const type of ['mousePressed','mouseReleased'])await c.call('Input.dispatchMouseEvent',{type,...position,button:'left',clickCount:1},pageSid);
 record.recording=await wait(async()=>{const s=await evalAt(popupSid,'chrome.runtime.sendMessage({type:"AUDIO_STATUS"})');if(s.status==='error')throw Error(s.error);return s.status==='recording'&&s.seconds>=6?s:null},15000);
 const offscreen=(await c.call('Target.getTargets')).targetInfos.find(t=>t.url===`chrome-extension://${extensionId}/offscreen.html`);const offscreenSid=await attach(offscreen.targetId);await c.call('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true},offscreenSid);
 record.beforeFinish=await evalAt(pageSid,'({time:document.querySelector("audio").currentTime,paused:document.querySelector("audio").paused})');record.finish=await evalAt(popupSid,'chrome.runtime.sendMessage({type:"AUDIO_FINISH"})');record.stage='real Whisper inference';console.log(record.stage);
 record.result=await wait(async()=>{const s=await evalAt(popupSid,'chrome.runtime.sendMessage({type:"AUDIO_STATUS"})');if(s.status==='error')throw Error(s.error);return s.status==='ready'?s:null},120000);console.log(record.result);
 if(!/local audio test/i.test(record.result.text)||!/sponsored/i.test(record.result.text))throw Error('Known speech was not recognized');
 await c.call('Emulation.setDeviceMetricsOverride',{width:390,height:700,deviceScaleFactor:1,mobile:false},popupSid);await new Promise(r=>setTimeout(r,1000));record.popupViewport=await evalAt(popupSid,'({width:innerWidth,documentWidth:document.documentElement.scrollWidth})');if(record.popupViewport.documentWidth>record.popupViewport.width)throw Error('Popup overflows 390px viewport');await writeFile(path.join(output,'popup.png'),Buffer.from((await c.call('Page.captureScreenshot',{format:'png'},popupSid)).data,'base64'));
 record.afterInference=await evalAt(pageSid,'({time:document.querySelector("audio").currentTime,paused:document.querySelector("audio").paused})');record.workerTargetsAfterInference=(await c.call('Target.getTargets')).targetInfos.filter(t=>t.type==='worker'&&t.url.includes(extensionId)).map(t=>t.url);if(record.workerTargetsAfterInference.length)throw Error('Inference worker survived completion');record.cancel=await evalAt(popupSid,'chrome.runtime.sendMessage({type:"AUDIO_CANCEL"})');record.contextsAfterCancel=await evalAt(swSid,'chrome.runtime.getContexts({contextTypes:["OFFSCREEN_DOCUMENT"]})');record.targetsAfterCancel=(await c.call('Target.getTargets')).targetInfos.filter(t=>t.url.includes(extensionId)).map(t=>({type:t.type,path:new URL(t.url).pathname}));if(record.contextsAfterCancel.length)throw Error('Offscreen context survived Stop');
 record.externalExtensionRequests=record.network.filter(r=>['http:','https:'].includes(r.protocol)&&r.sessionId!==pageSid);if(record.externalExtensionRequests.length)throw Error('Unexpected remote request');record.status='passed';
}catch(e){record.status='failed';record.failure=e.message;console.error(e);process.exitCode=1;}
finally{clearInterval(guard);closing=true;c?.close();await browser?.close();record.finishedAt=new Date().toISOString();record.cleanup='Task browser and isolated profile closed';await writeFile(path.join(output,'evidence.json'),JSON.stringify(record,null,2)+'\n');}
