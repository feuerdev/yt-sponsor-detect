import test from 'node:test';
import assert from 'node:assert/strict';
import {EttinAdapter} from '../src/viewer/ettin.js';
import {panelToTranscript} from '../src/viewer/panel.js';
import {validateTranscript} from '../src/viewer/transcript.js';
const transcript={videoId:'first',duration:30,timing:'word',words:[{text:'sponsor',start:1,end:2}]};
function fixture(){const workers=[],timers=new Map();let serial=0;
    const adapter=new EttinAdapter({revision:'rev',pipelineVersion:'v',threshold:0.8,createWorker:()=>{const worker={postMessage:message=>{worker.message=message;},terminate:()=>{worker.closed=true;}};workers.push(worker);return worker;},timers:{setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id)}});
    const run=(id='job',input=transcript)=>adapter.detect(input,{jobId:id,cancelled:()=>{},onProgress:p=>{workers.at(-1).progress=p;}});
    const reply=(value={})=>workers.at(-1).onmessage({data:{id:workers.at(-1).message.id,ok:true,model:'rev',pipelineVersion:'v',backend:'wasm',segments:[],...value}});
    return {adapter,workers,timers,run,reply};
}
test('Ettin adapter preserves word times and pinned runtime identity, reuses worker',async()=>{
    const f=fixture();try{const pending=f.run();assert.deepEqual(f.workers[0].message.captions,[{text:'sponsor',start:1,duration:1}]);
        f.reply({progress:{processed:1,total:2}});assert.deepEqual(f.workers[0].progress,{processed:1,total:2,segments:[]});f.reply();assert.equal((await pending).diagnostics.backend,'wasm');
        const next=f.run('next',{...transcript,timing:'estimated'});f.reply();assert.equal((await next).diagnostics.timing,'estimated');assert.equal(f.workers.length,1);
    }finally{f.adapter.reset();}
});
test('cancellation terminates only the matching active worker and releases queued promise',async()=>{
    const f=fixture();const pending=f.run();f.adapter.cancel('other');assert.equal(f.workers[0].closed,undefined);
    f.adapter.cancel('job');await assert.rejects(pending,error=>error.code==='cancelled');assert.equal(f.workers[0].closed,true);assert.equal(f.timers.size,0);
});
test('Ettin rejects a changed pipeline identity and can recover after worker failure',async()=>{
    const f=fixture();try{const first=f.run();f.reply({model:'wrong'});await assert.rejects(first,error=>error.code==='inference_failed');
        const failed=f.run('failed');f.workers[0].onerror();await assert.rejects(failed,error=>error.code==='model_unavailable');
        const retry=f.run('retry');f.reply();assert.equal((await retry).segments.length,0);assert.equal(f.workers.length,2);
    }finally{f.adapter.reset();}
});
const english={isReliable:true,languages:[{language:'en',percentage:100}]};
test('panel recovery preserves partial coverage and omits the unknown final cue',()=>{
    const snapshot={videoId:'first',durationSeconds:1000,incomplete:true,rows:[{start:20,text:'English words'},{start:30,text:'Unknown tail'}]};
    const result=panelToTranscript(snapshot,'first',english);assert.equal(result.coverage,'partial');assert.equal(result.coverageEnd,30);assert.equal(result.words.at(-1).end,30);assert.equal(validateTranscript(result,'first'),true);
    assert.equal(validateTranscript({...result,coverageEnd:25},'first'),false);
});
test('panel recovery requires reliable English and validates current-video identity',()=>{
    const snapshot={videoId:'first',durationSeconds:30,rows:[{start:0,end:30,text:'English caption'}]};
    assert.throws(()=>panelToTranscript(snapshot,'first',{isReliable:true,languages:[{language:'de',percentage:100}]}),/unsupported_language/);
    assert.throws(()=>panelToTranscript(snapshot,'second',english),/captions_unavailable/);
});
