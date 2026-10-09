// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeTimed,alignedTokens,decodeBilou} from '../bench/adapters/ettin-text.mjs';
const oracle=JSON.parse(readFileSync(new URL('./fixtures/ettin-upstream-parity.json',import.meta.url)));
test('normalization, native Unicode offsets and cue times match pinned Flow pure pipeline outputs',()=>{
 for(const sample of oracle.normalizations){const normalized=normalizeTimed(sample);assert.equal(normalized.text,sample.text);const tokens=alignedTokens({encode:()=>({ids:sample.ids,tokens:sample.tokens})},normalized.text,normalized.timing);
 assert.deepEqual(tokens.spans.map(t=>[t.charStart,t.charEnd]),sample.offsets);assert.deepEqual(tokens.spans.map(t=>[t.start,t.end]),sample.times);}
});
test('constrained BILOU paths, geometric confidence and overlap/gap stitching match 150 upstream synthetic cases',()=>{
 for(const [i,sample] of oracle.decoderCases.entries()){const actual=decodeBilou(sample.raw,sample.config);assert.deepEqual(actual.map(({start,end,category})=>({start,end,category})),sample.expected.filter(s=>s.end>s.start).map(({start,end,category})=>({start,end,category})),`case ${i}`);actual.forEach((s,j)=>assert.ok(Math.abs(s.score-sample.expected.filter(s=>s.end>s.start)[j].score)<1e-12,`confidence case ${i}`));}
});
test('cached browser window logits use the verified decoder during operating-point sweeps',async()=>{
 const {decode}=await import('../bench/decode.mjs');const sample=oracle.decoderCases[3];
 assert.deepEqual(decode({...sample.raw,kind:'ettin-bilou-windows-v2'},sample.config),decodeBilou(sample.raw,sample.config));
});
