import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {loadSettings,statusText} from '../src/viewer/settings.js';import {formatTime,rangeText,coverageText,behaviorText} from '../src/viewer/ui.js';import {matchesCorrection} from '../src/viewer/corrections.js';
const source=readFileSync(new URL('../src/viewer-popup.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
const tick=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));};
function fixture(state){const elements=new Map(),requests=[];let values={viewerSchema:2,mode:'manual'},reply={state};
 const element=id=>{if(!elements.has(id))elements.set(id,{id,textContent:'',children:[],events:{},hidden:false,disabled:false,addEventListener(type,fn){this.events[type]=fn;},appendChild(child){this.children.push(child);},replaceChildren(){this.children=[];},contains(){return false;},focus(){}});return elements.get(id);};
 const context=vm.createContext({loadSettings,statusText,formatTime,rangeText,coverageText,behaviorText,matchesCorrection,Number,JSON,
 document:{getElementById:element,createElement:tag=>({...element('generated'+elements.size),tag})},window:{addEventListener(){}},setInterval:()=>1,clearInterval(){},
 chrome:{runtime:{sendMessage:async m=>{requests.push(m);return reply;},onMessage:{addListener(){}}},storage:{sync:{get:async()=>values,set:async v=>{values={...values,...v};}},onChanged:{addListener(){}}}}});vm.runInContext(source,context);
 return {element,requests,context,setReply:v=>{reply=v;},click:id=>element(id).events.click(),refresh:()=>vm.runInContext('refresh()',context)};
}
const ready={videoId:'first',token:'a',status:'ready',segments:[{start:10,end:20,category:'sponsor'}],duration:100,diagnostics:{coverage:'partial',coverageStart:10,coverageEnd:30,timing:'estimated'}};
test('popup shows truthful manual mode, checked coverage, estimated intervals and reanalysis for complete empty results',async()=>{
 const f=fixture(ready);await tick();assert.match(f.element('status').textContent,/manual/i);assert.match(f.element('coverage').textContent,/00:10–00:30.*Partial/);
 assert.equal(f.element('retry').hidden,false);assert.equal(f.element('fresh').hidden,false);assert.match(f.element('segments').children[0].children[0].textContent,/Estimated/);
 f.setReply({state:{...ready,segments:[]}});await f.refresh();assert.equal(f.element('retry').hidden,false);assert.match(f.element('status').textContent,/available captions/);
});
test('structured failures and rejected requests preserve video context and recovery actions',async()=>{
 const f=fixture(ready);await tick();f.setReply({error:'unavailable'});await f.refresh();assert.match(f.element('error').textContent,/Try again/);assert.equal(f.element('video').textContent,'Current video · first');
 f.setReply({state:{...ready,status:'invalid_output'}});await f.refresh();assert.match(f.element('status').textContent,/invalid results/);assert.equal(f.element('retry').hidden,false);
});
test('last skip persists after transient notice and actions use current video identity; unavailable Undo is actionable',async()=>{
 const f=fixture({...ready,lastSkip:{segment:ready.segments[0],previousTime:15,available:true}});await tick();assert.equal(f.element('undo').hidden,false);
 f.setReply({error:'playback_unavailable'});await f.click('undo');assert.deepEqual(JSON.parse(JSON.stringify(f.requests.find(m=>m.type==='UNDO_SKIP'))),{type:'UNDO_SKIP',videoId:'first',token:'a'});assert.match(f.element('error').textContent,/after the ad/);
});
test('caption recovery and model preparation show stages without invented progress',async()=>{
 const f=fixture({...ready,status:'loading',stage:'recovering',diagnostics:null});await tick();assert.match(f.element('status').textContent,/transcript/);assert.equal(f.element('progress').textContent,'');
 f.setReply({state:{...ready,status:'analyzing',stage:'initializing',progress:null}});await f.refresh();assert.match(f.element('status').textContent,/Preparing/);
});
