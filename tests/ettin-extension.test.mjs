import test from 'node:test';
import assert from 'node:assert/strict';
import {MODEL_SPEC} from '../src/model-spec.js';
import {createEttinEngine,loadEttinEngine} from '../src/ettin-engine.js';
import {sponsorLabels} from '../src/sponsor-policy.js';

test('extension uses the exact benchmarked Ettin INT8 graph',()=>{
 assert.equal(MODEL_SPEC.repository,'CuriousDragon/ettin-17m-sponsor-combined-android');
 assert.equal(MODEL_SPEC.revision,'d4939256c49e92d158429a55fcf39477d003dd58');
 assert.equal(MODEL_SPEC.files.at(-1).sha256,'5006c192c9ba17c9283d7366307cccc9d80d67bab4301c1749e8f737a8b6d40f');
});
const tokenizer={encode:text=>({ids:Array.from(text,(_,i)=>100+i),tokens:Array.from(text)})};
class Tensor {constructor(type,data,dims){Object.assign(this,{type,data,dims});}dispose(){this.disposed=true;}}
test('full-track token windows include short tracks and the trailing partial window',async()=>{
 const seen=[],progress=[];const session={async run(feeds){seen.push(Array.from(feeds.input_ids.data));const n=feeds.input_ids.dims[1],data=new Float32Array(n*5);for(let i=0;i<n;i++)data[i*5]=20;return {logits:{dims:[1,n,5],data,dispose(){}}};}};
 const engine=createEttinEngine({ort:{Tensor},tokenizer,session,config:{cls_token_id:1,sep_token_id:2},backend:'wasm'});
 const result=await engine.classify([{start:'0',duration:'160',text:'x'.repeat(1600)}],.8,p=>progress.push(p));
 assert.deepEqual(seen.map(s=>s.length),[768,768,326]);
 assert.equal(seen[1][1],738n);assert.equal(seen.at(-1).at(-2),1699n);
 assert.deepEqual(result.segments,[]);assert.equal(result.backend,'wasm');
 assert.deepEqual(progress.at(-1),{processed:3,total:3});
 await engine.classify([{start:'0',duration:'1',text:'xx'}],.8);
 assert.equal(seen.at(-1).length,4);
});
test('token decoding returns narrow timed spans rather than expanding the whole caption window',async()=>{
 const session={async run(feeds){const n=feeds.input_ids.dims[1],data=new Float32Array(n*5).fill(-20);for(let i=0;i<n;i++)data[i*5]=20;data[2*5]= -20;data[2*5+4]=20;return {logits:{dims:[1,n,5],data,dispose(){}}};}};
 const engine=createEttinEngine({ort:{Tensor},tokenizer,session,config:{cls_token_id:1,sep_token_id:2},backend:'wasm'});
 const {segments}=await engine.classify([{start:'0',duration:'10',text:'xxxxx'}],.8);
 assert.equal(segments.length,1);assert.equal(segments[0].start,2);assert.equal(segments[0].end,4);
});
test('invalid tensors or captions cannot become suggestion evidence',async()=>{
 const engine=createEttinEngine({ort:{Tensor},tokenizer,session:{async run(){return {logits:{dims:[1,4,5],data:new Float32Array(20).fill(NaN),dispose(){}}};}},config:{cls_token_id:1,sep_token_id:2},backend:'wasm'});
 await assert.rejects(engine.classify([{start:0,duration:1,text:'xx'}],.8));
 await assert.rejects(engine.classify([{start:-1,duration:1,text:'xx'}],.8));
});
test('a failing GPU graph load falls back to an independently requested WASM session',async()=>{
 const providers=[];let released=0;
 const ort={Tensor,env:{wasm:{}},InferenceSession:{async create(url,options){providers.push(options.executionProviders);assert.match(url,/sponsor_detector_combined.int8.onnx$/);if(options.executionProviders[0]==='webgpu')throw Error('private GPU failure');return {release(){released++;}};}}};
 const config={id2label:{0:'O',1:'B-SPONSOR',2:'I-SPONSOR',3:'L-SPONSOR',4:'U-SPONSOR'},cls_token_id:1,sep_token_id:2};
 const engine=await loadEttinEngine({ort,Tokenizer:class{},fetchJson:async url=>url.endsWith('config.json')?config:{},baseUrl:'https://fixture.invalid/model/',runtimeUrl:'https://fixture.invalid/ort/',gpuAvailable:true});
 assert.deepEqual(providers,[['webgpu'],['wasm']]);assert.equal(engine.backend,'wasm');
 await engine.dispose();assert.equal(released,1);
});
test('Ettin supports only sponsor and migrates legacy zero-shot thresholds',()=>{
 assert.deepEqual(sponsorLabels([{name:'contains sponsored content',threshold:.98,blocked:false},{name:'contains regular content',threshold:.85,blocked:false}]),[{name:'sponsor',threshold:.8,blocked:false}]);
 assert.deepEqual(sponsorLabels([{name:'sponsor',threshold:.9,blocked:true}]),[{name:'sponsor',threshold:.9,blocked:true}]);
 assert.equal(sponsorLabels([{name:'selfpromo',threshold:.8,blocked:true}]),null);
});

test('a fresh install uses the conservative sponsor policy without opening the popup',()=>{
 assert.deepEqual(sponsorLabels(null),[{name:'sponsor',threshold:.8,blocked:true}]);
});
