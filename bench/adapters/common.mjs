export function mergeSegments(spans,gap=0) {
 const result=[];
 for(const s of [...spans].sort((a,b)=>a.start-b.start||a.end-b.end)) {
  const last=result.at(-1);
  if(last&&last.category===s.category&&s.start-last.end<=gap) {last.end=Math.max(last.end,s.end);last.score=Math.max(last.score??0,s.score??0);}else result.push({...s});
 }
 return result;
}
export function softmax(values) {
 if(Array.from(values).some(v=>!Number.isFinite(v)))throw Object.assign(new Error('Invalid non-finite logits'),{status:'invalid_output'});
 const max=Math.max(...values),out=Array.from(values,v=>Math.exp(v-max)),sum=out.reduce((a,b)=>a+b,0);return out.map(v=>v/sum);
}
export function cueWords(fixture) {
 return fixture.cues.flatMap(c=>{
  const words=[...c.text.matchAll(/\S+/gu)];
  return words.map(w=>[w[0],Math.round((c.start+(c.end-c.start)*w.index/c.text.length)*1000)]);
 });
}
export function decodeWindows(raw,threshold,gap=0) {
 return mergeSegments(raw.windows.flatMap(w=>Object.entries(w.scores).filter(([,s])=>s>=threshold).map(([category,score])=>({start:w.start,end:w.end,category,score}))),gap);
}
