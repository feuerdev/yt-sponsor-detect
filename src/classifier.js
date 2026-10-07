import {MODEL_SPEC} from './model-spec.js';
import {validateCaptions,validateSegments} from './caption-contract.js';
export class ClassificationError extends Error {
    constructor(code){super(`Sponsor classifier unavailable (${code}). Playback must remain unchanged.`);this.name='ClassificationError';this.code=code;}
}
export class Classifier {
    static loading=null;
    static async getInstance(){
        if(!this.loading)this.loading=(async()=>{
            const documentUrl=chrome.runtime.getURL('offscreen.html');
            const contexts=await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT'],documentUrls:[documentUrl]});
            if(!contexts.length)await chrome.offscreen.createDocument({url:'offscreen.html',reasons:['WORKERS'],justification:'Run the local sponsor detector in a dedicated worker.'});
        })().catch(()=>{throw new ClassificationError('model_unavailable');}).finally(()=>{this.loading=null;});
        return this.loading;
    }
}
export async function classifyCaptions(captions,threshold,onProgress=()=>{}){
    try{validateCaptions(captions);if(!Number.isFinite(threshold)||threshold<0||threshold>1)throw Error();}
    catch{throw new ClassificationError('invalid_output');}
    await Classifier.getInstance();
    const id=crypto.randomUUID(),url=chrome.runtime.getURL('offscreen.html');
    const progress=(message,sender)=>{if(message?.target==='ettin-background'&&message.id===id&&sender.id===chrome.runtime.id&&sender.url===url
        && Number.isInteger(message.processed)&&Number.isInteger(message.total)&&message.processed>=0&&message.processed<=message.total)onProgress({processed:message.processed,total:message.total});};
    chrome.runtime.onMessage.addListener(progress);
    try{
        const reply=await chrome.runtime.sendMessage({target:'ettin-offscreen',id,captions,threshold});
        if(!reply?.ok)throw new ClassificationError(['model_unavailable','inference_failed','invalid_output'].includes(reply?.code)?reply.code:'inference_failed');
        if(!['wasm','webgpu'].includes(reply.backend)||reply.model!==MODEL_SPEC.revision||reply.pipelineVersion!==MODEL_SPEC.pipelineVersion)throw new ClassificationError('invalid_output');
        try{validateSegments(reply.segments,captions);}catch{throw new ClassificationError('invalid_output');}
        return reply;
    }catch(error){throw error instanceof ClassificationError?error:new ClassificationError('inference_failed');}
    finally{chrome.runtime.onMessage.removeListener(progress);}
}
