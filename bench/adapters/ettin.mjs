import {normalizeTimed,alignedTokens,decodeBilou} from './ettin-text.mjs';
import {softmax} from './common.mjs';
export async function initialize(spec,backend) {
 if(backend==='webgpu'&&(!navigator.gpu||!(await navigator.gpu.requestAdapter())))throw Object.assign(new Error('No usable WebGPU adapter'),{status:'unsupported_backend'});
 const ort=await import('../browser/vendor/ort/ort.webgpu.bundle.min.mjs');
 const {Tokenizer}=await import('../browser/vendor/tokenizers.mjs');
 ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;ort.env.wasm.wasmPaths=new URL('../browser/vendor/ort/',import.meta.url).href;
 const base=new URL(`../assets/${spec.directory}/`,import.meta.url);
 const config=await (await fetch(new URL('config.json',base))).json();
 if(JSON.stringify(Object.values(config.id2label))!==JSON.stringify(spec.preprocessing.labels))throw new Error('Ettin label mapping mismatch');
 const tokenizer=new Tokenizer(await (await fetch(new URL('tokenizer.json',base))).json(),await (await fetch(new URL('tokenizer_config.json',base))).json());
 const session=await ort.InferenceSession.create(new URL(`sponsor_detector_combined.${spec.precision}.onnx`,base).href,{executionProviders:[backend],graphOptimizationLevel:'all'});
 return {backend,async infer(f) {
  const {text,timing}=normalizeTimed(f),{ids,spans}=alignedTokens(tokenizer,text,timing);
  const acc=Array.from(ids,()=>new Float64Array(5)),count=new Uint32Array(ids.length),body=766,step=638;
  for(let start=0;start<ids.length;start+=step) {
   const end=Math.min(ids.length,start+body),sequence=[config.cls_token_id,...ids.slice(start,end),config.sep_token_id];
   const input=new BigInt64Array(sequence.map(BigInt)),mask=new BigInt64Array(sequence.length).fill(1n);
   const out=await session.run({input_ids:new ort.Tensor('int64',input,[1,sequence.length]),attention_mask:new ort.Tensor('int64',mask,[1,sequence.length])});
   const logits=out.logits;if(logits.dims.at(-1)!==5||logits.dims.at(-2)!==sequence.length)throw new Error('Invalid Ettin logits shape');
   for(let i=start;i<end;i++){const values=softmax(logits.data.subarray((i-start+1)*5,(i-start+2)*5));values.forEach((v,c)=>acc[i][c]+=v);count[i]++;}
   for(const tensor of Object.values(out))tensor.dispose?.();if(end===ids.length)break;
  }
  return {kind:'ettin-bilou',tokens:spans,probabilities:acc.map((row,i)=>Array.from(row,v=>v/count[i])),normalizedCharacters:text.length,parity:'experimental reconstruction; exact Flow decoder/normalization parity UNVERIFIED'};
 },decode:decodeBilou,dispose:()=>session.release()};
}
