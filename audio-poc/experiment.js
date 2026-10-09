// SPDX-License-Identifier: GPL-3.0-or-later
export const SAMPLE_RATE=16000,MAX_SECONDS=20,MAX_SAMPLES=SAMPLE_RATE*MAX_SECONDS;
export function validateResult(value,seconds) {
    if(!value||typeof value.text!=='string'||value.text.length>20000||!Array.isArray(value.chunks)||value.chunks.length>2000)return false;
    let previous=0;
    return value.chunks.every((chunk,index)=>{
        const [start,end]=chunk.timestamp||[];
        if(typeof chunk.text!=='string'||!Number.isFinite(start)||start<previous||start>seconds+0.5||(end===null?index!==value.chunks.length-1:!Number.isFinite(end)||end<start||end>seconds+0.5))return false;
        previous=start;return true;
    });
}
export class AudioExperiment {
    constructor({mediaDevices,createContext,createWorker,workletURL,notify=()=>{},timers=globalThis,clock=()=>performance.now()}) {
        Object.assign(this,{mediaDevices,createContext,createWorker,workletURL,notify,timers,clock});this.job=null;this.state={status:'idle'};
    }
    publish(job,value){if(this.job===job){this.state={...value};this.notify(this.state);}}
    async cleanup(job) {
        if(!job)return;
        if(job.timer!==undefined){this.timers.clearTimeout(job.timer);delete job.timer;}
        job.source?.disconnect();job.node?.disconnect();
        for(const track of job.stream?.getTracks()||[])track.stop();
        if(job.context){const context=job.context;job.context=null;await context.close().catch(()=>{});}
    }
    async cancel() {
        const job=this.job;this.job=null;if(job){job.worker?.terminate();job.reject?.(new Error('cancelled'));await this.cleanup(job);job.chunks=[];}
        this.state={status:'idle'};this.notify(this.state);
    }
    async start(streamId) {
        if(this.job)throw new Error('busy');
        if(typeof streamId!=='string'||!streamId||streamId.length>1000)throw new Error('invalid_stream');
        const job={chunks:[],length:0,started:this.clock()};this.job=job;this.publish(job,{status:'starting'});
        try {
            const stream=await this.mediaDevices.getUserMedia({audio:{mandatory:{chromeMediaSource:'tab',chromeMediaSourceId:streamId}},video:false});
            job.stream=stream;if(this.job!==job){await this.cleanup(job);return;}
            job.context=this.createContext({sampleRate:SAMPLE_RATE});job.sampleRate=job.context.sampleRate;
            job.source=job.context.createMediaStreamSource(stream);
            // Tab capture suppresses original output. Preserve listening immediately.
            job.source.connect(job.context.destination);await job.context.resume();
            await job.context.audioWorklet.addModule(this.workletURL);
            if(this.job!==job){await this.cleanup(job);return;}
            job.node=job.context.makeCollector();job.source.connect(job.node);job.node.connect(job.context.destination);
            job.node.port.onmessage=({data})=>{
                if(this.job!==job||job.finishing||!(data instanceof Float32Array)||!data.length||data.length>4096)return;
                if(!data.every(Number.isFinite)){void this.fail(job,'invalid_audio');return;}
                const remaining=MAX_SAMPLES-job.length;const chunk=data.slice(0,remaining);job.chunks.push(chunk);job.length+=chunk.length;
                this.publish(job,{status:'recording',seconds:job.length/SAMPLE_RATE});
                if(job.length>=MAX_SAMPLES)void this.finish(job);
            };
            for(const track of stream.getTracks())track.addEventListener('ended',()=>{if(this.job===job&&!job.finishing)void this.fail(job,'capture_ended');},{once:true});
            job.recordingStarted=this.clock();this.publish(job,{status:'recording',seconds:0});
            job.timer=this.timers.setTimeout(()=>this.finish(job),MAX_SECONDS*1000);
        }catch{if(this.job===job)await this.fail(job,'capture_failed');else await this.cleanup(job);}
    }
    async fail(job,error) {
        if(this.job!==job)return;job.finishing=true;job.worker?.terminate();job.reject?.(new Error(error));await this.cleanup(job);
        if(this.job!==job)return;job.chunks=[];this.job=null;this.state={status:'error',error};this.notify(this.state);
    }
    async finish(job=this.job) {
        if(!job||this.job!==job||job.finishing)return;
        job.finishing=true;
        const captureMs=this.clock()-job.recordingStarted;await this.cleanup(job);
        if(this.job!==job)return;
        if(job.length<SAMPLE_RATE/4){await this.fail(job,'insufficient_audio');return;}
        const pcm=new Float32Array(job.length);let offset=0;for(const chunk of job.chunks){pcm.set(chunk,offset);offset+=chunk.length;}job.chunks=[];
        const seconds=pcm.length/SAMPLE_RATE;const inferenceStarted=this.clock();
        this.publish(job,{status:'transcribing',seconds,captureMs});
        try {
            job.worker=this.createWorker();
            const result=await new Promise((resolve,reject)=>{
                job.reject=reject;job.worker.onmessage=({data})=>data?.error?reject(new Error('transcription_failed')):resolve(data);
                job.worker.onerror=()=>reject(new Error('transcription_failed'));
                job.inferenceTimer=this.timers.setTimeout(()=>reject(new Error('transcription_timeout')),120000);
                job.worker.postMessage({pcm,sampleRate:SAMPLE_RATE},[pcm.buffer]);
            });
            if(this.job!==job)return;
            if(!validateResult(result,seconds))throw new Error('invalid_transcript');
            this.state={status:'ready',...result,seconds,captureMs,inferenceMs:this.clock()-inferenceStarted,sampleRate:job.sampleRate,timeline:'seconds since captured audio began; not YouTube video timestamps'};this.notify(this.state);this.job=null;
        }catch(error){if(this.job===job)await this.fail(job,error.message==='transcription_timeout'?'transcription_timeout':'transcription_failed');}
        finally{if(job.inferenceTimer!==undefined)this.timers.clearTimeout(job.inferenceTimer);job.worker?.terminate();}
    }
}
