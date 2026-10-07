import test from 'node:test';
import assert from 'node:assert/strict';
import {fuseTokenWindows} from '../bench/adapters/ettin-consensus.mjs';
import {decodeBilou} from '../bench/adapters/ettin-text.mjs';
const token=i=>({start:i,end:i+1,charStart:i*2,charEnd:i*2+1});
const outside=[8,0,0,0,0],sponsor=[0,0,0,0,8];
const config={threshold:.8,mergeGapCharacters:24,mergeGapSeconds:1.5};
const raw=(windows)=>({kind:'ettin-bilou-windows-v2',windows});
test('conflicting overlap evidence is resolved per token rather than accepting either window',()=>{
 const tokens=[token(0),token(1),token(2)];
 const input=raw([{tokens,logits:[outside,sponsor,outside]},{tokens,logits:[outside,[12,0,0,0,0],outside]}]);
 assert.equal(decodeBilou(input,config).length,1);
 const pooled=fuseTokenWindows(input,'mean');
 assert.equal(pooled.windows.length,1);
 assert.deepEqual(pooled.windows[0].tokens,tokens);
 assert.deepEqual(pooled.windows[0].logits[1],[6,0,0,0,4]);
 assert.deepEqual(decodeBilou(pooled,config),[]);
});
test('context weighting trusts overlap evidence with more context on both sides',()=>{
 const a={tokens:Array.from({length:6},(_,i)=>token(i)),logits:Array.from({length:6},()=>outside)};
 const b={tokens:Array.from({length:6},(_,i)=>token(i+2)),logits:Array.from({length:6},()=>outside)};
 a.logits[4]=[0,0,0,0,6];b.logits[2]=[6,0,0,0,0];
 const pooled=fuseTokenWindows(raw([a,b]),'context');
 assert.equal(pooled.windows[0].tokens.length,8);
 assert.ok(Math.abs(pooled.windows[0].logits[4][0]-3.6)<1e-12);
 assert.ok(Math.abs(pooled.windows[0].logits[4][4]-2.4)<1e-12);
 assert.deepEqual(decodeBilou(pooled,config),[]);
});
test('a single window preserves its token/logit evidence and decoded result',()=>{
 const input=raw([{tokens:[token(0),token(1),token(2)],logits:[outside,sponsor,outside]}]);
 const before=JSON.stringify(input),pooled=fuseTokenWindows(input,'context');
 assert.deepEqual(pooled.windows,input.windows);
 assert.deepEqual(decodeBilou(pooled,config),decodeBilou(input,config));
 assert.equal(JSON.stringify(input),before);
});
test('offset or time disagreement cannot silently fuse unrelated tokens',()=>{
 const a={tokens:[token(0)],logits:[outside]},b={tokens:[{...token(0),end:2}],logits:[outside]};
 assert.throws(()=>fuseTokenWindows(raw([a,b]),'mean'),/timing/i);
 b.tokens[0]={...token(0),charEnd:2};
 assert.throws(()=>fuseTokenWindows(raw([a,b]),'mean'),/offset/i);
});
test('malformed logits and unsupported fusion modes are rejected',()=>{
 assert.throws(()=>fuseTokenWindows(raw([{tokens:[token(0)],logits:[[NaN,0,0,0,0]]}]),'mean'),/logit/i);
 assert.throws(()=>fuseTokenWindows(raw([{tokens:[token(0)],logits:[]}]),'mean'),/count/i);
 assert.throws(()=>fuseTokenWindows(raw([]),'best'),/mode/i);
});
