import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {MODEL_SPEC} from '../src/model-spec.js';
import {validateCaptions,validateSegments} from '../src/caption-contract.js';
const source=readFileSync(new URL('../src/classifier.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
const captions=[{start:'0',duration:'10',text:'synthetic caption'}];
function fixture({create=async()=>{},reply=async()=>({ok:true,segments:[{start:2,end:4,category:'sponsor',score:.99}],backend:'wasm',model:MODEL_SPEC.revision,pipelineVersion:MODEL_SPEC.pipelineVersion})}={}){
 const listeners=new Set();let creations=0;
 const chrome={runtime:{id:'fixture',getURL:f=>'chrome-extension://fixture/'+f,getContexts:async()=>[],sendMessage:reply,onMessage:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)}},offscreen:{createDocument:async options=>{creations++;await create(options);}}};
 const context=vm.createContext({MODEL_SPEC,validateCaptions,validateSegments,chrome,crypto,setTimeout,clearTimeout});
 vm.runInContext(source,context);
 return {instance:vm.runInContext('Classifier',context),classify:vm.runInContext('classifyCaptions',context),get creations(){return creations;},listeners};
}
test('concurrent requests create a single offscreen inference document',async()=>{
 let release;const f=fixture({create:()=>new Promise(r=>release=r)});
 const a=f.instance.getInstance(),b=f.instance.getInstance();await new Promise(setImmediate);assert.equal(f.creations,1);release();await Promise.all([a,b]);
});
test('the classifier accepts timed sponsor segments and reports the actual backend',async()=>{
 const f=fixture();const r=await f.classify(captions,.8);
 assert.deepEqual(r.segments,[{start:2,end:4,category:'sponsor',score:.99}]);assert.equal(r.backend,'wasm');assert.equal(f.listeners.size,0);
});
test('missing model and inference errors are sanitized with no provider or caption text',async()=>{
 for(const options of [{create:async()=>{throw Error('private provider caption');}},{reply:async()=>({ok:false,code:'inference_failed',detail:'private caption'})}]){
  const f=fixture(options);await assert.rejects(f.classify(captions,.8),e=>['model_unavailable','inference_failed'].includes(e.code)&&!e.message.includes('private'));
 }
});
test('malformed, out-of-track, unsupported or foreign-model results fail closed',async()=>{
 for(const patch of [{segments:[{start:2,end:20,category:'sponsor',score:.9}]},{segments:[{start:2,end:4,category:'selfpromo',score:.9}]},{segments:[{start:2,end:4,category:'sponsor',score:NaN}]},{model:'old-model'},{backend:'cpu'}]){
  const f=fixture({reply:async()=>({ok:true,segments:[],backend:'wasm',model:MODEL_SPEC.revision,pipelineVersion:MODEL_SPEC.pipelineVersion,...patch})});
  await assert.rejects(f.classify(captions,.8),e=>e.code==='invalid_output');assert.equal(f.listeners.size,0);
 }
});
test('failed offscreen creation is retryable',async()=>{
 let calls=0;const f=fixture({create:async()=>{if(++calls===1)throw Error('missing');}});
 await assert.rejects(f.instance.getInstance());await f.instance.getInstance();assert.equal(calls,2);
});
