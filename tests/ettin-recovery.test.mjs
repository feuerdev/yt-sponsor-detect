import test from 'node:test';import assert from 'node:assert/strict';
import {loadEttinEngine} from '../src/ettin-engine.js';
const config={id2label:{0:'O',1:'B-SPONSOR',2:'I-SPONSOR',3:'L-SPONSOR',4:'U-SPONSOR'},cls_token_id:1,sep_token_id:2};
class Tensor{constructor(type,data,dims){Object.assign(this,{type,data,dims});}dispose(){this.disposed=true;}}
class Tokenizer{encode(text){return {ids:Array.from(text,(_,i)=>100+i),tokens:Array.from(text)};}}
const captions=[{start:0,duration:160,text:'x'.repeat(1600)}];
function fixture({invalid=false,cpuFailure=false}={}){
 const providers=[],released=[],seen={webgpu:[],wasm:[]};let gpuRuns=0;
 const ort={Tensor,env:{wasm:{}},InferenceSession:{async create(url,{executionProviders:[backend]}){
  providers.push(backend);return {async release(){released.push(backend);},async run(feeds){seen[backend].push(Array.from(feeds.input_ids.data));
   if(backend==='webgpu'&&++gpuRuns===2&&!invalid)throw Error('GPU device lost');
   if(backend==='wasm'&&cpuFailure)throw Error('CPU failed');
   const n=feeds.input_ids.dims[1],data=new Float32Array(n*5).fill(-20);for(let i=0;i<n;i++)data[i*5]=20;
   if(backend==='webgpu'){data[2*5]=-20;data[2*5+4]=20;}if(invalid)data.fill(NaN);
   return {logits:{dims:[1,n,5],data,dispose(){}}};}};
 }}};
 return {providers,released,seen,load:()=>loadEttinEngine({ort,Tokenizer,fetchJson:async url=>url.endsWith('config.json')?config:{},baseUrl:'https://fixture.invalid/model/',runtimeUrl:'https://fixture.invalid/ort/',gpuAvailable:true})};
}
test('GPU loss after a completed window retries the whole track once on CPU and discards GPU spans',async()=>{
 const f=fixture(),engine=await f.load(),result=await engine.classify(captions,.8);
 assert.equal(result.backend,'wasm');assert.equal(engine.backend,'wasm');assert.deepEqual(result.segments,[]);assert.deepEqual(f.providers,['webgpu','wasm']);
 assert.deepEqual(f.seen.wasm.map(x=>x.length),[768,768,326]);assert.deepEqual(f.seen.wasm[0],f.seen.webgpu[0]);assert.deepEqual(f.released,['webgpu']);
 await engine.dispose();assert.deepEqual(f.released,['webgpu','wasm']);
});
test('subsequent jobs reuse the recovered CPU engine rather than retrying a lost GPU',async()=>{
 const f=fixture(),engine=await f.load();await engine.classify(captions,.8);await engine.classify(captions,.8);
 assert.deepEqual(f.providers,['webgpu','wasm']);assert.equal(f.seen.webgpu.length,2);assert.equal(f.seen.wasm.length,6);await engine.dispose();
});
test('a failed CPU recovery stays bounded and returns no partial successful result',async()=>{
 const f=fixture({cpuFailure:true}),engine=await f.load();await assert.rejects(engine.classify(captions,.8));
 assert.deepEqual(f.providers,['webgpu','wasm']);assert.equal(f.seen.wasm.length,1);await engine.dispose();
});
test('invalid GPU outputs are rejected without masking them through a CPU retry',async()=>{
 const f=fixture({invalid:true}),engine=await f.load();await assert.rejects(engine.classify(captions,.8));assert.deepEqual(f.providers,['webgpu']);await engine.dispose();
});
