import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {captureOpenTranscript,cancelTranscriptRecovery} from '../src/transcript-panel.js';
const id='abcdefghijk';const captureSource='('+captureOpenTranscript.toString()+')',cancelSource='('+cancelTranscriptRecovery.toString()+')';
function fixture({search='',initiallyOpen=false,missingClose=false,displaced=false}={}) {
 const f={open:initiallyOpen,opens:0,closes:0,scrolls:[],focused:0,ready:false,otherOpen:displaced,otherReopens:0};const timers=[],handlers=new Map();
 const location={href:'https://www.youtube.com/watch?v='+id};
 const original={isConnected:true,focus:()=>f.focused++};
 const player={getVideoData:()=>({video_id:id}),getDuration:()=>20};
 const panel={id:'transcript',isConnected:true,data:{},contains:target=>target?.inTranscript,
 getAttribute:name=>name==='target-id'?'transcript':f.open?'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED':'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN',getBoundingClientRect:()=>({width:f.open?400:0,height:f.open?600:0}),
 querySelector:s=>s.includes('input')?{value:search}:s.includes('ytd-transcript-renderer')?{}:s.includes('visibility-button')&&!missingClose?{click:()=>{f.open=false;f.closes++;}}:null};
 const opener={isConnected:true,getAttribute:()=>null,data:{command:{showEngagementPanelEndpoint:{panelIdentifier:'other'}}},click:()=>{f.otherOpen=true;f.otherReopens++;}};
 const other={id:'other',contains:()=>false,getAttribute:name=>name==='target-id'?'other':f.otherOpen?'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED':'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN',getBoundingClientRect:()=>({width:f.otherOpen?400:0,height:f.otherOpen?600:0}),querySelector:()=>null};
 const doc={activeElement:original,body:{},querySelector:s=>s==='#movie_player'?player:s.includes('transcript-section')?{click:()=>{f.open=true;f.opens++;f.otherOpen=false;}}:null,
 querySelectorAll:s=>s.startsWith('ytd-engagement')?(displaced?[other,panel]:[panel]):[opener],addEventListener:(type,fn)=>handlers.set(type,fn),removeEventListener:type=>handlers.delete(type)};
 const window={scrollX:10,scrollY:200,scrollTo:(x,y)=>f.scrolls.push([x,y])};
 const context=vm.createContext({URL,Date,Set,window,location,document:doc,setTimeout:fn=>{timers.push(fn);return timers.length;}});
 Object.assign(f,{window,location,context,panel,doc,start:token=>vm.runInContext(captureSource+'("'+id+'",true,"'+token+'")',context),cancel:token=>vm.runInContext(cancelSource+'("'+id+'","'+token+'")',context),
 event:(type,target={},key)=>handlers.get(type)?.({type,target,key,isTrusted:true}),release:()=>timers.shift()?.(),readyRows:()=>{panel.data={contents:[{transcriptSegmentViewModel:{timestamp:'0:00',simpleText:'First caption.'}},{transcriptSegmentViewModel:{timestamp:'0:10',simpleText:'Last caption.'}}]};}});return f;
}
test('ordinary player keyboard/pointer input does not strand the panel; owned scroll and displaced panel restore',async()=>{
 const f=fixture({displaced:true});const work=f.start('a');assert.equal(f.opens,1);
 const target={closest:s=>s==='#movie_player'?{}:null};f.event('pointerdown',target);f.event('keydown',target,'ArrowUp');f.readyRows();f.release();const result=await work;
 assert.equal(result.rows.length,2);assert.equal(f.closes,1);assert.equal(f.otherReopens,1);assert.deepEqual(f.scrolls,[[10,200]]);
});
test('deliberate transcript editing keeps extension-opened panel and newer scroll/focus',async()=>{
 const f=fixture();const work=f.start('a');f.event('input',{inTranscript:true});f.event('wheel');f.readyRows();f.release();
 const result=await work;assert.equal(result.recovery.userOwned,true);assert.equal(f.closes,0);assert.deepEqual(f.scrolls,[]);
});
test('cancellation cleans once, stale cancellation does not abort newer operation, and retries settle ownership',async()=>{
 const f=fixture();const first=f.start('a');const second=f.start('b');await Promise.resolve();assert.equal(f.closes,1);await Promise.resolve();await Promise.resolve();
 await f.cancel('a');assert.equal(f.window.__ssTranscriptRecovery.requestId,'b');
 f.readyRows();f.release();f.release();await second;await first;assert.equal(f.opens,2);assert.equal(f.closes,2);await f.cancel('b');assert.equal(f.closes,2);
});
test('cancel before capture and SPA navigation cannot mutate a newer video',async()=>{
 const f=fixture();await f.cancel('a');const result=await f.start('a');assert.equal(result.recovery.reason,'cancelled');assert.equal(f.opens,0);
 const work=f.start('b');f.location.href='https://www.youtube.com/watch?v=second';await f.cancel('b');await work;assert.equal(f.closes,0);assert.deepEqual(f.scrolls,[]);
});
test('missing native close control reports incomplete restoration; existing searched transcript is untouched',async()=>{
 const f=fixture({missingClose:true});const work=f.start('a');f.readyRows();f.release();assert.equal((await work).recovery.restored,false);
 const searched=fixture({search:'sponsor',initiallyOpen:true});const result=await searched.start('a');assert.equal(result.recovery.reason,'searched_transcript');assert.equal(searched.opens,0);assert.equal(searched.closes,0);
});
test('a failing native cleanup reports the problem and still settles operation ownership',async()=>{
 const f=fixture();const original=f.panel.querySelector;f.panel.querySelector=s=>s.includes('visibility-button')?{click:()=>{throw Error('native control changed');}}:original(s);
 const work=f.start('a');f.readyRows();f.release();const result=await work;
 assert.equal(result.recovery.restored,false);assert.equal(result.recovery.reason,'cleanup_failed');assert.equal(f.window.__ssTranscriptRecovery,undefined);
 await f.cancel('a');
});
