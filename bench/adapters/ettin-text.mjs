// Approximate published normalization. Exact Flow parity remains unverified.
// Each output character retains its position within the native caption cue.
export function normalizeTimed(f) {
 let text='',timing=[];
 for(const cue of f.cues) {
  if(text){text+=' ';timing.push([cue.start,cue.start]);}
  const input=cue.text;
  for(const match of input.matchAll(/https?:\/\/\S+|www\.\S+|\d+(?:[.,]\d+)*|\s+|[^]/gu)) {
   const raw=match[0],start=cue.start+(cue.end-cue.start)*match.index/input.length,end=cue.start+(cue.end-cue.start)*(match.index+raw.length)/input.length;
   const replacement=/^(https?:\/\/|www\.)/.test(raw)?'URL_TOKEN':/^\d/.test(raw)?'NUMBER_TOKEN':/^\s+$/.test(raw)?' ':raw.toLowerCase();
   text+=replacement;for(let i=0;i<replacement.length;i++)timing.push([start,end]);
  }
 }
 return {text,timing};
}
function byteAlphabet() {
 const bytes=[...Array.from({length:94},(_,i)=>i+33),...Array.from({length:12},(_,i)=>i+161),...Array.from({length:82},(_,i)=>i+174)];
 const chars=[...bytes];let extra=0;
 for(let i=0;i<256;i++)if(!bytes.includes(i)){bytes.push(i);chars.push(256+extra++);}
 return new Map(chars.map((c,i)=>[String.fromCodePoint(c),bytes[i]]));
}
export function alignedTokens(tokenizer,text,timing) {
 const encoded=tokenizer.encode(text,{add_special_tokens:false}),alphabet=byteAlphabet();
 const bytes=new TextEncoder().encode(text),byteToChar=[];
 for(let c=0;c<text.length;) {const cp=String.fromCodePoint(text.codePointAt(c));for(const _ of new TextEncoder().encode(cp))byteToChar.push(c);c+=cp.length;}
 let position=0;const spans=[];
 for(const token of encoded.tokens) {
  const piece=Array.from(token,ch=>alphabet.get(ch));
  if(piece.some(v=>v===undefined)||piece.some((v,j)=>bytes[position+j]!==v))throw new Error('Tokenizer offset parity failed');
  const from=byteToChar[position],to=byteToChar[position+piece.length-1];
  if(!timing[from]||!timing[to])throw new Error('Invalid token timing');
  spans.push({start:timing[from][0],end:timing[to][1],charStart:from,charEnd:to+1});position+=piece.length;
 }
 if(position!==bytes.length)throw new Error('Tokenizer did not cover normalized transcript');
 return {ids:encoded.ids,spans};
}
export function decodeBilou(raw,config) {
 const spans=[];let active=null;
 const close=()=>{if(active){if(active.scoreSum/active.count>=config.threshold)spans.push({...active,score:active.scoreSum/active.count});active=null;}};
 for(let i=0;i<raw.tokens.length;i++) {
  const t=raw.tokens[i],probabilities=raw.probabilities[i],label=probabilities.indexOf(Math.max(...probabilities)),confidence=probabilities[label];
  if(label===0){close();continue;}if(label===1||label===4)close();
  if(!active)active={start:t.start,end:t.end,charStart:t.charStart,charEnd:t.charEnd,category:'sponsor',scoreSum:0,count:0};
  active.end=Math.max(active.end,t.end);active.charEnd=t.charEnd;active.scoreSum+=confidence;active.count++;
  if(label===3||label===4)close();
 }
 close();const merged=[];
 for(const s of spans) {
  const last=merged.at(-1);
  if(last&&(s.charStart-last.charEnd<=config.mergeGapCharacters||s.start-last.end<=config.mergeGapSeconds)) {last.end=Math.max(last.end,s.end);last.charEnd=s.charEnd;last.scoreSum+=s.scoreSum;last.count+=s.count;last.score=last.scoreSum/last.count;}else merged.push({...s});
 }
 return merged.filter(s=>s.end>s.start).map(({start,end,category,score})=>({start,end,category,score}));
}
