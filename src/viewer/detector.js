// SPDX-License-Identifier: GPL-3.0-or-later
import {validSegments} from './cache.js';
export class DetectorQueue {
    constructor({initialize,descriptor,clock=()=>performance.now()}) {
        Object.assign(this,{initialize,descriptor,clock});this.instance=null;this.loading=null;this.tail=Promise.resolve();this.jobs=new Map();
    }
    cancel(jobId) {const job=this.jobs.get(jobId);if(job)job.cancelled=true;}
    async getInstance() {
        if(this.instance)return this.instance;
        this.loading ||= Promise.resolve().then(this.initialize).then(instance=>{this.instance=instance;return instance;})
            .catch(()=>{throw Object.assign(new Error('model_unavailable'),{code:'model_unavailable'});}).finally(()=>{this.loading=null;});
        return this.loading;
    }
    run(transcript,{jobId,onProgress=()=>{}}) {
        const job={cancelled:false};this.jobs.set(jobId,job);
        const operation=this.tail.then(async()=>{
            const started=this.clock();
            const cancelled=()=>{if(job.cancelled)throw Object.assign(new Error('cancelled'),{code:'cancelled'});};
            cancelled();const adapter=await this.getInstance();cancelled();const loaded=this.clock();
            const result=await adapter.detect(transcript,{jobId,cancelled,onProgress:progress=>{cancelled();onProgress(progress);}});cancelled();
            if(!validSegments(result.segments,transcript.duration))throw Object.assign(new Error('invalid_output'),{code:'invalid_output'});
            return {...result,diagnostics:{...this.descriptor,...result.diagnostics,loadMs:loaded-started,inferenceMs:this.clock()-loaded}};
        }).finally(()=>this.jobs.delete(jobId));
        this.tail=operation.catch(()=>{});return operation;
    }
}
export function mergeSegments(segments) {
    const result=[];
    for(const segment of segments.slice().sort((a,b)=>a.start-b.start)) {
        const last=result.at(-1);
        if(last&&last.category===segment.category&&segment.start<=last.end)last.end=Math.max(last.end,segment.end);
        else result.push({...segment});
    }
    return result;
}
export function createNliAdapter(classify) {
    // Existing NLI model is an experimental comparison baseline, not a measured winner.
    const labels=['paid sponsorship','self promotion','ordinary content'];
    return {async detect(transcript,{cancelled,onProgress}) {
        const {words,duration}=transcript;const segments=[];const size=80,step=40,total=Math.max(1,Math.ceil(Math.max(0,words.length-size)/step)+1);
        for(let i=0,processed=0;i<words.length;i+=step) {
            cancelled();const slice=words.slice(i,i+size);const scores=await classify(slice.map(w=>w.text).join(' '),labels);cancelled();
            for(const [label,category] of [['paid sponsorship','sponsor'],['self promotion','selfpromo']]) {
                if(scores[label]>0.98)segments.push({start:slice[0].start,end:Math.min(duration,slice.at(-1).end),category,score:scores[label]});
            }
            processed++;onProgress({processed,total,segments:mergeSegments(segments)});
            if(i+size>=words.length)break;
        }
        return {segments:mergeSegments(segments),diagnostics:{quality:'experimental; model selection and boundary accuracy unverified'}};
    }};
}
