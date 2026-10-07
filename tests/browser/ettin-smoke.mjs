// Installed extension smoke only. No Node model inference. See docs/ettin-integration.md.
import {readFile,writeFile,mkdir}from'node:fs/promises';
import {execFileSync}from'node:child_process';
import {connect}from'./cdp-client.mjs';
import {nativeChrome}from'./native-chrome.mjs';
import {resources,requireHeadroom,assertHeadroom}from'../../bench/resources.mjs';
import {fileURLToPath}from'node:url';
import {resolve}from'node:path';
const repo=fileURLToPath(new URL('../../',import.meta.url)),out=resolve(process.env.ETTIN_SMOKE_OUTPUT||repo+'/bench/local/extension-evidence'),mode=process.argv[2]||'gpu';
if(!['gpu','cpu'].includes(mode))throw Error('Expected gpu or cpu mode');
await mkdir(out,{recursive:true});
const policy={maximumAccountMiB:28672,minimumAvailableMiB:4096},before=await requireHeadroom(policy),record={mode,policy,before,peakAccountMiB:before.accountMiB,startedAt:new Date().toISOString(),scope:'Installed production MV3 bundle, real model; synthetic English caption/player fixture. Network responses fulfilled only in this fresh browser. No public YouTube or held-out quality claim.'};
const f=JSON.parse(await readFile(repo+'/bench/fixtures/synthetic01.json'));
const json3=JSON.stringify({events:f.cues.map(c=>({tStartMs:c.start*1000,dDurationMs:(c.end-c.start)*1000,segs:[{utf8:c.text}]}))});
const mp4=await readFile(process.env.ETTIN_SMOKE_MEDIA||repo+'/bench/local/ettin-fixture.mp4');
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><title>Ettin installed extension smoke</title><style>body{font:17px system-ui;background:#101722;color:#eef4ff;margin:32px auto;max-width:1000px}h1{font-size:28px}p{color:#b5c4dc}button{font:inherit;padding:8px 14px;cursor:pointer}#movie_player{position:relative;width:800px;margin-top:20px}video{display:block;width:800px}.ytp-progress-bar{height:12px;position:relative;background:#35465e}pre{padding:15px;background:#1c2a3e;border-radius:10px}</style><h1>Ettin INT8 · installed Chrome extension</h1><p>Actual production bundle and local model. Synthetic English captions and video.<br>Manual suggestions only; this is runtime evidence, not detection accuracy.</p><button id="run">Analyze synthetic captions</button><pre id="result">Ready.</pre><div id="movie_player"><video src="https://www.youtube.com/proof.mp4" controls muted preload="auto"></video><div class="ytp-progress-bar"></div></div><script>document.querySelector('#run').onclick=()=>fetch('https://www.youtube.com/api/timedtext?v=synthetic01&lang=en&fmt=json3').then(r=>r.text());</script></html>`;
const native=await nativeChrome(mode),endpoint=native.endpoint;record.nativeFlags=native.flags;
const errors=[],network=[];let c,guardFailure=null,closing=false;
c=await connect(endpoint,m=>{
 if(m.method==='Target.targetCreated'&&(m.params.targetInfo.type==='worker'||m.params.targetInfo.url.endsWith('/offscreen.html'))){c.call('Target.attachToTarget',{targetId:m.params.targetInfo.targetId,flatten:true}).then(async({sessionId})=>{await c.call('Runtime.enable',{},sessionId);await c.call('Network.enable',{},sessionId);}).catch(e=>{if(!closing)errors.push(e.message);});}
 if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text+': '+(m.params.exceptionDetails.exception?.description||''));
 if(m.method==='Network.requestWillBeSent')network.push(m.params.request.url);
 if(m.method==='Fetch.requestPaused'){
  const url=m.params.request.url;let body,type;
  if(url.includes('/api/timedtext')){body=Buffer.from(json3);type='application/json';}
  else if(url==='https://www.youtube.com/proof.mp4'){body=mp4;type='video/mp4';}
  else if(url.startsWith('https://www.youtube.com/watch?')){body=Buffer.from(html);type='text/html';}
  else {c.call('Fetch.failRequest',{requestId:m.params.requestId,errorReason:'Aborted'},m.sessionId).catch(e=>{if(!closing)errors.push(e.message);});return;}
  let responseCode=200;const responseHeaders=[{name:'Content-Type',value:type}];
  if(type==='video/mp4'){
    responseHeaders.push({name:'Accept-Ranges',value:'bytes'});
    const range=m.params.request.headers.Range||m.params.request.headers.range;
    if(range){const match=range.match(/bytes=(\d+)-(\d*)/),start=Number(match[1]),end=match[2]?Number(match[2]):body.length-1;responseCode=206;responseHeaders.push({name:'Content-Range',value:'bytes '+start+'-'+end+'/'+body.length});body=body.subarray(start,end+1);}
  }
  responseHeaders.push({name:'Content-Length',value:String(body.length)});
  c.call('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode,responseHeaders,body:body.toString('base64')},m.sessionId).catch(e=>{if(!closing)errors.push(e.message);});
 }
});
const guard=setInterval(async()=>{try{const r=await resources();record.peakAccountMiB=Math.max(record.peakAccountMiB,r.accountMiB);assertHeadroom(r,policy);}catch(e){guardFailure=e;}},2000);
const evalAt=async(sid,expression)=>{const r=await c.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sid);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
const attach=async id=>(await c.call('Target.attachToTarget',{targetId:id,flatten:true})).sessionId;
try{
 await c.call('Target.createTarget',{url:'about:blank'});execFileSync('agent-browser',['--session','ettin-extension','connect',endpoint],{stdio:'inherit'});
 await c.call('Target.setDiscoverTargets',{discover:true});
 const {id}=await c.call('Extensions.loadUnpacked',{path:repo+'/dist'});record.extensionId=id;
 let targets;for(let i=0;i<30;i++){targets=(await c.call('Target.getTargets')).targetInfos;if(targets.some(t=>t.type==='service_worker'&&t.url===`chrome-extension://${id}/background.js`))break;await new Promise(r=>setTimeout(r,100));}
 const sw=targets.find(t=>t.type==='service_worker'&&t.url===`chrome-extension://${id}/background.js`);if(!sw)throw Error('Installed background worker missing');const sid=await attach(sw.targetId);
 await c.call('Runtime.enable',{},sid);await c.call('Network.enable',{},sid);await c.call('Fetch.enable',{patterns:[{urlPattern:'https://www.youtube.com/*'}]},sid);
 await evalAt(sid,"chrome.storage.local.clear().then(()=>chrome.storage.sync.set({isEnabled:true,autoSkip:false,labels:[{name:'sponsor',threshold:0.8,blocked:true}]})).then(()=>true)");
 const page=targets.find(t=>t.type==='page'&&t.url==='about:blank');if(!page)throw Error('Fixture page missing');const pageSid=await attach(page.targetId);
 await c.call('Runtime.enable',{},pageSid);await c.call('Network.enable',{},pageSid);await c.call('Fetch.enable',{patterns:[{urlPattern:'https://www.youtube.com/*'}]},pageSid);await c.call('Page.navigate',{url:'https://www.youtube.com/watch?v=synthetic01'},pageSid);
 for(let i=0;i<30;i++){if(await evalAt(pageSid,"!!document.getElementById('run')"))break;await new Promise(r=>setTimeout(r,100));}
 execFileSync('agent-browser',['--session','ettin-extension','click','#run'],{stdio:'inherit'});
 let cache=null;for(let i=0;i<60;i++){if(guardFailure)throw guardFailure;cache=await evalAt(sid,"chrome.storage.local.get('sponsor-cache:synthetic01').then(r=>r['sponsor-cache:synthetic01']||null)");if(cache?.complete)break;await new Promise(r=>setTimeout(r,1000));}
 if(!cache?.complete)throw Error('No completed inference/cache result');if(cache.backend!==(mode==='gpu'?'webgpu':'wasm'))throw Error('Unexpected actual backend '+cache.backend);
 record.defaultThresholdResult=cache;
 if(!cache.segments.length){
  const oldKey=cache.policyKey;record.manualControlThreshold=0.7;
  await evalAt(sid,"chrome.storage.sync.set({labels:[{name:'sponsor',threshold:0.7,blocked:true}]}).then(()=>true)");
  await new Promise(r=>setTimeout(r,100));
  execFileSync('agent-browser',['--session','ettin-extension','click','#run'],{stdio:'inherit'});
  for(let i=0;i<30;i++){cache=await evalAt(sid,"chrome.storage.local.get('sponsor-cache:synthetic01').then(r=>r['sponsor-cache:synthetic01']||null)");if(cache?.complete&&cache.policyKey!==oldKey)break;await new Promise(r=>setTimeout(r,500));}
 }
 if(!cache?.segments?.length)throw Error('No diagnostic suggestion for manual controls');
 record.adapter=await evalAt(pageSid,"navigator.gpu?navigator.gpu.requestAdapter().then(a=>a?{vendor:a.info.vendor,architecture:a.info.architecture,isFallbackAdapter:a.info.isFallbackAdapter}:null):null");if(mode==='gpu'&&(record.adapter?.isFallbackAdapter!==false||record.adapter?.vendor!=='apple'))throw Error('GPU path did not use native Apple adapter');
 record.cache=cache;record.browser=await c.call('Browser.getVersion');record.launch=await c.call('Browser.getBrowserCommandLine');record.network={requestCount:network.length,externalModelRequests:network.filter(u=>/^https?:/.test(u)&&!u.startsWith('https://www.youtube.com/'))};
 await evalAt(pageSid,"document.querySelector('video').pause();document.querySelector('video').currentTime=1.5;document.querySelector('video').dispatchEvent(new Event('timeupdate'));document.querySelector('#result').textContent="+JSON.stringify('PASS: '+cache.backend+' graph inference; '+cache.segments.length+' paid-sponsor suggestions; full local MV3 messaging/cache flow.'));
 execFileSync('agent-browser',['--session','ettin-extension','screenshot',out+'/ettin-extension-'+mode+'.png'],{stdio:'inherit'});
 for(let i=0;i<50;i++){if(await evalAt(pageSid,"!document.querySelector('video').seeking && Math.abs(document.querySelector('video').currentTime-1.5)<.01"))break;await new Promise(r=>setTimeout(r,50));}
 const beforeSkip=await evalAt(pageSid,"document.querySelector('video').currentTime");
 execFileSync('agent-browser',['--session','ettin-extension','click','#sponsor-skip-suggestion button'],{stdio:'inherit'});
 for(let i=0;i<50;i++){if(await evalAt(pageSid,"!document.querySelector('video').seeking && document.querySelector('video').currentTime>1.5"))break;await new Promise(r=>setTimeout(r,50));}
 const afterSkip=await evalAt(pageSid,"document.querySelector('video').currentTime");
 execFileSync('agent-browser',['--session','ettin-extension','click','#sponsor-undo-notice button'],{stdio:'inherit'});
 for(let i=0;i<50;i++){if(await evalAt(pageSid,"!document.querySelector('video').seeking && Math.abs(document.querySelector('video').currentTime-1.5)<.01"))break;await new Promise(r=>setTimeout(r,50));}
 const afterUndo=await evalAt(pageSid,"document.querySelector('video').currentTime");record.playback={beforeSkip,afterSkip,afterUndo};if(afterSkip<=beforeSkip||Math.abs(afterUndo-beforeSkip)>.01)throw Error('Skip/Undo failed');
 await evalAt(pageSid,"document.querySelector('#result').textContent+='; PASS: manual Skip and Undo restored '+document.querySelector('video').currentTime+' seconds';");
 execFileSync('agent-browser',['--session','ettin-extension','screenshot',out+'/ettin-extension-'+mode+'-undo.png'],{stdio:'inherit'});
 await evalAt(sid,"chrome.storage.sync.set({isEnabled:false,autoSkip:true,labels:[{name:'contains sponsored content',threshold:0.98,blocked:false},{name:'regular content',threshold:0.9,blocked:false}]}).then(()=>true)");
 await c.call('Fetch.disable',{},pageSid);
 await c.call('Emulation.setDeviceMetricsOverride',{width:390,height:700,deviceScaleFactor:1,mobile:false},pageSid);
 await c.call('Page.navigate',{url:'chrome-extension://'+id+'/popup.html'},pageSid);
 for(let i=0;i<40;i++){if(await evalAt(pageSid,"document.getElementById('threshold-value')?.textContent==='0.8'"))break;await new Promise(r=>setTimeout(r,100));}
 record.popup=await evalAt(pageSid,"chrome.storage.sync.get().then(settings=>({settings,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,enabled:document.getElementById('enabled-checkbox').checked,sponsorEnabled:document.getElementById('sponsor-checkbox').checked,threshold:document.getElementById('sponsor-threshold').value,customLabels:!!document.getElementById('add-label-btn')}))");
 if(record.popup.enabled||record.popup.sponsorEnabled||record.popup.threshold!=='0.8'||record.popup.settings.autoSkip!==false||record.popup.customLabels||record.popup.scrollWidth>record.popup.width)throw Error('Popup migration/layout failed');
 execFileSync('agent-browser',['--session','ettin-extension','screenshot',out+'/ettin-popup-'+mode+'.png'],{stdio:'inherit'});
 if(errors.length)throw Error('Browser runtime/instrumentation errors: '+errors.join('; '));
 if(guardFailure)throw guardFailure;assertHeadroom(await resources(),policy);
 record.status='passed';record.errors=errors;
}catch(e){record.status='failed';record.error=e.message;record.errors=errors;console.error('EXTENSION SMOKE FAILURE:',e.message);process.exitCode=1;}
finally{closing=true;clearInterval(guard);c.close();try{execFileSync('agent-browser',['--session','ettin-extension','close'],{stdio:'inherit'});}catch{}await native.close();await mkdir(out,{recursive:true});await writeFile(out+'/ettin-extension-'+mode+'.json',JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record,null,2));}
