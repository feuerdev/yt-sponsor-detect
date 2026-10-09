// SPDX-License-Identifier: GPL-3.0-or-later
// Pure decoding study over authenticated Chrome logits. No model inference in Node.
import {fileURLToPath,pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {filterExplicitSelfSponsorship} from './adapters/ettin-self-sponsor.mjs';
import {channelFolds,selectOperatingPoint,promotionGate} from './overlap-validation.mjs';
const root=process.env.ETTIN_STUDY_ROOT||fileURLToPath(new URL('../',import.meta.url));
const {args,readJson,save,hash,fixtureFor}=await import(pathToFileURL(root+'/bench/lib.mjs'));
const {validateManifest}=await import(pathToFileURL(root+'/bench/contracts.mjs'));
const {decodeBilou}=await import(pathToFileURL(root+'/bench/adapters/ettin-text.mjs'));
const {evaluateVideo,summarize,bootstrap,pairedBootstrap,seconds,intersection}=await import(pathToFileURL(root+'/bench/evaluate.mjs'));
const {resources,assertHeadroom}=await import(pathToFileURL(root+'/bench/resources.mjs'));
const options=args();
if(options.split&&options.split!=='tune')throw Error('Study accepts tune split only');
const plan=await readJson(options.plan||'bench/experiments/ettin-self-sponsor-v1.json');
const manifest=validateManifest(await readJson(options.manifest||'bench/datasets/pilot.json')),registry=await readJson('bench/models.json');
const baseId='flow/0.8',policy={maximumAccountMiB:28672,minimumAvailableMiB:4096},before=assertHeadroom(await resources(),policy);
const result={schemaVersion:1,registeredPlan:plan,planHash:hash(plan),startedAt:new Date().toISOString(),manifestSelectionHash:manifest.selectionHash,registryHash:hash(registry),scope:'Development tune channels only. Existing test data not read. Cached Chrome logits only, no inference.',resourcePolicy:policy,before,peakAccountMiB:before.accountMiB,backends:[],limitations:['SponsorBlock references are provisional and partial','No reviewed negative exposure','Unknown upstream training overlap','Policy was conceived after inspecting tune examples; folds remain development evidence, not a fresh independent test']};
for(const runId of String(options.runs||'').split(',').filter(Boolean)) {
 const metadata=await readJson('bench/results/'+runId+'/metadata.json');
 if(metadata.split!=='tune'||metadata.spec.id!=='ettin-int8'||metadata.selectionHash!==manifest.selectionHash||metadata.registryHash!==hash(registry))throw Error('Incompatible or exposed/non-tune inference run');
 const cached=[];
 for(const video of manifest.videos.filter(v=>v.split==='tune'&&v.captionAvailability==='ok')) {
  const prediction=await readJson(`bench/results/${runId}/predictions/${video.videoId}.json`);
  if(metadata.predictionHashes?.[video.videoId]!==hash(prediction))throw Error('Prediction hash mismatch');
  if(!['ok','abstained'].includes(prediction.status))continue;
  const cache=await readJson(`bench/results/${runId}/raw/${video.videoId}.json`);
  if(cache.inferenceKey!==metadata.inferenceKey||cache.fixtureHash!==video.fixtureHash||metadata.rawHashes?.[video.videoId]!==hash(cache))throw Error('Raw inference cache identity mismatch');
  cached.push({split:'tune',f:await fixtureFor(video),p:prediction,raw:cache.raw});
 }
 const referenceSegments=cached.reduce((n,c)=>n+c.f.referenceSegments.filter(s=>s.category==='sponsor'&&['reviewed','provisional'].includes(s.status)).length,0);
 const positiveChannels=new Set(cached.filter(c=>c.f.referenceSegments.some(s=>s.category==='sponsor'&&['reviewed','provisional'].includes(s.status))).map(c=>c.f.channelId)).size;
 const points=[],started=performance.now();
 for(const candidate of plan.candidates) {
  const config={threshold:candidate.threshold,mergeGapCharacters:plan.mergeGapCharacters,mergeGapSeconds:plan.mergeGapSeconds},failures=[],rejected=[];
  const rows=cached.map(c=>{
   try {
    const original=decodeBilou(c.raw,config),filtered=candidate.selfSponsorVeto?filterExplicitSelfSponsorship(original,c.f.cues):{segments:original,rejected:[]};
    for(const rejection of filtered.rejected)rejected.push({videoId:c.f.videoId,...rejection,provisionalSelfPromoOverlapSeconds:seconds(intersection([rejection.segment],c.f.referenceSegments.filter(s=>s.category==='selfpromo'&&['reviewed','provisional'].includes(s.status))))});
    const segments=filtered.segments;
    return evaluateVideo(c.f,{...c.p,status:segments.length?'ok':'abstained',segments});
   } catch(e) {failures.push({videoId:c.f.videoId,error:e.message});return evaluateVideo(c.f,{...c.p,status:'invalid_output',segments:[]});}
  });
  points.push({id:candidate.id,family:'flow-window-union',config,selfSponsorVeto:candidate.selfSponsorVeto,status:failures.length?'invalid_output':'valid',failures,rejected,rows,summary:summarize(rows)});
  const sample=assertHeadroom(await resources(),policy);result.peakAccountMiB=Math.max(result.peakAccountMiB,sample.accountMiB);
 }
 if(points.length!==plan.candidateBudget)throw Error('Pre-registered candidate budget mismatch');
 const folds=channelFolds(cached).map(fold=>{
  const trainIds=new Set(fold.training.map(c=>c.f.videoId)),validationIds=new Set(fold.validation.map(c=>c.f.videoId));
  const trainingTrials=points.map(p=>({...p,status:p.failures.some(f=>trainIds.has(f.videoId))?'invalid_output':'valid',summary:summarize(p.rows.filter(r=>trainIds.has(r.videoId)))}));
  const selected=selectOperatingPoint(trainingTrials,baseId),point=points.find(p=>p.id===selected.point.id),baseline=points.find(p=>p.id===baseId);
  return {channelId:fold.channelId,trainingVideos:[...trainIds],validationVideos:[...validationIds],selectedPoint:point.id,selectionReason:selected.reason,rows:point.rows.filter(r=>validationIds.has(r.videoId)),baselineRows:baseline.rows.filter(r=>validationIds.has(r.videoId))};
 });
 const baseline=points.find(p=>p.id===baseId),selected=selectOperatingPoint(points,baseId),crossValidatedRows=folds.flatMap(f=>f.rows),outOfFold=summarize(crossValidatedRows);
 const qualities=s=>({precision:s.metrics[.5].precision,recall:s.metrics[.5].recall,coverageRecall:s.coverageRecall,unknownSeconds:s.predictedUnknownSeconds});
 result.backends.push({runId,backend:metadata.requestedBackend,metadataHash:hash(metadata),inferenceKey:metadata.inferenceKey,rawHashes:metadata.rawHashes,availableTuneVideos:cached.length,totalTuneVideos:manifest.videos.filter(v=>v.split==='tune').length,channels:new Set(cached.map(c=>c.f.channelId)).size,positiveChannels,referenceSegments,baseline:baseline.summary,allTuneSelection:{point:selected.point.id,reason:selected.reason,summary:selected.point.summary,interpretation:'In-sample diagnostic only. This is not a deployment recommendation.'},crossValidation:{folds:folds.map(({rows,baselineRows,...f})=>({...f,summary:summarize(rows),baseline:summarize(baselineRows)})),summary:outOfFold,uncertainty:bootstrap(crossValidatedRows),pairedChange:pairedBootstrap(baseline.rows,crossValidatedRows),promotionGate:promotionGate({positiveChannels,referenceSegments,baseline:qualities(baseline.summary),candidate:qualities(outOfFold)})},points:points.map(({rows,...p})=>p),pureDecodingSeconds:(performance.now()-started)/1000});
}
if(!result.backends.length)throw Error('Explicit compatible tune --runs required');
result.finishedAt=new Date().toISOString();
await save(options.output||'bench/local/ettin-self-sponsor-study.json',result);
for(const backend of result.backends)console.log(JSON.stringify({backend:backend.backend,available:backend.availableTuneVideos,positiveChannels:backend.positiveChannels,allTunePoint:backend.allTuneSelection.point,baseline:backend.baseline.metrics[.5],crossValidation:backend.crossValidation.summary.metrics[.5],promotion:backend.crossValidation.promotionGate}));
