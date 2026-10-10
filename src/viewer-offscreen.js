// SPDX-License-Identifier: GPL-3.0-or-later
import {MODEL_SPEC} from './model-spec.js';
import {DetectorQueue} from './viewer/detector.js';
import {EttinAdapter} from './viewer/ettin.js';
import {validateTranscript} from './viewer/transcript.js';
const adapter=new EttinAdapter({createWorker:()=>new Worker(chrome.runtime.getURL('inference-worker.js'),{type:'module'}),threshold:MODEL_SPEC.decoding.threshold,revision:MODEL_SPEC.revision,pipelineVersion:MODEL_SPEC.pipelineVersion});
const queue=new DetectorQueue({descriptor:{model:'ettin-int8',revision:MODEL_SPEC.revision,selection:'retained from benchmark branch; viewer word-timing evaluation pending'},initialize:async()=>adapter});
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(sender.id!==chrome.runtime.id||sender.tab||message?.scope!=='offscreen')return false;
    if(message.type==='CANCEL_DETECTION'){queue.cancel(message.jobId);adapter.cancel(message.jobId);return false;}
    if(message.type!=='RUN_DETECTION'||typeof message.jobId!=='string'||!validateTranscript(message.transcript,message.transcript?.videoId))return false;
    queue.run(message.transcript,{jobId:message.jobId,onProgress:progress=>{
        chrome.runtime.sendMessage({type:'DETECTION_PROGRESS',jobId:message.jobId,progress}).catch(()=>{});
    }}).then(respond,error=>respond({error:['model_unavailable','inference_failed','invalid_output','cancelled'].includes(error.code)?error.code:'inference_failed'}));return true;
});
