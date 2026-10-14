import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSettings,initializeSettings,statusText} from '../src/viewer/settings.js';
import {PlaybackController} from '../src/viewer/playback.js';
function fixture() {
 const f={id:'first',skips:[],offer:null};
 f.video={currentTime:15,duration:120,readyState:4,paused:false,seeking:false,playbackRate:1,addEventListener(){},removeEventListener(){}};
 f.controller=new PlaybackController({videoId:()=>f.id,onSkip:e=>f.skips.push(e),onOffer:o=>{f.offer=o;}});
 f.controller.attach(f.video,'first','visit');f.controller.configure({isEnabled:true,autoSkip:true});
 f.segment={start:10,end:20,category:'sponsor'};return f;
}
test('late Undo restores exact pre-jump position; Watch starts at estimate without repeating',()=>{
 const f=fixture();try{f.controller.setSegments([f.segment],'first','visit');assert.equal(f.video.currentTime,20);
 assert.equal(f.skips[0].undo(),true);assert.equal(f.video.currentTime,15);
 assert.equal(f.controller.watch(f.segment),true);assert.equal(f.video.currentTime,10);
 f.controller.event('seeked');assert.equal(f.video.currentTime,10);assert.equal(f.skips.length,1);
 }finally{f.controller.detach();}
});
test('temporary pause continues offering manual Skip and navigation clears only visit state',()=>{
 const f=fixture();try{f.controller.pause(true);f.controller.setSegments([f.segment],'first','visit');
 assert.equal(f.video.currentTime,15);assert.ok(f.offer);assert.equal(f.offer.skip(),true);assert.equal(f.video.currentTime,20);
 f.id='second';f.controller.attach(f.video,'second','new');assert.equal(f.controller.pausedForVideo,false);
 }finally{f.controller.detach();}
});
test('rejected estimates are excluded before first automatic jump',()=>{
 const f=fixture();try{f.controller.setRejections([f.segment]);f.controller.setSegments([f.segment],'first','visit');
 assert.equal(f.video.currentTime,15);assert.equal(f.controller.behavior(f.segment),'rejected');
 f.controller.setRejections([]);assert.equal(f.video.currentTime,20);
 }finally{f.controller.detach();}
});
test('mode migration retains explicit manual and disabled preferences and defaults automatic',async()=>{
 assert.equal(normalizeSettings({autoSkip:false}).mode,'manual');assert.equal(normalizeSettings({isEnabled:false,autoSkip:false}).mode,'off');
 assert.equal(normalizeSettings({}).mode,'automatic');
 let values={viewerSchema:1,autoSkip:false,isEnabled:true};const storage={get:async()=>values,set:async v=>{values={...values,...v};}};
 await initializeSettings(storage);assert.equal(values.mode,'manual');assert.equal(values.viewerSchema,2);
 assert.match(statusText({status:'ready',mode:'manual',segments:[{}]}),/manual/i);
 assert.match(statusText({status:'ready',mode:'automatic',paused:true,segments:[{}]}),/paused/i);
});
test('old retained Undo cannot control a newer skip or video, and stale Skip cannot override rejection',()=>{
 const f=fixture();try{f.controller.setSegments([f.segment],'first','visit');const old=f.skips[0].undo;
 f.id='second';f.controller.attach(f.video,'second','new');f.video.currentTime=15;f.controller.setSegments([f.segment],'second','new');
 assert.equal(old(),false);assert.equal(f.video.currentTime,20);
 const manual=fixture();try{manual.controller.configure({isEnabled:true,autoSkip:false});manual.controller.setSegments([manual.segment],'first','visit');const offer=manual.offer;
 manual.controller.setRejections([manual.segment]);assert.equal(offer.skip(),false);assert.equal(manual.video.currentTime,15);
 }finally{manual.controller.detach();}
 }finally{f.controller.detach();}
});
test('updated pause, corrections and intervals are applied atomically before scheduling',()=>{
 const f=fixture();try{f.video.currentTime=5;f.controller.setSegments([f.segment],'first','visit');f.video.currentTime=15;
 f.controller.update({paused:true,rejected:[],segments:[f.segment]},'first','visit');assert.equal(f.skips.length,0);assert.ok(f.offer);
 }finally{f.controller.detach();}
});
