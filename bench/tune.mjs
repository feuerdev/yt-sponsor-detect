import {readdir} from 'node:fs/promises';
import {args,readJson,save,hash,fixtureFor} from './lib.mjs';
import {validateManifest} from './contracts.mjs';
import {evaluateVideo,summarize,bootstrap} from './evaluate.mjs';
import {decode} from './decode.mjs';
const options=args();if(options.split&&options.split!=='tune')throw new Error('Tuning accepts tune split only');
const manifest=validateManifest(await readJson(options.manifest||'bench/datasets/pilot.json')),registry=await readJson('bench/models.json');
const runIds=options.runs?options.runs.split(','):await readdir(new URL('./results/',import.meta.url));
const runs=[];
for(const id of runIds) {
 try {const meta=await readJson(`bench/results/${id}/metadata.json`);if(meta.split==='tune'&&meta.selectionHash===manifest.selectionHash&&meta.registryHash===hash(registry))runs.push(meta);}catch(e){if(options.runs)throw e;}
}
const frozen={schemaVersion:1,frozenAt:new Date().toISOString(),selectionHash:manifest.selectionHash,registryHash:hash(registry),fixtureSetHash:hash(manifest.videos.map(v=>[v.videoId,v.fixtureHash||null])),models:{},
 tuningBudget:'Seven decoder operating points per learned candidate; label wording/windowing fixed before acquisition. No repeated inference for thresholds.',selectionRule:'Diagnostic: greatest recall at observed >=95% provisional segment agreement precision, with at least one match. If none qualifies or no scored videos, preserve published/default configuration and abstain from model selection. This is not a release gate.'};
for(const spec of registry.models)for(const backend of spec.backends) {
 const meta=runs.filter(m=>m.spec.id===spec.id&&m.requestedBackend===backend).sort((a,b)=>b.startedAt.localeCompare(a.startedAt))[0];
 const configs=spec.adapter==='keyword'?[spec.decoding]:[...new Set([spec.decoding.threshold,.5,.6,.7,.8,.9,.95,.99])].map(threshold=>({...spec.decoding,threshold}));
 const trials=[];let available=0;
 if(meta) {
  const cached=[];
  for(const v of manifest.videos.filter(v=>v.split==='tune'&&v.captionAvailability==='ok')) {
   const p=await readJson(`bench/results/${meta.runId}/predictions/${v.videoId}.json`);
   if(p.status!=='ok')continue;
   if(meta.predictionHashes?.[v.videoId]!==hash(p))throw new Error('Prediction integrity mismatch');
   const c=await readJson(`bench/results/${meta.runId}/raw/${v.videoId}.json`);
   if(c.inferenceKey!==meta.inferenceKey||c.fixtureHash!==v.fixtureHash||meta.rawHashes?.[v.videoId]!==hash(c))throw new Error('Inference cache identity/hash mismatch');
   cached.push({f:await fixtureFor(v),p,raw:c.raw});
  }
  available=cached.length;
  for(const config of cached.length?configs:[]) {
   const rows=cached.map(({f,p,raw})=>evaluateVideo(f,{...p,segments:decode(raw,config)},'sponsor'));
   trials.push({config,summary:summarize(rows),uncertainty:bootstrap(rows)});
  }
 }
 const eligible=trials.filter(t=>t.summary.metrics[.5].precision>=.95&&t.summary.metrics[.5].matched>0).sort((a,b)=>b.summary.metrics[.5].recall-a.summary.metrics[.5].recall||b.config.threshold-a.config.threshold);
 const chosen=eligible[0];frozen.models[`${spec.id}/${backend}`]={config:chosen?.config||spec.decoding,tuneRunId:meta?.runId||null,tuneInferenceKey:meta?.inferenceKey||null,availableTuneVideos:available,status:available?(chosen?'diagnostic_operating_point':'no_conservative_operating_point'):'unavailable',trials};
}
await save(options.output||'bench/frozen-config.json',frozen);console.log('Frozen',Object.keys(frozen.models).length,'candidate/backend configurations; available tune fixtures',manifest.videos.filter(v=>v.split==='tune'&&v.captionAvailability==='ok').length);
