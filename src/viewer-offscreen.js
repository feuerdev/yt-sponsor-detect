// SPDX-License-Identifier: GPL-3.0-or-later
import {env} from '@xenova/transformers';
import {Classifier,classifyText} from './classifier.js';
import {MODEL_SPEC} from './model-spec.js';
import {DetectorQueue,createNliAdapter} from './viewer/detector.js';
import {validateTranscript} from './viewer/transcript.js';
env.localModelPath=chrome.runtime.getURL('model/');
env.backends.onnx.wasm.numThreads=1;
env.backends.onnx.wasm.wasmPaths=chrome.runtime.getURL('ort/');
const queue=new DetectorQueue({
    descriptor:{model:'mobilebert-fp32',revision:MODEL_SPEC.revision,backend:'wasm',selection:'pending measured comparison'},
    initialize:async()=>{await Classifier.getInstance();return createNliAdapter(classifyText);},
});
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(sender.id!==chrome.runtime.id||message.scope!=='offscreen')return false;
    if(message.type==='CANCEL_DETECTION'){queue.cancel(message.jobId);return false;}
    if(message.type!=='RUN_DETECTION'||typeof message.jobId!=='string'||!validateTranscript(message.transcript,message.transcript?.videoId))return false;
    queue.run(message.transcript,{jobId:message.jobId,onProgress:progress=>{
        chrome.runtime.sendMessage({type:'DETECTION_PROGRESS',jobId:message.jobId,progress}).catch(()=>{});
    }}).then(respond,error=>respond({error:['model_unavailable','inference_failed','invalid_output','cancelled'].includes(error.code)?error.code:'inference_failed'}));
    return true;
});
