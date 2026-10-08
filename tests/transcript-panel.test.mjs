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
