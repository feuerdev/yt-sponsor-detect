// SPDX-License-Identifier: GPL-3.0-only
import {Tokenizer} from '@huggingface/tokenizers';
import {loadEttinEngine} from './ettin-engine.js';
import {MODEL_SPEC} from './model-spec.js';
let loading=null,queue=Promise.resolve();
async function engine(){
    if(!loading)loading=(async()=>{
        const runtimeUrl=new URL('ort/',self.location.href).href;
        const ort=await import(/* webpackIgnore: true */ new URL('ort.webgpu.bundle.min.mjs',runtimeUrl).href);
        return loadEttinEngine({ort,Tokenizer,runtimeUrl,baseUrl:new URL(`model/${MODEL_SPEC.directory}/`,self.location.href).href,
            gpuAvailable:!!navigator.gpu,fetchJson:async url=>{const response=await fetch(url);if(!response.ok)throw Error('model_unavailable');return response.json();}});
    })().catch(()=>{loading=null;throw Object.assign(Error('model_unavailable'),{code:'model_unavailable'});});
    return loading;
}
self.onmessage=({data:job})=>{
    queue=queue.then(async()=>{
        try{const model=await engine();const result=await model.classify(job.captions,job.threshold,p=>self.postMessage({id:job.id,progress:p}));self.postMessage({id:job.id,ok:true,...result});}
        catch(error){self.postMessage({id:job.id,ok:false,code:error.code==='model_unavailable'?'model_unavailable':'inference_failed'});}
    });
};
