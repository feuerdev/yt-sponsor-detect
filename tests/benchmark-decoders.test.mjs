// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {Tokenizer} from '@huggingface/tokenizers';
import {normalizeTimed,alignedTokens,decodeBilou} from '../bench/adapters/ettin-text.mjs';
import {decodeSponsorSkip} from '../bench/adapters/sponsorskip-decode.mjs';
import {decodeWindows} from '../bench/adapters/common.mjs';
// A tiny byte-level vocabulary verifies multibyte offsets without model assets.
const tokenizer=new Tokenizer({version:'1.0',truncation:null,padding:null,added_tokens:[],normalizer:null,pre_tokenizer:{type:'ByteLevel',add_prefix_space:false,trim_offsets:true,use_regex:true},post_processor:null,decoder:{type:'ByteLevel',add_prefix_space:false,trim_offsets:true,use_regex:true},model:{type:'BPE',dropout:null,unk_token:null,continuing_subword_prefix:null,end_of_word_suffix:null,fuse_unk:false,byte_fallback:false,vocab:{a:0,'Ġ':1,'Ã':2,'©':3,b:4},merges:[]}},{});
test('byte-level token mapping covers unicode bytes and rejects offset guesses',()=>{
 const text='a é b',timing=Array.from(text,(_,i)=>[i,i+1]);const out=alignedTokens(tokenizer,text,timing);
 assert.deepEqual(out.ids,[0,1,2,3,1,4]);assert.equal(out.spans[2].charStart,2);assert.equal(out.spans[3].charEnd,3);
 assert.throws(()=>alignedTokens({encode:()=>({ids:[0],tokens:['b']})},'a',[[0,1]]));
});
test('normalization maps number/url replacements within original cue endpoints',()=>{
 const out=normalizeTimed({cues:[{start:10,end:20,text:'Visit https://example.com for 50 dollars.'}]});
 assert.equal(out.text,'visit URL_TOKEN for NUMBER_TOKEN dollars.');assert.equal(out.text.length,out.timing.length);
 assert.ok(out.timing.every(([start,end])=>start>=10&&end<=20));
});
test('BILOU starts, ends, unit tags and merging keep paid-only category',()=>{
 const raw={tokens:[{start:1,end:2,charStart:0,charEnd:1},{start:2,end:3,charStart:1,charEnd:2},{start:3,end:4,charStart:2,charEnd:3},{start:10,end:11,charStart:50,charEnd:51}],probabilities:[[.05,.9,.02,.02,.01],[.02,.02,.92,.02,.02],[.02,.02,.02,.92,.02],[.01,.01,.01,.01,.96]]};
 const result=decodeBilou(raw,{threshold:.7,mergeGapCharacters:24,mergeGapSeconds:1.5});
 assert.deepEqual(result.map(({start,end,category})=>({start,end,category})),[{start:1,end:4,category:'sponsor'},{start:10,end:11,category:'sponsor'}]);
 assert.equal(decodeBilou(raw,{threshold:.99,mergeGapCharacters:24,mergeGapSeconds:1.5}).length,0);
});
test('SponsorSkip hysteresis expands confident cores and category-specific merge works',()=>{
 const words=[['a',0],['b',1000],['c',2000],['d',3000],['e',4000],['f',5000]];
 const p=[.1,.4,.9,.85,.4,.1],probs=new Float32Array(p.flatMap(v=>[1-v,v,0,0,0]));
 const result=decodeSponsorSkip(probs,words,.7,.3,{labels:['O','B','I','BS','IS']});
 assert.equal(result.length,1);assert.equal(result[0].start,1);assert.equal(result[0].end,4.4);assert.equal(result[0].category,'sponsor');
 const equal=decodeSponsorSkip(probs,words,.7,.7,{labels:['O','B','I','BS','IS']});assert.equal(equal[0].start,2);assert.equal(equal[0].end,3.4);
 const self=new Float32Array(words.flatMap(()=>[0,0,0,1,0]));assert.equal(decodeSponsorSkip(self,words,.7,.3,{labels:['O','B','I','BS','IS']})[0].category,'selfpromo');
});
test('NLI cache thresholds operate on same scores without category mixing',()=>{
 const raw={windows:[{start:0,end:10,scores:{sponsor:.91,selfpromo:.02}},{start:5,end:15,scores:{sponsor:.92,selfpromo:.03}},{start:20,end:25,scores:{sponsor:.1,selfpromo:.96}}]};
 assert.deepEqual(decodeWindows(raw,.9).map(({start,end,category})=>({start,end,category})),[{start:0,end:15,category:'sponsor'},{start:20,end:25,category:'selfpromo'}]);
 assert.equal(decodeWindows(raw,.99).length,0);
});

test('non-finite logits cannot turn into a silent no-detection',async()=>{
 const {softmax}=await import('../bench/adapters/common.mjs');
 assert.throws(()=>softmax([1,NaN,2]));assert.throws(()=>softmax([1,Infinity,2]));
 assert.ok(Math.abs(softmax([1,2,3]).reduce((a,b)=>a+b,0)-1)<1e-9);
});
