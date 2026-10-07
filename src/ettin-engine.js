// SPDX-License-Identifier: GPL-3.0-only
// Uses the verified Flow behavioral port; see bench/reference/ettin-parity.md.
import {normalizeTimed,alignedTokens,decodeBilou} from '../bench/adapters/ettin-text.mjs';
import {MODEL_SPEC} from './model-spec.js';
import {validateCaptions,validateSegments} from './caption-contract.js';

export function createEttinEngine({ort,tokenizer,session,config,backend}) {
    return {backend,dispose:()=>session.release(),async classify(captions,threshold,onProgress=()=>{}) {
        validateCaptions(captions);
        if (!Number.isFinite(threshold)||threshold<0||threshold>1) throw Error('invalid_output');
        const f={cues:captions.map(c=>({start:Number(c.start),end:Number(c.start)+Number(c.duration),text:c.text}))};
        const {text,timing}=normalizeTimed(f),{ids,spans}=alignedTokens(tokenizer,text,timing);
        const windows=[],body=MODEL_SPEC.preprocessing.maxLength-2,step=body-MODEL_SPEC.preprocessing.overlapTokens;
        const total=ids.length<=body?1:1+Math.ceil((ids.length-body)/step);
        for (let start=0;start<ids.length;start+=step) {
            const end=Math.min(ids.length,start+body),sequence=[config.cls_token_id,...ids.slice(start,end),config.sep_token_id];
            const input=new ort.Tensor('int64',BigInt64Array.from(sequence,BigInt),[1,sequence.length]);
            const mask=new ort.Tensor('int64',new BigInt64Array(sequence.length).fill(1n),[1,sequence.length]);
            let out;
            try {
                out=await session.run({input_ids:input,attention_mask:mask});
                const logits=out.logits;
                if (!logits || logits.dims.length!==3 || logits.dims[0]!==1 || logits.dims[1]!==sequence.length
                    || logits.dims[2]!==5 || logits.data.length!==sequence.length*5) throw Error('invalid_output');
                windows.push({tokens:spans.slice(start,end),logits:Array.from({length:end-start},(_,i)=>
                    Array.from(logits.data.subarray((i+1)*5,(i+2)*5)))});
            } finally {
                input.dispose?.();mask.dispose?.();for (const tensor of Object.values(out||{})) tensor.dispose?.();
            }
            onProgress({processed:windows.length,total});
            if (end===ids.length) break;
        }
        const segments=decodeBilou({windows},{...MODEL_SPEC.decoding,threshold});
        validateSegments(segments,captions);
        return {segments,backend,model:MODEL_SPEC.revision,pipelineVersion:MODEL_SPEC.pipelineVersion};
    }};
}
export async function loadEttinEngine({ort,Tokenizer,fetchJson,baseUrl,runtimeUrl,gpuAvailable}) {
    ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;ort.env.wasm.wasmPaths=runtimeUrl;
    const config=await fetchJson(new URL('config.json',baseUrl).href);
    if (JSON.stringify(Object.values(config.id2label))!==JSON.stringify(MODEL_SPEC.preprocessing.labels)) throw Error('model_unavailable');
    const tokenizer=new Tokenizer(await fetchJson(new URL('tokenizer.json',baseUrl).href),await fetchJson(new URL('tokenizer_config.json',baseUrl).href));
    const graph=new URL(MODEL_SPEC.files.at(-1).path,baseUrl).href;
    for (const backend of gpuAvailable?['webgpu','wasm']:['wasm']) {
        try {
            const session=await ort.InferenceSession.create(graph,{executionProviders:[backend],graphOptimizationLevel:'all'});
            return createEttinEngine({ort,tokenizer,session,config,backend});
        } catch { if (backend==='wasm') throw Error('model_unavailable'); }
    }
}
