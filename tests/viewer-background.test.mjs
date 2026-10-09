import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {initializeSettings} from '../src/viewer/settings.js';
import {SessionCoordinator} from '../src/viewer/coordinator.js';
import {ResultCache} from '../src/viewer/cache.js';
import {MODEL_SPEC} from '../src/model-spec.js';
const source=readFileSync(new URL('../src/viewer-background.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export const coordinator','const coordinator');
const tick=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));};
const transcript={videoId:'first',duration:30,timing:'word',track:'automatic',language:'en',words:[{text:'sponsor',start:1,end:2}]};
function storage(initial={}){const values={...initial};return {values,get:async key=>key===null?structuredClone(values):{[key]:structuredClone(values[key])},set:async value=>Object.assign(values,structuredClone(value)),remove:async keys=>{for(const key of [].concat(keys))delete values[key];}};}
function fixture(){
    const f={sync:storage(),local:storage(),messages:[],contexts:[],created:0};
    const event=name=>({addListener:fn=>{f[name]=fn;}});
    const chrome={runtime:{id:'extension',getURL:path=>'chrome-extension://extension/'+path,getContexts:async()=>f.contexts,
        onInstalled:event('installed'),onMessage:event('message'),sendMessage:async message=>{f.messages.push(message);if(message.type==='RUN_DETECTION')return {segments:[{start:1,end:4,category:'sponsor'}]};return {};},},
        storage:{sync:f.sync,local:f.local,onChanged:event('changed')},offscreen:{createDocument:async()=>{f.created++;if(f.create)await f.create();f.contexts=[{}];}},
        tabs:{onRemoved:event('removed'),onUpdated:event('updated'),sendMessage:async(id,message)=>{f.messages.push({...message,tabId:id});},query:async()=>[{id:1,url:'https://www.youtube.com/watch?v=first'}]}};
    const context=vm.createContext({chrome,initializeSettings,SessionCoordinator,ResultCache,MODEL_SPEC,URL});vm.runInContext(source,context);
    f.coordinator=vm.runInContext('coordinator',context);
    f.sender={id:'extension',tab:{id:1,url:'https://www.youtube.com/watch?v=first'},url:'https://www.youtube.com/watch?v=first'};
    f.call=(message,sender=f.sender)=>new Promise(resolve=>{if(f.message(message,sender,resolve)!==true)resolve(undefined);});
    return f;
}
test('actual background boot initializes auto defaults and serves first video without popup',async()=>{
    const f=fixture();await tick();assert.equal(f.sync.values.autoSkip,true);
    assert.equal((await f.call({type:'START_SESSION',videoId:'first',token:'a'})).state.status,'loading');
    const result=await f.call({type:'SUBMIT_TRANSCRIPT',token:'a',transcript});assert.equal(result.state.status,'ready');assert.equal(f.created,1);
    assert.ok(f.messages.some(m=>m.type==='RUN_DETECTION'));assert.ok(f.local.values['viewer-cache:first']);
});
test('only current YouTube page identity can open a transcript session',async()=>{
    const f=fixture();await tick();assert.equal(await f.call({type:'START_SESSION',videoId:'second',token:'a'}),undefined);
    assert.equal(await f.call({type:'START_SESSION',videoId:'first',token:'a'},{...f.sender,url:'https://other.example/watch?v=first'}),undefined);
    assert.equal(f.coordinator.sessions.size,0);
});
test('navigation during offscreen creation cancels before allocating inference work',async()=>{
    const f=fixture();await tick();let release;f.create=()=>new Promise(resolve=>{release=resolve;});
    await f.call({type:'START_SESSION',videoId:'first',token:'a'});const pending=f.call({type:'SUBMIT_TRANSCRIPT',token:'a',transcript});await tick();
    f.updated(1,{url:'https://www.youtube.com/watch?v=second'});release();assert.equal((await pending).state,null);
    assert.equal(f.messages.some(m=>m.type==='RUN_DETECTION'),false);assert.equal(f.local.values['viewer-cache:first'],undefined);
});
test('same-video URL changes preserve session, next video and tab removal clear it',async()=>{
    const f=fixture();await tick();await f.call({type:'START_SESSION',videoId:'first',token:'a'});
    f.updated(1,{url:'https://www.youtube.com/watch?v=first&t=10'});assert.equal(f.coordinator.sessions.size,1);
    f.updated(1,{url:'https://www.youtube.com/watch?v=second'});assert.equal(f.coordinator.sessions.size,0);
    await f.call({type:'START_SESSION',videoId:'first',token:'b'});f.removed(1);assert.equal(f.coordinator.sessions.size,0);
});
test('popup pause and status route through active tab, disable prevents cached restore',async()=>{
    const f=fixture();await tick();await f.call({type:'START_SESSION',videoId:'first',token:'a'});await f.call({type:'SUBMIT_TRANSCRIPT',token:'a',transcript});
    const popup={id:'extension',url:'chrome-extension://extension/popup.html'};
    assert.equal((await f.call({type:'GET_VIDEO_STATUS'},popup)).state.status,'ready');
    assert.equal((await f.call({type:'PAUSE_VIDEO',paused:true},popup)).state.paused,true);
    await f.sync.set({isEnabled:false});f.changed({isEnabled:{newValue:false}},'sync');
    assert.equal((await f.call({type:'START_SESSION',videoId:'first',token:'b'})).state.status,'disabled');
});
