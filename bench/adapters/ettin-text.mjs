// SPDX-License-Identifier: GPL-3.0-only
// Behavioral port of the GPLv3 Flow pipeline. See reference/ettin-parity.md.
const word='[\\p{L}\\p{N}_]',digit='\\p{Nd}';
export function normalizeCue(text) {
 return text.replace(/[\s\u0085]+/gu,' ').trim().toLowerCase()
  .replace(new RegExp(`(?<!${word})(?:https?://|www\\.)\\S+|(?<!${word})\\S+\\.(?:com|net|org)\\S*`,'giu'),'URL_TOKEN')
  .replace(new RegExp(`(?<!${word})${digit}+(?:[.,:]${digit}+)*(?!${word})`,'gu'),'NUMBER_TOKEN');
}
function rounded(value){const n=Math.floor(value);return value-n===.5?(n%2?n+1:n):Math.round(value);}
export function normalizeTimed(f) {
 let text='',ranges=[],cursor=0;
 for(const cue of f.cues) {const normalized=normalizeCue(cue.text);if(!normalized)continue;if(text){text+=' ';cursor++;}const length=Array.from(normalized).length;ranges.push({from:cursor,to:cursor+length,start:cue.start*1000,end:cue.end*1000});text+=normalized;cursor+=length;}
 function timestamp(character,endBoundary) {
  if(!ranges.length)throw new Error('Empty normalized transcript');
  let i=ranges.findIndex(r=>r.to>character);if(i<0)i=ranges.length-1;
  if(character<ranges[i].from&&i>0&&endBoundary)i--;
  const r=ranges[i],fraction=Math.max(0,Math.min(1,(character-r.from)/(r.to-r.from)));
  return rounded(r.start+fraction*(r.end-r.start))/1000;
 }
 const timing=[];let char=0;
 for(const cp of text){const span=[timestamp(char,false),timestamp(char+1,true)];for(let i=0;i<cp.length;i++)timing.push(span);char++;}
 return {text,timing};
}
function byteAlphabet() {
 const bytes=[...Array.from({length:94},(_,i)=>i+33),...Array.from({length:12},(_,i)=>i+161),...Array.from({length:82},(_,i)=>i+174)],chars=[...bytes];let extra=0;
 for(let i=0;i<256;i++)if(!bytes.includes(i)){bytes.push(i);chars.push(256+extra++);}
 return new Map(chars.map((c,i)=>[String.fromCodePoint(c),bytes[i]]));
}
export function alignedTokens(tokenizer,text,timing) {
 const encoded=tokenizer.encode(text,{add_special_tokens:false}),alphabet=byteAlphabet(),encoder=new TextEncoder();
 const bytes=[],mapping=[];let cpOffset=0;
 for(const {segment,index} of new Intl.Segmenter('en',{granularity:'grapheme'}).segment(text)) {
  const nfc=segment.normalize('NFC');
  if(nfc===segment){let utf=index;for(const cp of segment){for(const b of encoder.encode(cp)){bytes.push(b);mapping.push({from:cpOffset,to:cpOffset+1,utfFrom:utf,utfTo:utf+cp.length-1});}utf+=cp.length;cpOffset++;}}
  else {const original=Array.from(segment);if(Array.from(nfc).length!==1)throw new Error('Unsupported complex NFC offset mapping');for(const b of encoder.encode(nfc)){bytes.push(b);mapping.push({from:cpOffset,to:cpOffset+1,utfFrom:index,utfTo:index+original[0].length-1});}cpOffset+=original.length;}
 }
 let position=0;const spans=[];
 for(const token of encoded.tokens) {
  const piece=Array.from(token,ch=>alphabet.get(ch));
  if(piece.some(v=>v===undefined)||piece.some((v,j)=>bytes[position+j]!==v))throw new Error('Tokenizer offset parity failed');
  const from=mapping[position],to=mapping[position+piece.length-1];
  if(!from||!to||!timing[from.utfFrom]||!timing[to.utfTo])throw new Error('Invalid token timing');
  spans.push({start:timing[from.utfFrom][0],end:timing[to.utfTo][1],charStart:from.from,charEnd:to.to});position+=piece.length;
 }
 if(position!==bytes.length)throw new Error('Tokenizer did not cover normalized transcript');
 return {ids:encoded.ids,spans};
}
function windowSpans(window) {
 const rows=window.logits?.map(row=>{
  if(row.length!==5||row.some(v=>!Number.isFinite(v)))throw new Error('Invalid Ettin logits');
  const max=Math.max(...row),den=max+Math.log(row.reduce((n,v)=>n+Math.exp(v-max),0));return row.map(v=>v-den);
 })??window.probabilities.map(row=>{if(row.length!==5||row.some(v=>!Number.isFinite(v)||v<0||v>1))throw new Error('Invalid Ettin probabilities');return row.map(v=>Math.log(v));});
 if(rows.length!==window.tokens.length)throw new Error('Ettin token/logit count mismatch');if(!rows.length)return [];
 const predecessors=[[0,3,4],[0,3,4],[1,2],[1,2],[0,3,4]],ends=[0,3,4];
 let scores=rows[0].map((v,i)=>[0,1,4].includes(i)?v:-Infinity);const back=[];
 for(const row of rows.slice(1)){const pointers=predecessors.map(allowed=>allowed.reduce((best,i)=>scores[i]>scores[best]?i:best,allowed[0]));back.push(pointers);scores=row.map((v,i)=>v+scores[pointers[i]]);}
 let chosen=ends.reduce((best,i)=>scores[i]>scores[best]?i:best,ends[0]),labels=[chosen];
 for(const pointers of back.toReversed()){chosen=pointers[chosen];labels.unshift(chosen);}
 const spans=[];
 for(let i=0;i<labels.length;i++) {if(labels[i]===0)continue;let end=i;if(labels[i]===1){end++;while(labels[end]===2)end++;if(labels[end]!==3)throw new Error('Invalid BILOU path');}else if(labels[i]!==4)throw new Error('Invalid BILOU path');
  const first=window.tokens[i],last=window.tokens[end];let logConfidence=0;for(let j=i;j<=end;j++)logConfidence+=rows[j][labels[j]];
  spans.push({start:first.start,end:last.end,charStart:first.charStart,charEnd:last.charEnd,category:'sponsor',score:Math.exp(logConfidence/(end-i+1))});i=end;
 }
 return spans;
}
export function decodeBilou(raw,config) {
 const selected=(raw.windows??[raw]).flatMap(windowSpans).filter(s=>s.score>=config.threshold).sort((a,b)=>a.charStart-b.charStart||a.charEnd-b.charEnd);
 const fused=[];
 for(const span of selected) {const last=fused.at(-1);if(last&&span.charStart<=last.charEnd){last.end=Math.max(last.end,span.end);last.charEnd=Math.max(last.charEnd,span.charEnd);last.score=Math.max(last.score,span.score);}else fused.push({...span});}
 const merged=[];
 for(const span of fused){const last=merged.at(-1);if(last&&span.charStart-last.charEnd<=config.mergeGapCharacters&&span.start-last.end<=config.mergeGapSeconds){last.end=span.end;last.charEnd=span.charEnd;last.score=Math.max(last.score,span.score);}else merged.push({...span});}
 return merged.filter(s=>s.end>s.start).map(({start,end,category,score})=>({start,end,category,score}));
}
