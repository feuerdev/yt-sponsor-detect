// SPDX-License-Identifier: GPL-3.0-or-later
// Retains the existing pinned Ettin/Flow worker and CPU fallback.
export class EttinAdapter {
    constructor({createWorker,threshold,revision,pipelineVersion,timers=globalThis}){Object.assign(this,{createWorker,threshold,revision,pipelineVersion,timers});this.worker=null;this.pending=null;}
    reset(error='model_unavailable'){this.worker?.terminate();this.worker=null;this.timers.clearTimeout(this.idleTimer);
        if(this.pending){const pending=this.pending;this.pending=null;this.timers.clearTimeout(pending.timer);pending.reject(Object.assign(Error(error),{code:error}));}}
    cancel(jobId){if(this.pending?.jobId===jobId)this.reset('cancelled');}
    async detect(transcript,{jobId,cancelled,onProgress}) {
        cancelled();
        if(!this.worker){this.worker=this.createWorker();this.worker.onerror=()=>this.reset('model_unavailable');
            this.worker.onmessage=({data})=>{
                const pending=this.pending;if(!pending||data.id!==pending.jobId)return;
                if(data.progress){pending.onProgress({...data.progress,segments:[]});return;}
                this.pending=null;this.timers.clearTimeout(pending.timer);
                if(!data.ok||data.model!==this.revision||data.pipelineVersion!==this.pipelineVersion||!['wasm','webgpu'].includes(data.backend))pending.reject(Object.assign(Error('inference_failed'),{code:'inference_failed'}));
                else pending.resolve({segments:data.segments,diagnostics:{model:'ettin-int8',revision:data.model,backend:data.backend,pipelineVersion:data.pipelineVersion,timing:pending.timing}});
                this.idleTimer=this.timers.setTimeout(()=>this.reset(),60000);
            };}
        this.timers.clearTimeout(this.idleTimer);
        return new Promise((resolve,reject)=>{
            this.pending={jobId,resolve,reject,onProgress,timing:transcript.timing,timer:this.timers.setTimeout(()=>this.reset('inference_failed'),180000)};
            try{this.worker.postMessage({id:jobId,captions:transcript.words.map(w=>({text:w.text,start:w.start,duration:w.end-w.start})),threshold:this.threshold});}
            catch{this.reset('model_unavailable');}
        });
    }
}
