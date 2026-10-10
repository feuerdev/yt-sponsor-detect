import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {loadSettings,normalizeSettings} from '../src/viewer/settings.js';
import {requestTranscript,REQUEST,RESPONSE} from '../src/viewer/bridge.js';
import {PlaybackController} from '../src/viewer/playback.js';
import {PlayerUI} from '../src/viewer/ui.js';
const source=readFileSync(new URL('../src/viewer-content.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
const tick=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
class Element {
    constructor(tag){this.tag=tag;this.style={};this.dataset={};this.children=[];this.events=new Map();this.className='';this.textUpdates=0;this.textContent='';this.classList={contains:name=>this.className.split(' ').includes(name)};}
    get textContent(){return this.text||'';}
    set textContent(value){this.text=value;this.textUpdates++;}
    get isConnected(){return this.tag==='html'||!!this.parent?.isConnected;}
    appendChild(child){child.parent=this;this.children.push(child);return child;}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);this.parent=null;}
    setAttribute(name,value){this[name]=value;}
    addEventListener(name,fn){if(!this.events.has(name))this.events.set(name,new Set());this.events.get(name).add(fn);}
    removeEventListener(name,fn){this.events.get(name)?.delete(fn);}
    emit(name){for(const fn of this.events.get(name)||[])fn({type:name});}
    querySelector(selector){return descendants(this).find(node=>selector[0]==='.'?node.className.split(' ').includes(selector.slice(1)):node.id===selector.slice(1))||null;}
}
function descendants(root){return root.children.flatMap(child=>[child,...descendants(child)]);}
function fixture(settings={viewerSchema:1,isEnabled:true,autoSkip:true,selfPromotion:false}) {
    const root=new Element('html'),player=new Element('div'),bar=new Element('div'),video=new Element('video');player.id='movie_player';bar.className='ytp-progress-bar';root.appendChild(player);player.appendChild(video);player.appendChild(bar);
    Object.assign(video,{currentTime:1.5,duration:30,playbackRate:1,readyState:4,paused:false,seeking:false});
    const location={pathname:'/watch',search:'?v=first',origin:'https://www.youtube.com'};
    const win=new Element('window');win.location=location;
    const f={root,player,bar,video,location,requests:[],settings,win};
    const doc={documentElement:root,createElement:tag=>new Element(tag),querySelector:selector=>selector==='video'||selector==='#movie_player video'?f.video:selector==='#movie_player'?f.player:selector==='.ytp-progress-bar'?f.bar:null,
        querySelectorAll:selector=>descendants(root).filter(node=>node.className.split(' ').includes(selector.slice(1)))};
    win.postMessage=value=>{if(value.type===REQUEST)queueMicrotask(()=>{
        const payload={videoId:new URLSearchParams(location.search).get('v'),duration:30,track:'automatic',language:'en',timing:'word',words:[{text:'sponsor',start:1,end:2}]};
        for(const fn of win.events.get('message')||[])fn({source:win,origin:location.origin,data:{type:RESPONSE,nonce:value.nonce,payload}});
    });};
    let message,changed;const timers=new Map();let serial=0;
    class Controller extends PlaybackController{constructor(args){super({...args,timers:{setTimeout:(fn,delay)=>{timers.set(++serial,{fn,delay});return serial;},clearTimeout:id=>timers.delete(id)}});}}
    const context=vm.createContext({document:doc,window:win,location,URLSearchParams,AbortController,crypto:{randomUUID:()=>String(++serial)},queueMicrotask,
        loadSettings,normalizeSettings,requestTranscript,PlaybackController:Controller,PlayerUI,
        MutationObserver:class{constructor(fn){f.mutate=fn;}observe(){}disconnect(){f.disconnected=true;}},
        chrome:{runtime:{id:'extension',sendMessage:async request=>{
            f.requests.push(request);if(f.reply)return f.reply(request);
            if(request.type==='START_SESSION')return {state:{videoId:request.videoId,token:request.token,status:'loading',segments:[]}};
            if(request.type==='SUBMIT_TRANSCRIPT')return {state:{videoId:request.transcript.videoId,token:request.token,status:'ready',duration:30,segments:[{start:1,end:4,category:'sponsor'}]}};
            return {};
        },onMessage:{addListener:fn=>{message=fn;}}},storage:{sync:{get:async()=>settings},onChanged:{addListener:fn=>{changed=fn;}}}},
    });
    vm.runInContext(source,context);f.context=context;f.sessionRequest=sender=>{let result;message({type:'GET_PLAYER_SESSION'},sender,reply=>{result=reply;});return result;};f.state=state=>message({type:'VIEWER_STATE',state},{id:'extension'});
    f.change=values=>changed(Object.fromEntries(Object.entries(values).map(([key,newValue])=>[key,{newValue}])), 'sync');
    f.refresh=()=>vm.runInContext('refresh()',context);f.close=()=>win.emit('pagehide');
    return f;
}
test('actual content entry starts without popup, automatically skips and provides functioning Undo',async()=>{
    const f=fixture();try{await tick();assert.ok(f.requests.some(r=>r.type==='SUBMIT_TRANSCRIPT'));assert.equal(f.video.currentTime,4);
        const notice=f.player.querySelector('.ss-skip-notice');assert.ok(notice);notice.children.find(n=>n.tag==='button').emit('click');assert.equal(f.video.currentTime,1);
        f.video.emit('seeked');f.refresh();assert.equal(f.video.currentTime,1);
    }finally{f.close();}
});
test('actual content rejects late old-video state on same-player navigation',async()=>{
    const f=fixture();try{await tick();const old=f.requests.find(r=>r.type==='START_SESSION');f.location.search='?v=second';f.video.currentTime=10;f.refresh();await tick();
        f.state({videoId:'first',token:old.token,status:'ready',segments:[{start:10,end:20,category:'sponsor'}],duration:30});assert.equal(f.video.currentTime,10);
    }finally{f.close();}
});
test('disable invalidates controls and late state; re-enable reuses captions without reload',async()=>{
    const f=fixture();try{await tick();const old=f.requests.find(r=>r.type==='START_SESSION');f.change({isEnabled:false});f.video.currentTime=1.5;
        f.state({videoId:'first',token:old.token,status:'ready',segments:[{start:1,end:20,category:'sponsor'}],duration:30});f.refresh();assert.equal(f.video.currentTime,1.5);
        assert.ok(f.player.querySelector('.ss-status').children[0].textContent.includes('off'));
        f.change({isEnabled:true});await tick();assert.equal(f.video.currentTime,4);
    }finally{f.close();}
});
test('manual mode renders one stable Skip control and still supplies Undo',async()=>{
    const f=fixture({viewerSchema:1,isEnabled:true,autoSkip:false});try{await tick();assert.equal(f.video.currentTime,1.5);
        const offer=f.player.querySelector('.ss-manual-offer');assert.ok(offer);f.refresh();f.refresh();assert.equal(f.player.querySelector('.ss-manual-offer'),offer);
        offer.emit('click');assert.equal(f.video.currentTime,4);assert.ok(f.player.querySelector('.ss-skip-notice'));
    }finally{f.close();}
});
test('same-video player replacement preserves Undo suppression and detaches old listeners',async()=>{
    const f=fixture();try{await tick();f.player.querySelector('.ss-skip-notice').children.find(n=>n.tag==='button').emit('click');const old=f.video;
        const replacement=new Element('video');Object.assign(replacement,{currentTime:1.5,duration:30,readyState:4,paused:false,seeking:false,playbackRate:1});old.remove();f.player.appendChild(replacement);f.video=replacement;f.refresh();
        assert.equal(old.events.get('timeupdate').size,0);assert.equal(replacement.currentTime,1.5);
        f.video=null;f.refresh();assert.equal(replacement.events.get('timeupdate').size,0);
    }finally{f.close();}
});

test('disabled status takes priority over per-video pause',async()=>{
    const f=fixture();try{await tick();const request=f.requests.find(r=>r.type==='START_SESSION');
        f.state({videoId:'first',token:request.token,status:'ready',paused:true,segments:[],duration:30});
        f.change({isEnabled:false});f.refresh();assert.ok(f.player.querySelector('.ss-status').children[0].textContent.includes('off'));
    }finally{f.close();}
});

// A real MutationObserver re-enters refresh when status text changes. During a
// YouTube ad, writing the underlying caption status before the ad status creates
// a perpetual microtask loop and stalls the player and DevTools evaluations.
test('ad status settles without rewriting caption and ad text on every refresh',async()=>{
    const f=fixture();try{await tick();f.player.className='ad-showing';f.refresh();
        const text=f.player.querySelector('.ss-status').children[0];
        assert.equal(text.textContent,'Waiting for YouTube ad to finish');
        const updates=text.textUpdates;f.refresh();f.refresh();
        assert.equal(text.textUpdates,updates,'Observer refresh must not produce new status mutations');
        f.player.className='';f.refresh();assert.equal(text.textContent,'Sponsor skipping ready');
    }finally{f.close();}
});

test('content returns its existing visit identity for service-worker recovery',async()=>{
    const f=fixture();try{await tick();const original=f.requests.find(r=>r.type==='START_SESSION');
        const result=await f.sessionRequest({id:'extension'});
        assert.equal(result.videoId,'first');assert.equal(result.token,original.token);
        assert.equal(f.requests.filter(r=>r.type==='START_SESSION').length,1);
    }finally{f.close();}
});

test('Undo suppression survives a same-video retry and its refreshed detector results',async()=>{
    const f=fixture();try{await tick();f.player.querySelector('.ss-skip-notice').children.find(n=>n.tag==='button').emit('click');f.video.emit('seeked');
        await vm.runInContext('start(true)',f.context);await tick();
        assert.equal(f.video.currentTime,1,'A detector retry must not skip the restored sponsor again');
    }finally{f.close();}
});
