// SPDX-License-Identifier: GPL-3.0-or-later
import {pipeline,env} from './vendor/transformers.min.js';
import {SAMPLE_RATE,MAX_SAMPLES} from './experiment.js';
env.allowRemoteModels=false;env.allowLocalModels=true;env.useBrowserCache=false;
env.localModelPath=new URL('model/',self.location).href;
env.backends.onnx.wasm.wasmPaths=new URL('ort/',self.location).href;env.backends.onnx.wasm.numThreads=1;
self.onmessage=async({data})=>{
    if(!(data?.pcm instanceof Float32Array)||data.pcm.length>MAX_SAMPLES||data.pcm.length<SAMPLE_RATE/4||data.sampleRate!==SAMPLE_RATE||!data.pcm.every(Number.isFinite)){self.postMessage({error:'invalid_audio'});return;}
    try{
        const transcriber=await pipeline('automatic-speech-recognition','whisper-tiny.en',{local_files_only:true,quantized:true});
        const output=await transcriber(data.pcm,{return_timestamps:true,chunk_length_s:20,stride_length_s:0,max_new_tokens:256});
        self.postMessage({text:output.text,chunks:output.chunks});
        await transcriber.dispose();
    }catch{self.postMessage({error:'transcription_failed'});}
};
