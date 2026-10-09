import {validateFixture, validatePrediction, CATEGORIES} from './contracts.mjs';
export function union(intervals) {
  const result = [];
  for (const value of [...intervals].sort((a,b) => a.start-b.start || a.end-b.end)) {
    const last = result.at(-1);
    if (last && value.start <= last.end) last.end = Math.max(last.end, value.end);
    else result.push({start:value.start, end:value.end});
  }
  return result;
}
export const seconds = spans => union(spans).reduce((n,s) => n+s.end-s.start, 0);
export function intersection(a,b) {
  const left=union(a), right=union(b), result=[]; let i=0,j=0;
  while(i<left.length && j<right.length) {
    const start=Math.max(left[i].start,right[j].start),end=Math.min(left[i].end,right[j].end);
    if(end>start) result.push({start,end});
    if(left[i].end<right[j].end) i++; else j++;
  }
  return result;
}
export const iou = (a,b) => Math.max(0,Math.min(a.end,b.end)-Math.max(a.start,b.start))/(Math.max(a.end,b.end)-Math.min(a.start,b.start));
// Deterministic maximum-cardinality bipartite matching. Edges ordered by IoU,
// reference index then prediction index; augmenting paths avoid greedy undercount.
export function match(predictions, references, threshold) {
  if(!Number.isFinite(threshold)||threshold<=0||threshold>1)throw new Error('Invalid IoU threshold');
  const edges=predictions.map(p=>references.map((r,j)=>({j,score:p.category===r.category?iou(p,r):0})).filter(e=>e.score>=threshold).sort((a,b)=>b.score-a.score||a.j-b.j));
  const owners = new Map();
  function augment(i, seen) {
    for(const {j} of edges[i]) {
      if(seen.has(j)) continue; seen.add(j);
      if(!owners.has(j)||augment(owners.get(j),seen)) {owners.set(j,i);return true;}
    }
    return false;
  }
  predictions.forEach((_,i)=>augment(i,new Set()));
  return [...owners].map(([reference,prediction])=>({prediction,reference,iou:iou(predictions[prediction],references[reference])})).sort((a,b)=>a.prediction-b.prediction);
}
export const ratio=(a,b)=>b>0?a/b:null;
export function rates(tp,predicted,reference) {
  return {precision:ratio(tp,predicted),recall:ratio(tp,reference),f1:ratio(2*tp,predicted+reference)};
}
export function quantile(values,q) {
  if(!values.length) return null;
  const a=[...values].sort((x,y)=>x-y), p=(a.length-1)*q, l=Math.floor(p);
  return a[l]+(a[Math.ceil(p)]-a[l])*(p-l);
}
function boundaries(errors) {
  const describe=a=>({biasSeconds:ratio(a.reduce((n,v)=>n+v,0),a.length),absoluteMedianSeconds:quantile(a.map(Math.abs),.5),absoluteP95Seconds:quantile(a.map(Math.abs),.95)});
  return {matched:errors.length,start:describe(errors.map(e=>e.start)),end:describe(errors.map(e=>e.end))};
}
export function evaluateVideo(f,p,category='sponsor') {
  validateFixture(f);validatePrediction(p,f);
  if(!CATEGORIES.includes(category)) throw new Error('Invalid evaluation category');
  if(!p.supportedCategories.includes(category)) return {videoId:f.videoId,channelId:f.channelId,category,status:'unsupported_category'};
  const refs=f.referenceSegments.filter(r=>r.category===category&&['reviewed','provisional'].includes(r.status));
  const preds=p.segments.filter(s=>s.category===category);
  const usable=['ok','abstained'].includes(p.status);
  if(!usable) return {videoId:f.videoId,channelId:f.channelId,category,status:p.status,referenceSegments:refs.length,referenceSeconds:seconds(refs)};
  const negative=union(f.reviewedNegativeIntervals);
  const confirmedWhole=preds.filter(s=>seconds(intersection([s],negative))>=s.end-s.start-1e-8);
  const covered=seconds(intersection(preds,refs));
  const metrics={};let boundaryErrors=[];
  for(const threshold of [.3,.5,.7]) {
    const pairs=match(preds,refs,threshold);
    metrics[threshold]={matched:pairs.length,predicted:preds.length,reference:refs.length,...rates(pairs.length,preds.length,refs.length),pairs,
      unmatchedPredictions:preds.map((_,i)=>i).filter(i=>!pairs.some(x=>x.prediction===i)),unmatchedReferences:refs.map((_,i)=>i).filter(i=>!pairs.some(x=>x.reference===i))};
    if(threshold===.5) boundaryErrors=pairs.map(x=>({start:preds[x.prediction].start-refs[x.reference].start,end:preds[x.prediction].end-refs[x.reference].end}));
  }
  const ordinaryRemovedSeconds=seconds(intersection(preds,negative));
  const reviewedNegativeSeconds=seconds(negative);
  return {videoId:f.videoId,channelId:f.channelId,category,status:p.status,referenceQuality:refs.some(r=>r.status==='provisional')?'provisional':'reviewed',
    metrics,referenceSeconds:seconds(refs),coveredReferenceSeconds:covered,missedReferenceSeconds:seconds(refs)-covered,coverageRecall:ratio(covered,seconds(refs)),
    reviewedNegativeSeconds,confirmedFalseSkips:confirmedWhole.length,falseSkipsPerHour:ratio(confirmedWhole.length,reviewedNegativeSeconds/3600),
    ordinaryRemovedSeconds,ordinarySecondsPerHour:ratio(ordinaryRemovedSeconds,reviewedNegativeSeconds/3600),
    predictedUnknownSeconds:seconds(preds)-seconds(intersection(preds,[...f.referenceSegments.filter(r=>['reviewed','provisional'].includes(r.status)),...negative])),boundaries:boundaries(boundaryErrors),boundaryErrors,
    // Unmatched crowd predictions are not established false skips.
    unmatchedPredictionsAgainstAvailableReferences:metrics[.5].unmatchedPredictions.length};
}
export function summarize(rows) {
  const usable=rows.filter(r=>r.metrics), sum=k=>usable.reduce((n,r)=>n+(r[k]||0),0);
  const metrics={};
  for(const threshold of [.3,.5,.7]) {
    const tp=usable.reduce((n,r)=>n+r.metrics[threshold].matched,0), predicted=usable.reduce((n,r)=>n+r.metrics[threshold].predicted,0),reference=usable.reduce((n,r)=>n+r.metrics[threshold].reference,0);
    metrics[threshold]={matched:tp,predicted,reference,...rates(tp,predicted,reference)};
  }
  return {attempted:rows.length,scored:usable.length,statusCounts:rows.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{}),metrics,
    referenceSeconds:sum('referenceSeconds'),coveredReferenceSeconds:sum('coveredReferenceSeconds'),missedReferenceSeconds:sum('missedReferenceSeconds'),coverageRecall:ratio(sum('coveredReferenceSeconds'),sum('referenceSeconds')),
    reviewedNegativeHours:sum('reviewedNegativeSeconds')/3600,confirmedFalseSkips:sum('confirmedFalseSkips'),falseSkipsPerHour:ratio(sum('confirmedFalseSkips'),sum('reviewedNegativeSeconds')/3600),
    ordinaryRemovedSeconds:sum('ordinaryRemovedSeconds'),ordinarySecondsPerHour:ratio(sum('ordinaryRemovedSeconds'),sum('reviewedNegativeSeconds')/3600),
    predictedUnknownSeconds:sum('predictedUnknownSeconds'),boundaries:boundaries(usable.flatMap(r=>r.boundaryErrors)),
    worstOrdinaryLoss:usable.filter(r=>r.ordinaryRemovedSeconds>0).sort((a,b)=>b.ordinaryRemovedSeconds-a.ordinaryRemovedSeconds).slice(0,10).map(r=>({videoId:r.videoId,seconds:r.ordinaryRemovedSeconds})),
    interpretation:'Agreement with available references. Unknown/unreviewed time is not verified ordinary content. Failures excluded from quality, counted in coverage.'};
}
// Seeded channel cluster bootstrap; paired runs reuse seed and channel order.
export function bootstrap(rows, iterations=500, seed=42) {
  const channels=[...new Set(rows.map(r=>r.channelId))].sort();
  if(channels.length<2) return {available:false,reason:'Fewer than two channels'};
  const byChannel=new Map(channels.map(c=>[c,rows.filter(r=>r.channelId===c)]));
  const samples={precision:[],recall:[],coverageRecall:[],ordinarySecondsPerHour:[]};
  const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<iterations;i++) {
    const s=summarize(channels.flatMap(()=>byChannel.get(channels[Math.floor(random()*channels.length)])));
    for(const key of Object.keys(samples)) {const v=key in s?s[key]:s.metrics[.5][key];if(v!==null)samples[key].push(v);}
  }
  return {available:true,channels:channels.length,iterations,seed:42,method:'percentile channel cluster bootstrap; limited precision with few channels',intervals:Object.fromEntries(Object.entries(samples).map(([k,a])=>[k,{low:quantile(a,.025),high:quantile(a,.975),definedReplicates:a.length}]))};
}

export function pairedBootstrap(left,right,iterations=500,seed=42) {
 const rightById=new Map(right.map(r=>[r.videoId,r]));
 const pairs=left.filter(r=>rightById.has(r.videoId)).map(r=>[r,rightById.get(r.videoId)]);
 const channels=[...new Set(pairs.map(([a])=>a.channelId))].sort();
 if(channels.length<2)return {available:false,reason:'Fewer than two shared channels'};
 if(pairs.some(([a,b])=>a.channelId!==b.channelId||a.category!==b.category))throw new Error('Unpaired channel/category');
 const byChannel=new Map(channels.map(c=>[c,pairs.filter(([a])=>a.channelId===c)])),samples={precision:[],recall:[],ordinarySecondsPerHour:[]};
 const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<iterations;i++) {
  const selected=channels.flatMap(()=>byChannel.get(channels[Math.floor(random()*channels.length)]));
  const a=summarize(selected.map(p=>p[0])),b=summarize(selected.map(p=>p[1]));
  for(const key of Object.keys(samples)){const av=key in a?a[key]:a.metrics[.5][key],bv=key in b?b[key]:b.metrics[.5][key];if(av!==null&&bv!==null)samples[key].push(bv-av);}
 }
 return {available:true,channels:channels.length,pairedVideos:pairs.length,iterations,method:'paired channel cluster bootstrap; right minus left',intervals:Object.fromEntries(Object.entries(samples).map(([k,a])=>[k,{low:quantile(a,.025),high:quantile(a,.975),definedReplicates:a.length}]))};
}
