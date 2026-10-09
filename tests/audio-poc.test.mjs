import test from 'node:test';
import assert from 'node:assert/strict';
import {AudioExperiment,MAX_SAMPLES,validateResult} from '../audio-poc/experiment.js';
import {Resampler} from '../audio-poc/resampler.js';
const tick=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));};
function fixture(){
    const timers=new Map(),events=[],f={now:0};let serial=0;
    f.track={stop:()=>{f.stopped=true;},addEventListener:(type,fn)=>{f.ended=fn;}};
    f.stream={getTracks:()=>[f.track]};f.node={port:{},connect:()=>{},disconnect:()=>{}};
    f.source={connections:[],connect:target=>f.source.connections.push(target),disconnect:()=>{}};
    f.context={sampleRate:48000,destination:{audible:true},resume:async()=>{},close:async()=>{f.closed=true;},audioWorklet:{addModule:async()=>{}},createMediaStreamSource:()=>f.source,makeCollector:()=>f.node};
    const experiment=new AudioExperiment({mediaDevices:{getUserMedia:async()=>f.pendingStream?await f.pendingStream:f.stream},createContext:()=>f.context,createWorker:()=>{f.worker={terminate:()=>{f.terminated=true;},postMessage:data=>{f.pcm=data.pcm;}};return f.worker;},workletURL:'local-worklet.js',clock:()=>f.now,notify:state=>events.push(state),timers:{setTimeout:(fn,ms)=>{timers.set(++serial,{fn,ms});return serial;},clearTimeout:id=>timers.delete(id)}});
    Object.assign(f,{experiment,timers,events,feed:(length=4096)=>f.node.port.onmessage({data:new Float32Array(length).fill(.1)})});return f;
}
test('explicit recording preserves audible output, stops tracks before inference and clears worker',async()=>{
    const f=fixture();await f.experiment.start('opaque');assert.ok(f.source.connections.includes(f.context.destination));assert.equal(f.experiment.state.status,'recording');
    f.feed();f.feed();f.now=1000;const finish=f.experiment.finish();await tick();assert.equal(f.stopped,true);assert.equal(f.closed,true);assert.equal(f.pcm.length,8192);
    f.worker.onmessage({data:{text:'Synthetic fixture only',chunks:[{text:'Synthetic fixture only',timestamp:[0,.5]}]}});await finish;
    assert.equal(f.experiment.state.status,'ready');assert.equal(f.experiment.state.seconds,8192/16000);assert.equal(f.terminated,true);assert.equal(f.timers.size,0);
    await f.experiment.cancel();assert.deepEqual(f.experiment.state,{status:'idle'});
});
test('recording is sample-bounded and duplicate starts cannot allocate more streams',async()=>{
    const f=fixture();await f.experiment.start('opaque');await assert.rejects(f.experiment.start('second'),/busy/);
    for(let i=0;i<80;i++)f.feed();await tick();assert.equal(f.pcm.length,MAX_SAMPLES);assert.equal(f.experiment.state.status,'transcribing');
    await f.experiment.cancel();await tick();assert.equal(f.terminated,true);assert.equal(f.timers.size,0);
});
test('cancelling a pending capture stops a late-arriving stream without creating audio context',async()=>{
    const f=fixture();let release;f.pendingStream=new Promise(r=>{release=r;});const pending=f.experiment.start('opaque');
    await f.experiment.cancel();release(f.stream);await pending;assert.equal(f.stopped,true);assert.equal(f.source.connections.length,0);assert.equal(f.experiment.state.status,'idle');
});
test('capture loss, invalid PCM and insufficient recording cannot call transcription',async()=>{
    for(const reason of ['ended','invalid','empty']){const f=fixture();await f.experiment.start('opaque');
        if(reason==='ended')f.ended();else if(reason==='invalid')f.node.port.onmessage({data:Float32Array.of(NaN)});else await f.experiment.finish();
        await tick();assert.equal(f.experiment.state.status,'error');assert.equal(f.worker,undefined);assert.equal(f.stopped,true);assert.equal(f.closed,true);}
});
test('inference failure and timeout terminate workers without retaining audio/results',async()=>{
    for(const mode of ['failure','timeout']){const f=fixture();await f.experiment.start('opaque');f.feed();const pending=f.experiment.finish();await tick();
        if(mode==='failure')f.worker.onerror();else [...f.timers.values()].find(t=>t.ms===120000).fn();
        await pending;assert.equal(f.experiment.state.status,'error');assert.equal(f.terminated,true);assert.equal(f.experiment.job,null);assert.equal(f.timers.size,0);}
});
test('timestamp validation preserves unresolved final ends and rejects invented/out-of-range times',()=>{
    assert.equal(validateResult({text:'fixture',chunks:[{text:'fixture',timestamp:[0,null]}]},1),true);
    for(const timestamp of [[-1,.5],[0,10],[NaN,.5],[.5,.1]])assert.equal(validateResult({text:'fixture',chunks:[{text:'fixture',timestamp}]},1),false);
    assert.equal(validateResult({text:'fixture',chunks:[{text:'a',timestamp:[0,null]},{text:'b',timestamp:[.5,1]}]},1),false);
});
test('streaming downsampling produces 16k mono samples per second and bounded transfers',()=>{
    for(const rate of [16000,44100,48000]){const chunks=[];const resampler=new Resampler(rate,chunk=>chunks.push(chunk));
        resampler.push([new Float32Array(rate).fill(1),new Float32Array(rate).fill(-1)]);
        assert.equal(chunks.reduce((sum,c)=>sum+c.length,0)+resampler.offset,16000);assert.ok(chunks.every(c=>c.length===4096&&c.every(value=>value===0)));}
    assert.throws(()=>new Resampler(8000,()=>{}),/unsupported_rate/);
});
