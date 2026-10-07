// Explicitly records unexecuted paths; never fabricates browser compatibility.
import {execFileSync} from 'node:child_process';
import {args,readJson,save,hash,root} from './lib.mjs';
import {resources} from './resources.mjs';
const options=args();if(!options.reason)throw new Error('Explicit --reason required');
const registry=await readJson('bench/models.json'),manifest=await readJson(options.manifest||'bench/datasets/pilot.json'),setup=await readJson('bench/local/setup.json');
for(const spec of registry.models)for(const backend of spec.backends) {
 if(options.models&&!options.models.split(',').includes(spec.id))continue;
 const runId=new Date().toISOString().replace(/[:.]/g,'-')+'-'+spec.id+'-'+backend+'-deferred',memory=await resources(),predictions={};
 for(const v of manifest.videos.filter(v=>v.split===(options.split||'tune'))) {
  const p={videoId:v.videoId,runId,model:spec.id,backend:null,requestedBackend:backend,supportedCategories:spec.supportedCategories,status:v.captionAvailability==='ok'?'resource_deferred':'missing_captions',segments:[],reason:options.reason};
  await save(`bench/results/${runId}/predictions/${v.videoId}.json`,p);predictions[v.videoId]=hash(p);
 }
 await save(`bench/results/${runId}/metadata.json`,{schemaVersion:1,runId,startedAt:new Date().toISOString(),split:options.split||'tune',manifestFile:options.manifest||'bench/datasets/pilot.json',spec,config:spec.decoding,requestedBackend:backend,registryHash:hash(registry),selectionHash:manifest.selectionHash,manifestHash:hash(manifest),fixtureHashes:manifest.videos.map(v=>[v.videoId,v.fixtureHash||null]),runtime:setup.runtime,repositoryCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),status:'deferred',failure:options.reason,initialization:null,predictionHashes:predictions,memory:{before:memory,peakAccountMiB:memory.accountMiB,method:memory.method,scope:memory.scope,gpuMemory:null},evidence:'Not executed. Coverage/deferral ledger only; no browser timing or model compatibility assertion.',priorEvidence:options.evidence?.split(',')||[]});
 console.log('Deferred',runId);
}
