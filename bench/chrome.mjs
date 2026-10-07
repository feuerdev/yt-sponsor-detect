// Minimal CDP controller avoids a second automation daemon on constrained hosts.
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
export function chromeFlags({profile,cpuOnly=false,singleProcess=false,platform=process.platform}) {
 const flags=['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','--disable-sync','--disable-default-apps','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--no-startup-window',`--user-data-dir=${profile}`];
 if(platform==='linux')flags.push('--no-sandbox');
 if(singleProcess)flags.push('--single-process','--no-zygote');
 if(cpuOnly)flags.push('--disable-gpu','--disable-software-rasterizer');
 return flags;
}
export async function launchChrome({executable,profileParent,url,cpuOnly=false,singleProcess=false,readyExpression='window.benchmarkReady===true',onSample,onEvent,commandTimeoutMs=15000}) {
 const profile=await mkdtemp(path.join(profileParent,'chrome-'));
 const flags=chromeFlags({profile,cpuOnly,singleProcess});
 const child=spawn(executable,flags,{stdio:['ignore','ignore','pipe']});
 let ws,closed=false,timer,pending=new Map(),nextId=1,sessionId;
 async function close() {
  if(closed)return;closed=true;clearInterval(timer);
  if(ws?.readyState===WebSocket.OPEN){try{await Promise.race([call('Browser.close'),new Promise(r=>setTimeout(r,1500))]);}catch{}ws.close();}
  if(child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,1500))]);}
  if(child.exitCode===null)child.kill('SIGKILL');
  for(const {reject,timer} of pending.values()){clearTimeout(timer);reject(new Error('Browser closed'));}pending.clear();
  await rm(profile,{recursive:true,force:true});
 }
 function call(method,params={},targetSession=undefined) {
  return new Promise((resolve,reject)=>{const id=nextId++,timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method));},commandTimeoutMs);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,...(targetSession?{sessionId:targetSession}:{})}));});
 }
 try {
  timer=setInterval(()=>{Promise.resolve(onSample?.()).catch(()=>close());},250);
  const endpoint=await new Promise((resolve,reject)=>{
   let stderr='';const deadline=setTimeout(()=>reject(new Error('Chrome startup timeout')),20000);
   child.once('error',e=>{clearTimeout(deadline);reject(e);});child.once('exit',()=>{clearTimeout(deadline);reject(new Error('Chrome exited before CDP ready: '+stderr.slice(-1500)));});
   child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-4000);const m=stderr.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[^\s]+)/);if(m){clearTimeout(deadline);resolve(m[1]);}});
  });
  ws=new WebSocket(endpoint);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}else if(m.method&&m.sessionId===sessionId)onEvent?.(m);});
  ws.addEventListener('close',()=>{for(const {reject,timer} of pending.values()){clearTimeout(timer);reject(new Error('CDP connection closed'));}pending.clear();});
  const {targetId}=await call('Target.createTarget',{url:'about:blank'});
  ({sessionId}=await call('Target.attachToTarget',{targetId,flatten:true}));
  await call('Page.enable',{},sessionId);await call('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false},sessionId);await call('Page.navigate',{url},sessionId);
  const evalScript=async expression=>{
   const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);
   if(r.exceptionDetails)throw new Error(r.exceptionDetails.text+': '+r.exceptionDetails.exception?.description);return r.result.value;
  };
  for(let i=0;i<100;i++){if(await evalScript(readyExpression))break;if(i===99)throw new Error('Runner module not ready');await new Promise(r=>setTimeout(r,100));}
  return {flags,version:await call('Browser.getVersion'),command:(method,params)=>call(method,params,sessionId),eval:evalScript,clickAt:async(x,y)=>{if(!Number.isFinite(x)||!Number.isFinite(y))throw new Error('Invalid click coordinates');await call('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1},sessionId);await call('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1},sessionId);},screenshot:async()=>Buffer.from((await call('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'),close};
 }catch(e){await close();throw e;}
}
