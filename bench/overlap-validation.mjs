// SPDX-License-Identifier: GPL-3.0-or-later
export function channelFolds(items) {
 const ids=new Set();
 for(const item of items) {
  if(item.split!=='tune')throw Error('Cross-validation accepts tune data only');
  if(!item.f?.channelId||!item.f.videoId)throw Error('Missing channel/video identity');
  if(ids.has(item.f.videoId))throw Error('Duplicate video identity');ids.add(item.f.videoId);
 }
 return [...new Set(items.map(x=>x.f.channelId))].sort().map(channelId=>({channelId,training:items.filter(x=>x.f.channelId!==channelId),validation:items.filter(x=>x.f.channelId===channelId)}));
}
export function selectOperatingPoint(trials,baselineId) {
 const baseline=trials.find(t=>t.id===baselineId);if(!baseline)throw Error('Baseline operating point missing');
 const eligible=trials.filter(t=>t.status==='valid'&&t.summary.metrics[.5].matched>0&&t.summary.metrics[.5].precision>=.95&&Number.isFinite(t.summary.metrics[.5].recall));
 eligible.sort((a,b)=>b.summary.metrics[.5].recall-a.summary.metrics[.5].recall||b.summary.coverageRecall-a.summary.coverageRecall||a.summary.predictedUnknownSeconds-b.summary.predictedUnknownSeconds||Number(b.family==='flow-window-union')-Number(a.family==='flow-window-union')||Math.abs(a.config.threshold-.8)-Math.abs(b.config.threshold-.8)||a.id.localeCompare(b.id));
 return {point:eligible[0]||baseline,reason:eligible.length?'selected':'no_conservative_point'};
}
export function promotionGate({positiveChannels,referenceSegments,baseline,candidate}) {
 const reasons=[];
 if(![positiveChannels,referenceSegments].every(v=>Number.isInteger(v)&&v>=0))reasons.push('invalid_sample_counts');
 if(positiveChannels<3)reasons.push('too_few_positive_channels');
 if(referenceSegments<12)reasons.push('too_few_references');
 if(![candidate.precision,candidate.recall,candidate.coverageRecall,candidate.unknownSeconds,baseline.recall,baseline.coverageRecall,baseline.unknownSeconds].every(Number.isFinite))reasons.push('missing_quality_metric');
 else {
  if(candidate.precision<.95)reasons.push('agreement_precision_below_0.95');
  if(candidate.recall<baseline.recall)reasons.push('recall_regression');
  if(candidate.coverageRecall<=baseline.coverageRecall+1e-8)reasons.push('no_coverage_improvement');
  if(candidate.unknownSeconds>baseline.unknownSeconds+1e-8)reasons.push('more_unknown_prediction_seconds');
 }
 return {eligible:!reasons.length,reasons,automaticSkippingEligible:false,automaticSkippingReason:'Independent fresh test and reviewed negative exposure are separate required gates'};
}
