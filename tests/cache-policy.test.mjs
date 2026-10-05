import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {MODEL_SPEC} from '../src/model-spec.js';
const source=readFileSync(new URL('../src/background.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
const settle=async()=> {for(let i=0;i<4;i++) await new Promise(setImmediate);};
function fixture(saved={}, score=async()=>({sponsor:0.99})) {
    const messages=[], writes=[];
    const settings={isEnabled:true, labels:[{name:'sponsor',threshold:0.9,blocked:true}]};
    let request, message, changed, fetches=0;
    let events=Array.from({length:20},(_,i)=>({tStartMs:i*1000,dDurationMs:1000,segs:[{utf8:'synthetic caption fixture'}]}));
    const context=vm.createContext({URL, Date, MODEL_SPEC,console:{log(){},error(){}},
        env:{backends:{onnx:{wasm:{}}}},classifyText:score,
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
        request:()=>request({tabId:1,url:'https://www.youtube.com/api/timedtext?v=fixture'}),
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
    const f=fixture();f.captions([{tStartMs:-100,dDurationMs:1000,segs:[{utf8:'synthetic caption'}]}]);
    await f.request();await settle();assert.equal(f.writes.length,0);
    assert.equal(f.messages.at(-1).type,'ANALYSIS_ERROR');
});

test('a gap between detected windows never becomes a suggested skip interval', async()=>{
    const f=fixture();
    vm.runInContext(`tabState[1]={videoId:'fixture',foundSegments:[],windowScores:[
        {startTime:0,endTime:2,scores:{sponsor:0.99}},
        {startTime:20,endTime:22,scores:{sponsor:0.99}}]}`,f.context);
    await vm.runInContext(`findAndProcessSponsoredSegments(1,'fixture',[{name:'sponsor',threshold:0.9,blocked:true}])`,f.context);
    assert.deepEqual(f.messages.map(m=>[m.payload.startTime,m.payload.endTime]),[[0,2],[20,22]]);
});
test('completed cache evicts oldest entries to stay bounded',async()=>{
    const saved=Object.fromEntries(Array.from({length:35},(_,i)=>['sponsor-cache:old'+i,{createdAt:i}]));
    const f=fixture(saved);await f.request();await settle();
    assert.equal(Object.keys(saved).length,30);assert.equal(saved['sponsor-cache:old0'],undefined);
    assert.ok(saved['sponsor-cache:fixture']);
});
