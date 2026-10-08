import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const module=await import('../src/transcript-panel.js').catch(()=>({captureOpenTranscript:()=>null,panelCaptions:()=>({})}));
const {captureOpenTranscript,panelCaptions}=module;
const english={isReliable:true,languages:[{language:'en',percentage:100}]};
const snapshot=()=>({videoId:'abcdefghijk',durationSeconds:20,rows:[{start:0,text:'Our first English caption.'},{start:10,text:'This is our final English caption.'}]});
function capture({videoId='abcdefghijk',playerId=videoId,panels,visible=true,duration=20,live=false,search=''}={}){
 const data=panels??[{content:{transcriptRenderer:{content:{body:{transcriptSegmentListRenderer:{initialSegments:[{transcriptSegmentViewModel:{timestamp:'0:00',simpleText:'Our first caption.'}},{transcriptSegmentViewModel:{timestamp:'0:10',simpleText:'Our final caption.'}}]}}}}}}];
 const player={getVideoData:()=>({video_id:playerId,isLive:live}),getDuration:()=>duration};
 const context=vm.createContext({URL,location:{href:'https://www.youtube.com/watch?v='+videoId},window:{},document:{querySelector:selector=>selector==='#movie_player'?player:null,querySelectorAll:()=>data.map(d=>({data:d,getBoundingClientRect:()=>({width:visible?400:0,height:visible?700:0}),querySelector:selector=>selector.includes('input')?{value:search}:null}))}});
 return vm.runInContext('('+captureOpenTranscript.toString()+')('+JSON.stringify(videoId)+')',context);
}
test('public transcript capture runs as an isolated MAIN-world function and returns modern cues',()=>{
 const result=capture();assert.equal(result.videoId,'abcdefghijk');assert.equal(result.durationSeconds,20);assert.deepEqual(JSON.parse(JSON.stringify(result.rows)),snapshot().rows.map((r,i)=>({...r,text:i?'Our final caption.':'Our first caption.'})));
});
test('public panel ignores hidden panels and rejects wrong player identity or live videos',()=>{
 assert.equal(capture({visible:false}),null);assert.equal(capture({playerId:'different'}),null);assert.equal(capture({live:true}),null);assert.equal(capture({search:'sponsor'}),null);
});
test('incomplete and ambiguous public panels cannot supply classification evidence',()=>{
 const valid={transcriptSegmentViewModel:{timestamp:'0:00',simpleText:'First caption.'}};
 assert.equal(capture({panels:[{contents:[valid,{continuationItemRenderer:{}}]}]}),null);
 assert.equal(capture({panels:[{contents:[valid]},{contents:[valid]}]}),null);
});
test('transcript fallback preserves exact legacy timings',()=>{
 const result=capture({panels:[{contents:[{transcriptSegmentRenderer:{startMs:'1000',endMs:'5000',snippet:{runs:[{text:'An English caption.'}]}}},{transcriptSegmentRenderer:{startMs:'10000',endMs:'20000',snippet:{runs:[{text:'Another English caption.'}]}}}]}]});
 assert.equal(result.rows[0].end,5);const parsed=panelCaptions(JSON.parse(JSON.stringify(result)),'abcdefghijk',english);
 assert.equal(parsed.captions[0].duration,4);assert.equal(parsed.provenance.timingResolutionSeconds,.001);
});
test('fallback coalesces same-second modern cues and declares inferred timing',()=>{
 const input=snapshot();input.rows.splice(1,0,{start:0,text:'Second part of first cue.'});const parsed=panelCaptions(input,'abcdefghijk',english);
 assert.deepEqual(parsed.captions,[{start:0,duration:10,text:'Our first English caption. Second part of first cue.'},{start:10,duration:10,text:'This is our final English caption.'}]);
 assert.equal(parsed.provenance.captionSource,'public-transcript-panel');assert.equal(parsed.provenance.captionTrackId,null);assert.equal(parsed.provenance.timingResolutionSeconds,1);
});
test('unreliable or non-English language evidence is rejected',()=>{
 for(const language of [{...english,isReliable:false},{isReliable:true,languages:[{language:'de',percentage:100}]},{isReliable:true,languages:[{language:'en',percentage:80},{language:'fr',percentage:20}]}])assert.throws(()=>panelCaptions(snapshot(),'abcdefghijk',language),/unsupported_language/);
});
test('partial, unordered, oversized, invalid or mismatched transcript evidence is rejected',()=>{
 const bad=[{...snapshot(),videoId:'different'},{...snapshot(),durationSeconds:0},{...snapshot(),durationSeconds:1000}, {...snapshot(),rows:[{start:10,text:'Late.'},{start:0,text:'Earlier.'}]}, {...snapshot(),rows:[{start:0,text:'x'.repeat(2000001)}]}, {...snapshot(),rows:[{start:0,end:25,text:'Overrun.'}]}];
 for(const input of bad)assert.throws(()=>panelCaptions(input,'abcdefghijk',english),/captions_unavailable/);
});

test('partial modern transcripts do not assign the unknown tail to the final known words',()=>{
 const input={...snapshot(),durationSeconds:1000,incomplete:true};
 const parsed=panelCaptions(input,'abcdefghijk',english,{allowPartial:true});
 assert.equal(parsed.provenance.coverage,'partial');
 assert.equal(parsed.provenance.coverageStart,0);assert.equal(parsed.provenance.coverageEnd,10);
 assert.deepEqual(parsed.captions,[{start:0,duration:10,text:'Our first English caption.'}]);
});
test('partial native timings preserve only the supplied portion',()=>{
 const input={videoId:'abcdefghijk',durationSeconds:1000,rows:[{start:400,end:410,text:'A reliable English caption.'}]};
 const parsed=panelCaptions(input,'abcdefghijk',english,{allowPartial:true});
 assert.equal(parsed.provenance.coverage,'partial');assert.equal(parsed.provenance.coverageStart,400);assert.equal(parsed.provenance.coverageEnd,410);
});

function automaticCapture({alreadyOpen=false,search='',navigate=false,loading=false,otherPanel=false}={}) {
 const state={open:alreadyOpen,opens:0,closes:0};
 const player={getVideoData:()=>({video_id:'abcdefghijk'}),getDuration:()=>20};
 const panel={data:{contents:[{transcriptSegmentViewModel:{timestamp:'0:00',simpleText:'Our first caption.'}},{transcriptSegmentViewModel:{timestamp:'0:10',simpleText:'Our final caption.'}}]},
 getBoundingClientRect:()=>({width:state.open?400:0,height:state.open?700:0}),getAttribute:()=>state.open?'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED':'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN',
 querySelector:s=>s.includes('input')?{value:search}:s.includes('ytd-transcript-renderer')?{}:s.includes('visibility-button')?{click:()=>{state.open=false;state.closes++;}}:null};
 const readyData=panel.data;if(loading)panel.data={};
 const location={href:'https://www.youtube.com/watch?v=abcdefghijk'};
 const button={click:()=>{state.open=true;state.opens++;if(navigate)location.href='https://www.youtube.com/watch?v=other-video';}};
 const handlers={};const unrelated={getBoundingClientRect:()=>({width:400,height:700}),getAttribute:()=>null,data:{},querySelector:s=>s.includes('visibility-button')?{click:()=>{state.otherClosed=true;}}:null};
 const context=vm.createContext({URL,Date,setTimeout:fn=>{handlers.keydown?.({isTrusted:true});panel.data=readyData;fn();},location,window:{},getComputedStyle:()=>({visibility:'visible',display:'block'}),
 document:{querySelector:s=>s==='#movie_player'?player:s.includes('transcript-section')?button:null,querySelectorAll:()=>otherPanel?[unrelated,panel]:[panel],addEventListener:(type,fn)=>{handlers[type]=fn;},removeEventListener(){}}});
 return {state,result:vm.runInContext('('+captureOpenTranscript.toString()+')("abcdefghijk",true)',context)};
}
test('automatic capture opens and restores a previously closed native transcript panel',async()=>{
 const f=automaticCapture();const result=await f.result;assert.equal(result?.rows.length,2);assert.equal(f.state.opens,1);assert.equal(f.state.closes,1);assert.equal(f.state.open,false);
});
test('automatic capture leaves an already-open user transcript panel open',async()=>{
 const f=automaticCapture({alreadyOpen:true});assert.equal((await f.result)?.rows.length,2);assert.equal(f.state.opens,0);assert.equal(f.state.closes,0);assert.equal(f.state.open,true);
});
test('automatic recovery preserves the user transcript search rather than changing it',async()=>{
 const f=automaticCapture({alreadyOpen:true,search:'sponsor'});assert.equal(await f.result,null);assert.equal(f.state.closes,0);assert.equal(f.state.opens,0);
});
test('navigation while opening a transcript prevents old-video extraction and restoration',async()=>{
 const f=automaticCapture({navigate:true});assert.equal(await f.result,null);assert.equal(f.state.closes,0);
});

test('recovery never closes an unrelated visible engagement panel',async()=>{
 const f=automaticCapture({otherPanel:true});assert.equal((await f.result)?.rows.length,2);assert.equal(f.state.otherClosed,undefined);
});
test('an already-open loading transcript remains owned by the user',async()=>{
 const f=automaticCapture({alreadyOpen:true,loading:true});assert.equal((await f.result)?.rows.length,2);assert.equal(f.state.opens,0);assert.equal(f.state.closes,0);
});
