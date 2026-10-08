import {readFile,writeFile,mkdir,appendFile,stat} from 'node:fs/promises';
import {execFile,execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import os from 'node:os';
import path from 'node:path';
import {args,root,readJson,save,hash,fixtureFor} from './lib.mjs';
import {validateManifest,validateFixture} from './contracts.mjs';
import {lockTestExposure} from './test-exposure-lock.mjs';
import {resources,requireHeadroom,resourcePolicy,assertHeadroom} from './resources.mjs';
import {verifyAssets} from '../scripts/model-assets.mjs';
import {createServer,staticResponse} from './serve.mjs';
import {launchChrome} from './chrome.mjs';
const exec=promisify(execFile),options=args();const policy=resourcePolicy(options);
function hasHeadroom(sample){try{assertHeadroom(sample,policy);return true;}catch{return false;}}

const registry=await readJson('bench/models.json'),spec=registry.models.find(m=>m.id===(options.model||'mobilebert-int8'));
if(!spec)throw new Error('Unknown model');
const backend=options.backend||spec.backends[0],split=options.split||'smoke';
if(!['tune','test','smoke'].includes(split))throw new Error('Invalid split');
const manifest=validateManifest(await readJson(options.manifest||(split==='smoke'?'bench/datasets/synthetic.json':'bench/datasets/pilot.json')));
let videos=manifest.videos.filter(v=>v.split===split);
if(options.limit) {if(split!=='smoke')throw new Error('Limits only allowed on smoke data');videos=videos.slice(0,Number(options.limit));}
const frozen=options.config?await readJson(options.config):null;
if(split==='test'&&!frozen)throw new Error('Test runs require frozen configuration');
if(frozen&&frozen.fixtureSetHash!==hash(manifest.videos.map(v=>[v.videoId,v.fixtureHash||null])))throw new Error('Frozen fixture set mismatch');
if(frozen&&(frozen.selectionHash!==manifest.selectionHash||frozen.registryHash!==hash(registry)))throw new Error('Frozen registry/split mismatch');
const testLedgerPath=options['test-ledger']||'bench/local/test-ledger.json';
const config=frozen?.models?.[`${spec.id}/${backend}`]?.config||spec.decoding;
if(split==='test'&&!frozen?.models?.[`${spec.id}/${backend}`])throw new Error('Candidate missing from frozen configuration');
const runId=options['run-id']||new Date().toISOString().replace(/[:.]/g,'-')+'-'+spec.id+'-'+backend;
if(!/^[A-Za-z0-9_-]+$/.test(runId))throw new Error('Unsafe run ID');
if(split==='test')await lockTestExposure({file:testLedgerPath,expectedFile:manifest.reviewExposureLedgerPath,frozen,selectionHash:manifest.selectionHash,runId});
const directory=path.join(root,'bench/results',runId);await mkdir(path.dirname(directory),{recursive:true});await mkdir(directory,{recursive:false});
const initial=await requireHeadroom(policy);
const setup=await readJson('bench/local/setup.json');
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const sourceDiff=execFileSync('git',['diff','--binary','HEAD'],{cwd:root,encoding:'utf8'});
const sourceFiles=execFileSync('git',['ls-files','--others','--exclude-standard','bench'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
const untrackedHashes=[];for(const file of sourceFiles)untrackedHashes.push([file,hash(await readFile(path.join(root,file)))]);
const meta={schemaVersion:1,runId,testLedgerPath:split==='test'?testLedgerPath:null,startedAt:new Date().toISOString(),split,spec,config,manifestFile:options.manifest||(split==='smoke'?'bench/datasets/synthetic.json':'bench/datasets/pilot.json'),requestedBackend:backend,registryHash:hash(registry),selectionHash:manifest.selectionHash||null,manifestHash:hash(manifest),configHash:hash(config),
 inferenceKey:hash({spec,backend,fixtures:videos.map(v=>[v.videoId,v.fixtureHash]),runtime:setup.runtime,sourceDiffHash:hash(sourceDiff),untrackedHashes}),runtime:setup.runtime,repositoryCommit:commit,sourceDiffHash:hash(sourceDiff),untrackedSourceHashes:untrackedHashes,
 fixtureHashes:videos.map(v=>[v.videoId,v.fixtureHash||null]),host:{platform:os.platform(),arch:os.arch(),cpus:os.cpus().map(c=>c.model),totalMemoryBytes:os.totalmem()},
 memory:{policy,before:initial,peakAccountMiB:initial.accountMiB,minimumAvailableMiB:initial.availableMiB,method:initial.method,scope:initial.scope,gpuMemory:null},
 timingMethod:'Browser performance.now; fresh browser process per candidate; OS file cache unspecified. Inference sequential. Warm repeat only when explicitly selected; screenshots/orchestration excluded.',status:'running'};
await save(`bench/results/${runId}/metadata.json`,meta);
// An unsupported provider can be probed without downloading/loading its graph.
if(spec.files.length&&spec.backends.includes(backend)&&backend!=='webgpu')await verifyAssets(path.join(root,'bench/assets',spec.directory),spec);
const fixtures=new Map();for(const v of videos)if(v.captionAvailability==='ok')fixtures.set(v.videoId,validateFixture(await fixtureFor(v)));
const predictions=new Map();let done=false,fatal=null,server;
const session='sponsor-bench-'+runId;let direct=null;
const agentBrowser=async(...command)=>(await exec('agent-browser',['--session',session,...command],{cwd:root,timeout:40000,maxBuffer:2*1024*1024,env:{...process.env,AGENT_BROWSER_WEBGPU:'',AGENT_BROWSER_IDLE_TIMEOUT_MS:'120000'}})).stdout;
server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/job'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({runId,spec,backend,config,videos,warmRepeat:!!options['warm-repeat']}));return;}
 if(url.pathname.startsWith('/fixture/')){const f=fixtures.get(url.pathname.slice(9));if(!f){res.writeHead(404);res.end();return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify(f));return;}
 if(url.pathname==='/result'&&req.method==='POST') {
  if(req.headers.origin!==`http://127.0.0.1:${server.address().port}`||!req.headers['content-type']?.startsWith('application/json')){res.writeHead(403);res.end();return;}
  const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>32*1024*1024)throw new Error('Oversized result');chunks.push(chunk);}
  const item=JSON.parse(Buffer.concat(chunks));
  if(item.type==='initialization'){meta.initialization=item;await save(`bench/results/${runId}/metadata.json`,meta);console.log('Initialization',JSON.stringify(item));}
  else if(item.type==='prediction') {
   const p=item.prediction;if(!videos.some(v=>v.videoId===p.videoId))throw new Error('Unknown result video');
   predictions.set(p.videoId,p);await save(`bench/results/${runId}/predictions/${p.videoId}.json`,p);(meta.predictionHashes??={})[p.videoId]=hash(p);
   if(item.raw){const cached={inferenceKey:meta.inferenceKey,fixtureHash:videos.find(v=>v.videoId===p.videoId).fixtureHash,raw:item.raw};await save(`bench/results/${runId}/raw/${p.videoId}.json`,cached);(meta.rawHashes??={})[p.videoId]=hash(cached);}
   console.log(p.videoId,p.status,Math.round(p.timings?.inferenceMs||0)+' ms');
  }else if(item.type==='done')done=true;else if(item.type==='fatal'){fatal=item.error;done=true;}
  res.end('saved');return;
 }
 await staticResponse(req,res);
});
try {
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const address=`http://127.0.0.1:${server.address().port}`;
 console.log('Run',runId,address);
 if(options.chrome) {
  direct=await launchChrome({executable:options.chrome,profileParent:path.join(root,'bench/local'),url:address+'/bench/browser/index.html',cpuOnly:backend!=='webgpu'&&options['browser-gpu-policy']!=='default',singleProcess:!!options['single-process'],onSample:async()=>{const r=await resources();meta.memory.peakAccountMiB=Math.max(meta.memory.peakAccountMiB,r.accountMiB);meta.memory.minimumAvailableMiB=Math.min(meta.memory.minimumAvailableMiB,r.availableMiB);if(!hasHeadroom(r)){fatal='resource_deferred: conservative browser guard';throw new Error(fatal);}}});
  meta.browserLaunch={controller:'minimal CDP',flags:direct.flags,version:direct.version};await direct.eval('window.startBenchmark()');
 }else {await agentBrowser('open',address+'/bench/browser/index.html');await agentBrowser('eval','window.startBenchmark()');}
 const deadline=Date.now()+Number(options['timeout-seconds']||600)*1000;
 while(!done&&!fatal) {
  await new Promise(r=>setTimeout(r,500));const r=await resources();
  meta.memory.peakAccountMiB=Math.max(meta.memory.peakAccountMiB,r.accountMiB);meta.memory.minimumAvailableMiB=Math.min(meta.memory.minimumAvailableMiB,r.availableMiB);
  if(!hasHeadroom(r)){fatal='resource_deferred: browser closed at conservative resource margin';break;}
  if(Date.now()>deadline){fatal='timeout: workload not completed';break;}
 }
 if(!fatal){if(direct)await writeFile(path.join(directory,'runner.png'),await direct.screenshot());else await agentBrowser('screenshot',path.join(directory,'runner.png'));}
 meta.status=fatal?'incomplete':'complete';meta.failure=fatal;meta.completedAt=new Date().toISOString();
}catch(e){meta.status='incomplete';meta.failure=fatal||String(e.message).slice(0,3000);}
finally {
 try{if(direct)await direct.close();else if(!options.chrome)await agentBrowser('close');}catch(e){meta.cleanupFailure=String(e.message).slice(0,500);}
 if(server.listening)await new Promise(r=>server.close(r));
 for(const v of videos)if(!predictions.has(v.videoId))await save(`bench/results/${runId}/predictions/${v.videoId}.json`,{videoId:v.videoId,runId,model:spec.id,backend:null,requestedBackend:backend,supportedCategories:spec.supportedCategories,status:meta.failure?.startsWith('resource_deferred')?'resource_deferred':'inference_failure',segments:[],reason:meta.failure||'Missing browser response'});
 await save(`bench/results/${runId}/metadata.json`,meta);
 console.log('Saved',runId,meta.status,'peak account MiB',meta.memory.peakAccountMiB.toFixed(1));
}
if(meta.status!=='complete')process.exitCode=1;
