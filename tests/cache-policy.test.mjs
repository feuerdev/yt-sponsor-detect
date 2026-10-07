import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {MODEL_SPEC} from '../src/model-spec.js';
import {sponsorLabels} from '../src/sponsor-policy.js';
import {validateSegments} from '../src/caption-contract.js';
const source=readFileSync(new URL('../src/background.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
const settle=async()=> {for(let i=0;i<4;i++) await new Promise(setImmediate);};
function fixture(saved={}, score=async()=>({sponsor:0.99})) {
    const messages=[], writes=[];
    const settings={isEnabled:true, labels:[{name:'sponsor',threshold:0.9,blocked:true}]};
    let request, message, changed, fetches=0;
    let events=Array.from({length:20},(_,i)=>({tStartMs:i*1000,dDurationMs:1000,segs:[{utf8:'synthetic caption fixture'}]}));
    const context=vm.createContext({URL, Date, MODEL_SPEC,sponsorLabels,validateSegments,console:{log(){},error(){}},
        env:{backends:{onnx:{wasm:{}}}},classifyCaptions:async(captions,threshold,onProgress)=>{const s=await score(captions);onProgress?.({processed:1,total:1});return s.segments?s:{segments:s.sponsor>threshold?[{start:Number(captions[0].start),end:Number(captions.at(-1).start)+Number(captions.at(-1).duration),category:'sponsor',score:s.sponsor}]:[]};},
        fetch:async()=> {fetches++;return {ok:true,text:async()=>JSON.stringify({events})};},
        chrome:{runtime:{id:'fixture',onMessage:{addListener(fn){message=fn;}}},
            webRequest:{onCompleted:{addListener(fn){request=fn;}}},
            tabs:{sendMessage:async(id,m)=>messages.push(m),onRemoved:{addListener(){}}},
            storage:{onChanged:{addListener(fn){changed=fn;}},sync:{get:async()=>structuredClone(settings)},
                local:{get:async key=> key === null ? structuredClone(saved) : {[key]:structuredClone(saved[key])},
                    set:async value=>{writes.push(value);Object.assign(saved,structuredClone(value));},
                    remove:async keys=> {for(const key of [].concat(keys)) delete saved[key];}}}}});
    vm.runInContext(source,context);
    return {context,saved,messages,writes,settings,get fetches(){return fetches;},
        request:(tabId=1,videoId='fixture',language='en')=>request({tabId,url:`https://www.youtube.com/api/timedtext?v=${videoId}&lang=${language}`}),
        change: updates=>{Object.assign(settings,updates); changed(Object.fromEntries(Object.entries(updates).map(([k,v])=>[k,{newValue:v}])),'sync');},
        captions:value=>{events=value;},
        cache:()=>new Promise(resolve=>message({type:'GET_CACHED_SEGMENTS',videoId:'fixture'},{},resolve))};
}
test('completed suggestions survive worker restart under exactly the same policy',async()=>{
    const f=fixture(); await f.request(); await settle();
    assert.equal(f.writes.length,1); assert.equal((await f.cache()).segments.length,1);
    const restart=fixture(f.saved); assert.equal((await restart.cache()).segments.length,1);
    assert.equal(restart.fetches,0);
});
test('changed threshold, label or blocked status cannot reuse cached decisions',async()=>{
    const f=fixture();await f.request();await settle();
    for(const patch of [{threshold:0.999},{name:'ordinary'},{blocked:false}]) {
        const restart=fixture(f.saved);restart.settings.labels=[{...restart.settings.labels[0],...patch}];
        assert.equal((await restart.cache()).segments.length,0);
    }
});
test('legacy, incomplete, expired and invalid-boundary cache entries are rejected',async()=>{
    const f=fixture();await f.request();await settle();const good=f.saved['sponsor-cache:fixture'];
    for(const entry of [[{startTime:0,endTime:20}],{...good,complete:false},{...good,createdAt:Date.now()-49*3600000},
        {...good,segments:[{startTime:10,endTime:3,label:'sponsor'}]},{...good,policyKey:'different-model'}]) {
        const restart=fixture({'sponsor-cache:fixture':entry});assert.equal((await restart.cache()).segments.length,0);
    }
});
test('disable or policy change cancels an in-flight classifier and its cache write',async()=>{
    for(const update of [{isEnabled:false},{labels:[{name:'sponsor',threshold:0.999,blocked:true}]}]) {
        let resolve;const pending=new Promise(done=>{resolve=done;});const f=fixture({},()=>pending);
        await f.request();await settle();f.change(update);resolve({sponsor:0.99});await settle();
        assert.equal(f.writes.length,0);assert.equal(f.messages.some(m=>m.type==='SPONSORED_SEGMENT_FOUND'),false);
        assert.equal((await f.cache()).segments.length,0);
    }
});
test('repeated timedtext responses do not duplicate captions or analysis',async()=>{
    const f=fixture();await f.request();await settle();await f.request();await settle();
    assert.equal(f.fetches,1);assert.equal(f.writes.length,1);
});
test('invalid caption boundaries fail visibly without segment or completed cache',async()=>{
    for (const boundaries of [{tStartMs:-100,dDurationMs:1000}, {tStartMs:0}, {tStartMs:0,dDurationMs:0}]) {
        const f=fixture();f.captions([{...boundaries,segs:[{utf8:'synthetic caption'}]}]);
        await f.request();await settle();assert.equal(f.writes.length,0);
        assert.equal(f.messages.at(-1).type,'ANALYSIS_ERROR');
    }
});

test('separated model intervals are not expanded across ordinary time',async()=>{
 const f=fixture({},async()=>({segments:[{start:0,end:2,category:'sponsor',score:.99},{start:18,end:20,category:'sponsor',score:.99}]}));
 await f.request();await settle();
 assert.deepEqual(f.messages.filter(m=>m.type==='SPONSORED_SEGMENT_FOUND').map(m=>[m.payload.startTime,m.payload.endTime]),[[0,2],[18,20]]);
});
test('completed cache evicts oldest entries to stay bounded',async()=>{
    const saved=Object.fromEntries(Array.from({length:35},(_,i)=>['sponsor-cache:old'+i,{createdAt:i}]));
    const f=fixture(saved);await f.request();await settle();
    assert.equal(Object.keys(saved).length,30);assert.equal(saved['sponsor-cache:old0'],undefined);
    assert.ok(saved['sponsor-cache:fixture']);
});

test('whitespace-only JSON3 separators do not invalidate speech captions',async()=>{
    for (const duration of [undefined, 0]) {
        const f=fixture();
        f.captions([
            {tStartMs:0,dDurationMs:20000,id:1,wpWinPosId:1,wsWinStyleId:1},
            ...Array.from({length:20},(_,i)=>({tStartMs:i*1000,dDurationMs:1000,
                wWinId:1,segs:[{utf8:'synthetic speech caption'}]})),
            {tStartMs:1000,dDurationMs:duration,wWinId:1,aAppend:1,segs:[{utf8:'\n'}]},
        ]);
        await f.request();await settle();
        assert.equal(f.messages.some(m=>m.type==='ANALYSIS_ERROR'),false);
        assert.equal((await f.cache()).segments.length,1);
    }
});

test('the same caption request retries after a transient classifier failure',async()=>{
    let attempts=0;
    const f=fixture({},async()=>{
        if (++attempts===1) throw Object.assign(new Error('transient'),{code:'model_unavailable'});
        return {sponsor:0.99};
    });
    await f.request();await settle();
    assert.equal(f.messages.at(-1).type,'ANALYSIS_ERROR');
    assert.equal(f.writes.length,0);
    await f.request();await settle();
    assert.equal((await f.cache()).segments.length,1);
    assert.equal(f.messages.at(-1).type,'ANALYSIS_FINISHED');
    await f.request();await settle();
    assert.equal(f.fetches,2);
    assert.equal(f.writes.length,1);
});

test('concurrent analyses keep completed caches within the video limit',async()=>{
    const saved=Object.fromEntries(Array.from({length:30},(_,i)=>['sponsor-cache:old'+i,{createdAt:i}]));
    const f=fixture(saved);
    await Promise.all([f.request(1,'first'),f.request(2,'second')]);await settle();
    assert.equal(Object.keys(saved).length,30);
    assert.ok(saved['sponsor-cache:first']);
    assert.ok(saved['sponsor-cache:second']);
    assert.equal(saved['sponsor-cache:old0'],undefined);
    assert.equal(saved['sponsor-cache:old1'],undefined);
});

test('a failed cache write does not prevent another tab from completing',async()=>{
    const f=fixture();
    const save=f.context.chrome.storage.local.set;
    let attempts=0;
    f.context.chrome.storage.local.set=async value=>{
        if (++attempts===1) throw new Error('storage temporarily unavailable');
        await save(value);
    };
    await Promise.all([f.request(1,'first'),f.request(2,'second')]);await settle();
    assert.equal(f.saved['sponsor-cache:first'],undefined);
    assert.ok(f.saved['sponsor-cache:second']);
    assert.equal(f.messages.at(-1).type,'ANALYSIS_FINISHED');
});

test('policy changes cancel cache writes waiting behind another tab',async()=>{
    const f=fixture();
    const get=f.context.chrome.storage.local.get;
    let release;
    const pending=new Promise(resolve=>{release=resolve;});
    f.context.chrome.storage.local.get=key=>key===null?pending:get(key);
    await Promise.all([f.request(1,'first'),f.request(2,'second')]);await settle();
    f.change({isEnabled:false});
    release({});await settle();
    assert.equal(f.writes.length,0);
    assert.equal(Object.keys(f.saved).length,0);
});

test('short tracks and the final captions are included in full-track classification',async()=>{
 for(const count of [3,27]){
  let seen;const f=fixture({},async captions=>{seen=captions;return {segments:[{start:count-1,end:count,category:'sponsor',score:.99}]};});
  f.captions(Array.from({length:count},(_,i)=>({tStartMs:i*1000,dDurationMs:1000,segs:[{utf8:'short'}]})));
  await f.request();await settle();
  assert.equal(seen.length,count);assert.equal((await f.cache()).segments[0].startTime,count-1);
 }
});

test('non-English and unidentified caption languages do not load the English-only model',async()=>{
 for(const language of ['de','']){
  let calls=0;const f=fixture({},async()=>{calls++;return {sponsor:.99};});
  await f.request(1,'fixture',language);await settle();
  assert.equal(calls,0);assert.equal(f.writes.length,0);assert.equal(f.messages.at(-1).type,'ANALYSIS_ERROR');
 }
});
