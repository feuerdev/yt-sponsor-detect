import {validateFixture,validatePrediction} from '../contracts.mjs';
const state=document.querySelector('#state'),runs=document.querySelector('#runs');
const environment={userAgent:navigator.userAgent,platform:navigator.platform,logicalProcessors:navigator.hardwareConcurrency,deviceMemoryGiB:navigator.deviceMemory??null,gpuApi:!!navigator.gpu,context:'isolated localhost browser page with MV3-like script/WASM CSP; not an installed extension'};
document.querySelector('#environment').textContent=JSON.stringify(environment,null,2);
const send=async(value)=>{const r=await fetch('/result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});if(!r.ok)throw new Error('Result save failed');};
window.benchmarkReady=true;
window.startBenchmark=()=>{window.benchmarkTask=execute().catch(async e=>{state.textContent='Runner failure: '+e.message;await send({type:'fatal',error:e.message});});return true;};
async function execute() {
 const job=await (await fetch('/job')).json();state.textContent=`Loading ${job.spec.id} · ${job.backend}`;
 const started=performance.now();let adapter=null,initError=null;
 try {if(!job.videos.some(v=>v.captionAvailability==='ok'))throw Object.assign(new Error('No acquired captions; graph loading intentionally deferred'),{status:'missing_captions'});const module=await import(`../adapters/${job.spec.adapter}.mjs`);adapter=await module.initialize(job.spec,job.backend);}
 catch(e){initError={status:e.status||'initialization_failure',reason:String(e.message).slice(0,2000)};}
 const coldLoadMs=performance.now()-started;
 await send({type:'initialization',environment,coldLoadMs,actualBackend:adapter?.backend??null,error:initError});
 let maxLagMs=0,expected=performance.now()+50;
 const heartbeat=setInterval(()=>{const now=performance.now();maxLagMs=Math.max(maxLagMs,now-expected);expected=now+50;},50);
 try {
  for(const item of job.videos) {
   state.textContent=`${job.spec.id} · ${item.videoId} · ${initError?.status??'analyzing'}`;
   const p={videoId:item.videoId,runId:job.runId,model:job.spec.id,backend:adapter?.backend??null,requestedBackend:job.backend,supportedCategories:job.spec.supportedCategories,status:'ok',segments:[],timings:{coldLoadMs,maxMainThreadLagMs:0}};
   let raw=null,f=null;
   if(item.captionAvailability!=='ok')p.status='missing_captions';
   else if(initError){p.status=initError.status;p.reason=initError.reason;}
   else {
    f=validateFixture(await (await fetch(`/fixture/${item.videoId}`)).json());const t=performance.now();
    try {
     raw=await adapter.infer(f);p.timings.inferenceMs=performance.now()-t;const d=performance.now();p.segments=adapter.decode(raw,job.config);p.timings.decodeMs=performance.now()-d;
     p.timings.timeToFirstUsableMs=performance.now()-started;p.timings.fullVideoMs=p.timings.inferenceMs+p.timings.decodeMs;
     try {validatePrediction(p,f);}catch(e){p.status='invalid_output';p.reason=e.message;p.segments=[];}
     if(job.warmRepeat&&p.status==='ok') {const w=performance.now();await adapter.infer(f);p.timings.warmRepeatInferenceMs=performance.now()-w;}
    }catch(e){p.status=e.status||'inference_failure';p.reason=String(e.message).slice(0,2000);p.segments=[];}
   }
   p.timings.maxMainThreadLagMs=maxLagMs;p.timings.jsHeapBytes=performance.memory?.usedJSHeapSize??null;
   await send({type:'prediction',prediction:p,raw});
   const row=document.createElement('pre');row.textContent=JSON.stringify({videoId:p.videoId,status:p.status,backend:p.backend,timings:p.timings,segments:p.segments,reason:p.reason},null,2);runs.prepend(row);
  }
 }finally {clearInterval(heartbeat);if(adapter)await adapter.dispose();}
 state.textContent=`Completed ${job.spec.id} · ${job.videos.length} attempted videos`;
 await send({type:'done',environment});window.benchmarkDone=true;
}
