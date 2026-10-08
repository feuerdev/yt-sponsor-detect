import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {sponsorLabels,DEFAULT_THRESHOLD} from '../src/sponsor-policy.js';
const source=readFileSync(new URL('../src/popup.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
function fixture(enabled=true){
 const elements=new Map(),requests=[];let resolve;const pending=new Promise(done=>resolve=done);
 const element=id=>{if(!elements.has(id))elements.set(id,{checked:false,value:'',textContent:'',disabled:false,events:{},addEventListener(type,fn){this.events[type]=fn;}});return elements.get(id);};
 const context=vm.createContext({sponsorLabels,DEFAULT_THRESHOLD,document:{getElementById:element,addEventListener(type,fn){fn();}},chrome:{runtime:{sendMessage:async request=>{requests.push(request);return pending;}},storage:{sync:{get(defaults,fn){fn({isEnabled:enabled,labels:[{name:'sponsor',blocked:true,threshold:.8}]});},set:async()=>{}}}}});vm.runInContext(source,context);
 return {requests,element,resolve,click:async()=>element('analyze-transcript-btn').events.click?.()};
}
test('popup starts one manual transcript analysis and shows its completed result',async()=>{
 const f=fixture();const work=f.click();assert.equal(f.requests[0]?.type,'ANALYZE_OPEN_TRANSCRIPT');assert.equal(f.element('analyze-transcript-btn').disabled,true);f.click();assert.equal(f.requests.length,1);
 f.resolve({ok:true,segments:1,captionProvenance:{timingResolutionSeconds:1}});await work;assert.equal(f.element('analyze-transcript-btn').disabled,false);assert.match(f.element('transcript-status').textContent,/1 sponsor suggestion/);assert.match(f.element('transcript-status').textContent,/approximate/i);
});
test('popup explains how to recover unavailable public captions',async()=>{
 const f=fixture(),work=f.click();f.resolve({ok:false,code:'captions_unavailable'});await work;assert.match(f.element('transcript-status').textContent,/open.*transcript/i);assert.match(f.element('transcript-status').textContent,/try again/i);
});
test('disabled detection prevents the popup analysis request',async()=>{
 const f=fixture(false);await f.click();assert.equal(f.element('analyze-transcript-btn').disabled,true);assert.equal(f.requests.length,0);
});
