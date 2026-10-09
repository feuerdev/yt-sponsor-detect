// SPDX-License-Identifier: GPL-3.0-only
// Experimental aggregation for the verified Flow BILOU decoder. Model inference is unchanged.
export function fuseTokenWindows(raw,mode='context') {
 if(!['mean','context'].includes(mode))throw Error('Unsupported fusion mode');
 if(raw?.kind!=='ettin-bilou-windows-v2'||!Array.isArray(raw.windows))throw Error('Invalid cached Ettin windows');
 const pooled=new Map();
 for(const window of raw.windows) {
  if(!Array.isArray(window.tokens)||!Array.isArray(window.logits)||window.tokens.length!==window.logits.length)throw Error('Token/logit count mismatch');
  let previousEnd=-1;
  for(let i=0;i<window.tokens.length;i++) {
   const token=window.tokens[i],row=window.logits[i];
   if(!Array.isArray(row)||row.length!==5||row.some(v=>!Number.isFinite(v)))throw Error('Invalid token logits');
   if(!Number.isInteger(token.charStart)||!Number.isInteger(token.charEnd)||token.charStart<previousEnd||token.charEnd<=token.charStart)throw Error('Invalid token offsets');
   if(!Number.isFinite(token.start)||!Number.isFinite(token.end)||token.start<0||token.end<token.start)throw Error('Invalid token timing');
   previousEnd=token.charEnd;
   const weight=mode==='mean'?1:Math.min(i+1,window.tokens.length-i,128),old=pooled.get(token.charStart);
   if(old) {
    if(old.token.charEnd!==token.charEnd)throw Error('Conflicting token offsets');
    if(old.token.start!==token.start||old.token.end!==token.end)throw Error('Conflicting token timing');
    const total=old.weight+weight,left=old.weight/total,right=weight/total;
    old.logits=old.logits.map((v,j)=>v*left+row[j]*right);old.weight=total;
   }else pooled.set(token.charStart,{token:{...token},logits:[...row],weight});
  }
 }
 const ordered=[...pooled.values()].sort((a,b)=>a.token.charStart-b.token.charStart);
 if(ordered.some((v,i)=>i&&v.token.charStart<ordered[i-1].token.charEnd))throw Error('Conflicting token offsets');
 return {kind:'ettin-bilou-windows-v3-consensus',windows:ordered.length?[{tokens:ordered.map(v=>v.token),logits:ordered.map(v=>v.logits)}]:[]};
}
