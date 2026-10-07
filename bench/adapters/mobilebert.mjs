import {mergeSegments,decodeWindows} from './common.mjs';
export async function initialize(spec,backend) {
 if(backend!=='wasm')throw Object.assign(new Error('Transformers 2 baseline selects WASM only'),{status:'unsupported_backend'});
 const {pipeline,env}=await import('../browser/vendor/xenova/transformers.min.js');
 env.allowRemoteModels=false;env.allowLocalModels=true;env.useBrowserCache=false;
 env.localModelPath=new URL('../assets/',import.meta.url).href;
 env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;
 env.backends.onnx.wasm.wasmPaths=new URL('../browser/vendor/xenova/',import.meta.url).href;
 const model=await pipeline('zero-shot-classification',spec.directory,{local_files_only:true,quantized:false,model_file_name:spec.modelFile});
 return {backend:'wasm',async infer(f) {
  const windows=[];
  for(let i=0;i<f.cues.length;i+=spec.preprocessing.cueStride) {
   const cues=f.cues.slice(i,i+spec.preprocessing.cueWindow);const text=cues.map(c=>c.text).join(' ');
   if(text.length<spec.preprocessing.minCharacters)continue;
   const result=await model(text,spec.preprocessing.labels,{multi_label:false,hypothesis_template:spec.preprocessing.hypothesis,padding:true,truncation:true});
   if(!Array.isArray(result.labels)||!Array.isArray(result.scores)||result.labels.length!==3||new Set(result.labels).size!==3||result.labels.some(l=>!spec.preprocessing.labels.includes(l))||result.scores.length!==3||result.scores.some(s=>!Number.isFinite(s)||s<0||s>1))throw Object.assign(new Error('Invalid NLI label/score output'),{status:'invalid_output'});
   const scores=Object.fromEntries(result.labels.map((label,j)=>[label,result.scores[j]]));
   windows.push({start:cues[0].start,end:Math.max(...cues.map(c=>c.end)),scores:{sponsor:scores['paid sponsorship'],selfpromo:scores['self promotion']}});
  }
  return {kind:'nli-windows',windows};
 },decode:(raw,config)=>decodeWindows(raw,config.threshold,config.mergeGapSeconds),dispose:()=>model.dispose()};
}
