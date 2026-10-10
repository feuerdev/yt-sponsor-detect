import assert from 'node:assert/strict';
import test from 'node:test';
import {PlaybackController} from '../src/viewer/playback.js';
function fixture() {
    const events=new Map(),timers=new Map(),skips=[];let next=0;
    const f={id:'first',ad:false,skips,timers,offer:null};
    f.video={currentTime:0,duration:120,playbackRate:1,readyState:4,paused:false,seeking:false,
        addEventListener:(name,handler)=>events.set(name,handler),removeEventListener:(name,handler)=>{if(events.get(name)===handler)events.delete(name);},
        emit:name=>events.get(name)?.({type:name})};
    f.events=events;f.controller=new PlaybackController({videoId:()=>f.id,isAd:()=>f.ad,onSkip:event=>skips.push(event),onOffer:offer=>{f.offer=offer;},
        timers:{setTimeout:(fn,delay)=>{timers.set(++next,{fn,delay});return next;},clearTimeout:id=>timers.delete(id)}});
    f.controller.attach(f.video,'first','token');
    f.enable=(settings={})=>f.controller.configure({isEnabled:true,autoSkip:true,...settings});
    f.result=(segments=[{start:10,end:20,category:'sponsor'}])=>f.controller.setSegments(segments,f.id,f.controller.token);
    return f;
}
test('automatic skipping is default after settings, and future boundary follows playback speed',()=>{
    const f=fixture();f.result();assert.equal(f.timers.size,0);f.enable();assert.equal([...f.timers.values()][0].delay,10000);
    f.video.playbackRate=2;f.video.emit('ratechange');assert.equal(f.timers.size,1);assert.equal([...f.timers.values()][0].delay,5000);
    f.video.currentTime=10;[...f.timers.values()][0].fn();assert.equal(f.video.currentTime,20);assert.equal(f.skips.length,1);
});
test('late result skips remaining sponsor and never rewinds an already passed one',()=>{
    const f=fixture();f.enable();f.video.currentTime=15;f.result();assert.equal(f.video.currentTime,20);assert.equal(f.skips[0].seconds,5);
    const passed=fixture();passed.enable();passed.video.currentTime=30;passed.result();assert.equal(passed.video.currentTime,30);assert.equal(passed.skips.length,0);
});
test('Undo restores segment start and suppresses overlapping refreshed results for the session',()=>{
    const f=fixture();f.enable();f.video.currentTime=15;f.result();assert.equal(f.skips[0].undo(),true);assert.equal(f.video.currentTime,10);
    f.video.emit('seeked');f.result([{start:9,end:21,category:'sponsor'}]);f.video.currentTime=15;f.video.emit('timeupdate');assert.equal(f.video.currentTime,15);
});
test('intentional seeking into a sponsor is respected',()=>{
    const f=fixture();f.enable();f.result();f.video.seeking=true;f.video.currentTime=12;f.video.emit('seeking');
    assert.equal(f.timers.size,0);f.video.seeking=false;f.video.emit('seeked');assert.equal(f.video.currentTime,12);assert.equal(f.skips.length,0);
});
test('manual seeking into a sponsor keeps Skip available until explicit Undo',()=>{
    const f=fixture();f.enable({autoSkip:false});f.result();
    f.video.seeking=true;f.video.currentTime=12;f.video.emit('seeking');
    f.video.seeking=false;f.video.emit('seeked');
    assert.equal(f.video.currentTime,12);assert.ok(f.offer,'Timeline seeking must preserve the manual Skip offer');
    assert.equal(f.offer.skip(),true);assert.equal(f.video.currentTime,20);
    f.video.emit('seeked');assert.equal(f.skips[0].undo(),true);assert.equal(f.video.currentTime,10);
    f.video.emit('seeked');f.video.currentTime=12;f.video.emit('timeupdate');
    assert.equal(f.offer,null,'Explicit Undo must still suppress the manual offer for this visit');
    assert.equal(f.video.currentTime,12);
});
test('paused and buffering playback do not seek; resume re-arms the boundary',()=>{
    const f=fixture();f.enable();f.result();f.video.paused=true;f.video.emit('pause');assert.equal(f.timers.size,0);
    f.video.currentTime=15;f.video.emit('timeupdate');assert.equal(f.skips.length,0);
    f.video.paused=false;f.video.emit('playing');assert.equal(f.video.currentTime,20);
    const buffered=fixture();buffered.enable();buffered.result();buffered.video.emit('waiting');assert.equal(buffered.timers.size,0);
    buffered.video.currentTime=15;buffered.video.emit('timeupdate');assert.equal(buffered.skips.length,0);
    buffered.video.emit('playing');assert.equal(buffered.video.currentTime,20);
});
test('YouTube ad timeline never receives sponsor seeks, including Undo',()=>{
    const f=fixture();f.enable();f.ad=true;f.video.currentTime=15;f.result();assert.equal(f.skips.length,0);
    f.ad=false;f.controller.schedule();assert.equal(f.video.currentTime,20);
    f.ad=true;assert.equal(f.skips[0].undo(),false);assert.equal(f.video.currentTime,20);
});
test('disable, video pause and manual mode prevent automatic seeks',()=>{
    for(const settings of [{isEnabled:false},{autoSkip:false}]){const f=fixture();f.enable(settings);f.video.currentTime=15;f.result();assert.equal(f.video.currentTime,15);}
    const f=fixture();f.enable();f.controller.pause(true);f.video.currentTime=15;f.result();assert.equal(f.video.currentTime,15);
    f.controller.pause(false);assert.equal(f.video.currentTime,20);f.controller.configure({isEnabled:false});assert.equal(f.skips[0].undo(),false);
});
test('selfpromotion stays opt-in without recomputing detection',()=>{
    const f=fixture();f.enable();f.video.currentTime=15;f.result([{start:10,end:20,category:'selfpromo'}]);assert.equal(f.video.currentTime,15);
    f.enable({selfPromotion:true});assert.equal(f.video.currentTime,20);
});
test('old timers and retained Undo cannot seek a reused player after navigation',()=>{
    const f=fixture();f.enable();f.result();const oldTimer=[...f.timers.values()][0].fn;
    f.id='second';f.controller.attach(f.video,'second','new-token');f.video.currentTime=12;oldTimer();assert.equal(f.video.currentTime,12);
    f.result();const undo=f.skips[0].undo;f.id='third';f.controller.attach(f.video,'third','third-token');f.video.currentTime=7;
    assert.equal(undo(),false);assert.equal(f.video.currentTime,7);
});
test('replacement and removal release every listener and timer',()=>{
    const f=fixture();f.enable();f.result();f.controller.detach();assert.equal(f.events.size,0);assert.equal(f.timers.size,0);
});
test('non-finite/reversed results and obsolete session tokens cannot affect playback',()=>{
    const f=fixture();f.enable();f.video.currentTime=15;
    f.controller.setSegments([{start:10,end:Infinity,category:'sponsor'}],'first','token');assert.equal(f.skips.length,0);
    f.controller.setSegments([{start:10,end:20,category:'sponsor'}],'first','old-token');assert.equal(f.skips.length,0);
});
test('source replacement invalidates a pending timer before the DOM rebinds',()=>{
    const f=fixture();f.video.src='first-source';f.controller.attach(f.video,'first','token');f.enable();f.result();
    const stale=[...f.timers.values()][0].fn;f.video.src='other-source';f.video.currentTime=12;stale();assert.equal(f.skips.length,0);
});
