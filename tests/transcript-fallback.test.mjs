import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {MODEL_SPEC} from '../src/model-spec.js';
import {sponsorLabels} from '../src/sponsor-policy.js';
import {validateSegments} from '../src/caption-contract.js';
import {captureOpenTranscript,panelCaptions} from '../src/transcript-panel.js';
const source=readFileSync(new URL('../src/background.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const tick=()=>new Promise(setImmediate);
function fixture(){
 const f={messages:[],writes:[],classifications:[],reads:[],settings:{isEnabled:true,labels:[{name:'sponsor',threshold:.8,blocked:true}]},tab:{id:1,url:'https://www.youtube.com/watch?v=abcdefghijk'},language:{isReliable:true,languages:[{language:'en',percentage:100}]},snapshot:{videoId:'abcdefghijk',durationSeconds:20,rows:[{start:0,text:'Our first English caption.'},{start:10,text:'Our final English caption.'}]}};
 const context=vm.createContext({URL,MODEL_SPEC,sponsorLabels,validateSegments,captureOpenTranscript,panelCaptions,console:{log(){},error(){}},
  classifyCaptions:async(captions,threshold)=>{f.classifications.push({captions,threshold});return {segments:[{start:10,end:19,category:'sponsor',score:.9}],backend:'wasm'};},
  fetch:async()=>{f.fetching=deferred();return f.fetching.promise;},
  chrome:{runtime:{id:'fixture',getURL:file=>'chrome-extension://fixture/'+file,onMessage:{addListener:fn=>f.handler=fn}},
   scripting:{executeScript:async options=>{f.reads.push(options);return f.scriptPending?f.scriptPending.promise:[{frameId:0,result:f.snapshot,documentId:'doc1'}];}},
   i18n:{detectLanguage:async text=>{f.languageText=text;return f.languagePending?f.languagePending.promise:f.language;}},
   tabs:{query:async()=>[f.tab],get:async()=>f.tab,sendMessage:async(id,m)=>f.messages.push(m),onRemoved:{addListener:fn=>f.removed=fn},onUpdated:{addListener:fn=>f.updated=fn}},
   webRequest:{onCompleted:{addListener:fn=>f.captions=fn}},
   storage:{sync:{get:async()=>f.settings},onChanged:{addListener:fn=>f.changed=fn},local:{get:async()=>({}),remove:async()=>{},set:async entry=>f.writes.push(entry)}}}});
 vm.runInContext(source,context);f.state=()=>vm.runInContext('tabState[1]',context);
 f.request=(sender={id:'fixture',url:'chrome-extension://fixture/popup.html'})=>{f.reply=undefined;f.handler({type:'ANALYZE_OPEN_TRANSCRIPT'},sender,reply=>f.reply=reply);};
 f.finished=async()=>{for(let i=0;i<20&&!f.reply;i++)await tick();return f.reply;};return f;
}
test('popup analyzes the open English panel through the real caption/classifier/cache path',async()=>{
 const f=fixture();f.request();const reply=await f.finished();assert.equal(reply?.ok,true);assert.equal(f.classifications.length,1);
 assert.equal(f.classifications[0].captions.length,2);assert.equal(f.classifications[0].threshold,.8);assert.equal(f.reads[0].world,'MAIN');
 assert.equal(f.reads[0].func,captureOpenTranscript);assert.deepEqual(JSON.parse(JSON.stringify(f.reads[0].target)),{tabId:1,frameIds:[0]});
 assert.equal(f.writes[0]['sponsor-cache:abcdefghijk'].captionProvenance.captionSource,'public-transcript-panel');
 assert.deepEqual(f.messages.map(m=>m.type),['CLEAR_SEGMENTS','ANALYSIS_STARTED','SPONSORED_SEGMENT_FOUND','ANALYSIS_FINISHED']);
});
test('page and content-script senders cannot invoke public transcript capture',async()=>{
 const f=fixture();f.request({id:'fixture',url:'https://www.youtube.com/watch?v=abcdefghijk'});assert.equal((await f.finished())?.code,'invalid_request');assert.equal(f.reads.length,0);
});
test('disabled detection does not read public captions or run the model',async()=>{
 const f=fixture();f.settings.isEnabled=false;f.request();assert.equal((await f.finished())?.code,'disabled');assert.equal(f.reads.length,0);assert.equal(f.classifications.length,0);
});
test('an unavailable panel returns an actionable failure with no successful cache',async()=>{
 const f=fixture();f.snapshot=null;f.request();assert.equal((await f.finished())?.code,'captions_unavailable');assert.equal(f.writes.length,0);assert.equal(f.classifications.length,0);
});
test('English verification rejects other languages before model inference',async()=>{
 const f=fixture();f.language={isReliable:true,languages:[{language:'de',percentage:100}]};f.request();assert.equal((await f.finished())?.code,'unsupported_language');assert.equal(f.classifications.length,0);
});
for(const boundary of ['capture','language'])test('navigation during '+boundary+' cannot analyze or cache the old video',async()=>{
 const f=fixture(),pending=deferred();if(boundary==='capture')f.scriptPending=pending;else f.languagePending=pending;
 f.request();await tick();f.tab={id:1,url:'https://www.youtube.com/watch?v=other-video'};f.updated(1,{url:f.tab.url});
 pending.resolve(boundary==='capture'?[{frameId:0,result:f.snapshot}]:f.language);assert.equal((await f.finished())?.code,'cancelled');assert.equal(f.classifications.length,0);assert.equal(f.writes.length,0);
});
test('disabling detection during English verification cancels the panel request',async()=>{
 const f=fixture();f.languagePending=deferred();f.request();await tick();f.settings.isEnabled=false;f.changed({isEnabled:{newValue:false}},'sync');f.languagePending.resolve(f.language);
 assert.equal((await f.finished())?.code,'cancelled');assert.equal(f.classifications.length,0);
});
test('an older empty caption response cannot clear a successful manual panel result',async()=>{
 const f=fixture();const old=f.captions({tabId:1,url:'https://www.youtube.com/api/timedtext?v=abcdefghijk&lang=en'});await tick();f.request();assert.equal((await f.finished())?.ok,true);
 f.fetching.resolve({ok:true,text:async()=>''});await old;assert.equal(f.state()?.captionProvenance.captionSource,'public-transcript-panel');assert.equal(f.messages.filter(m=>m.type==='ANALYSIS_ERROR').length,0);
});

test('normal watch-page cache request acquires captions without CC or popup actions',async()=>{
 const f=fixture();
 f.handler({type:'GET_CACHED_SEGMENTS',videoId:'abcdefghijk'},{id:'fixture',frameId:0,url:f.tab.url,tab:f.tab},()=>{});
 for(let i=0;i<30&&!f.classifications.length;i++)await tick();
 assert.equal(f.classifications.length,1);
 assert.equal(f.reads[0].func,captureOpenTranscript);
 assert.deepEqual(JSON.parse(JSON.stringify(f.reads[0].args)),['abcdefghijk',true]);
 assert.equal(f.writes.length,1);
});
test('automatic caption acquisition deduplicates player rebindings',async()=>{
 const f=fixture();f.scriptPending=deferred();
 const sender={id:'fixture',frameId:0,url:f.tab.url,tab:f.tab};
 f.handler({type:'GET_CACHED_SEGMENTS',videoId:'abcdefghijk'},sender,()=>{});await tick();
 f.handler({type:'GET_CACHED_SEGMENTS',videoId:'abcdefghijk'},sender,()=>{});await tick();
 assert.equal(f.reads.length,1);
 f.scriptPending.resolve([{frameId:0,result:f.snapshot}]);await tick();await tick();
 assert.equal(f.classifications.length,1);
});
test('foreign-page cache requests never open a transcript panel',async()=>{
 const f=fixture();f.handler({type:'GET_CACHED_SEGMENTS',videoId:'abcdefghijk'},{id:'fixture',frameId:0,url:'https://example.com/',tab:{id:1,url:'https://example.com/'}},()=>{});
 await tick();assert.equal(f.reads.length,0);
});

test('a content script originating on YouTube home can acquire after SPA navigation',async()=>{
 const f=fixture();
 f.handler({type:'GET_CACHED_SEGMENTS',videoId:'abcdefghijk'},{id:'fixture',frameId:0,url:'https://www.youtube.com/',tab:f.tab},()=>{});
 for(let i=0;i<30&&!f.classifications.length;i++)await tick();
 assert.equal(f.classifications.length,1);
});
