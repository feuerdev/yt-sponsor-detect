import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync}from'node:fs';import vm from'node:vm';
const source=readFileSync(new URL('../src/offscreen.js',import.meta.url),'utf8');
function fixture(throws=false){let listener,worker;const timers=new Map(),progress=[];let counter=0;
 const context=vm.createContext({setTimeout:(fn,ms)=>{timers.set(++counter,{fn,ms});return counter;},clearTimeout:id=>timers.delete(id),
 Worker:class{constructor(){worker=this;this.messages=[];this.terminated=false;}postMessage(m){if(throws)throw Error('worker unavailable');this.messages.push(m);}terminate(){this.terminated=true;}},
 chrome:{runtime:{id:'fixture',getURL:x=>'chrome-extension://fixture/'+x,onMessage:{addListener:f=>listener=f},sendMessage:async m=>progress.push(m)}}});vm.runInContext(source,context);
 const sender={id:'fixture'};return {request:(id,reply,s=sender)=>listener({target:'ettin-offscreen',id,captions:[],threshold:.8},s,reply),get worker(){return worker;},timers,progress};
}
test('offscreen forwards correlated results/progress and releases an idle worker',()=>{
 const f=fixture(),results=[];f.request('one',r=>results.push(r));f.worker.onmessage({data:{id:'one',progress:{processed:1,total:2}}});
 assert.equal(f.progress.length,1);assert.equal(results.length,0);f.worker.onmessage({data:{id:'one',ok:true,segments:[]}});assert.equal(results.length,1);
 const idle=[...f.timers.values()].find(t=>t.ms===60000);idle.fn();assert.equal(f.worker.terminated,true);
});
test('a worker failure resolves every pending request and allows a fresh worker',()=>{
 const f=fixture(),results=[];f.request('one',r=>results.push(r));f.request('two',r=>results.push(r));const old=f.worker;old.onerror();
 assert.equal(old.terminated,true);assert.equal(results.length,2);assert.ok(results.every(r=>r.code==='inference_failed'));f.request('three',()=>{});assert.notEqual(f.worker,old);
});
test('a failed post resolves its request once and content-script requests are ignored',()=>{
 const f=fixture(true),results=[];f.request('blocked',r=>results.push(r),{id:'fixture',tab:{id:1}});assert.equal(f.worker,undefined);
 f.request('one',r=>results.push(r));assert.equal(results.length,1);
});
