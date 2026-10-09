// SPDX-License-Identifier: GPL-3.0-or-later
import {loadSettings,normalizeSettings} from './viewer/settings.js';
import {requestTranscript} from './viewer/bridge.js';
import {PlaybackController} from './viewer/playback.js';
import {PlayerUI} from './viewer/ui.js';
const videoId=()=>location.pathname==='/watch'?new URLSearchParams(location.search).get('v'):null;
let id=null,token=null,settings=null,settingsEpoch=0,state=null,controller=null,transcript=null,lastPlayer=null,lastBar=null;
const ui=new PlayerUI(document,{retry:()=>start(true)});
const playback=new PlaybackController({videoId,isAd:()=>document.querySelector('#movie_player')?.classList.contains('ad-showing')===true,onSkip:event=>ui.skipped(event),onOffer:offer=>ui.suggest(offer)});
const send=message=>chrome.runtime.sendMessage(message).catch(()=>({error:'unavailable'}));
function apply(next) {
    if(!next||next.videoId!==id||next.token!==token)return;
    state=next;playback.pause(next.paused);playback.setSegments(next.segments||[],id,token);
    ui.state(next);ui.highlights((next.segments||[]).filter(s=>s.category==='sponsor'||settings?.selfPromotion),next.duration);
}
async function start(retry=false) {
    const current=videoId();if(!current)return;
    controller?.abort();controller=new AbortController();const signal=controller.signal;
    const same=id===current;id=current;token=crypto.randomUUID();const requestToken=token;
    if(!same){transcript=null;ui.clearNotice();}
    state={videoId:id,token,status:'loading',segments:[]};
    bindPlayer();ui.state(state);
    const reply=await send({type:'START_SESSION',videoId:id,token:requestToken,retry});
    if(signal.aborted||token!==requestToken)return;
    if(reply.error){apply({...state,status:'fetch_failed'});return;}
    apply(reply.state);
    if(reply.state?.status!=='loading')return;
    const captions=same&&transcript?transcript:await requestTranscript(window,id,{signal});
    if(signal.aborted||token!==requestToken)return;
    if(captions.error){const result=await send({type:'TRANSCRIPT_UNAVAILABLE',token:requestToken,reason:captions.error});apply(result.state);return;}
    transcript=captions;
    const result=await send({type:'SUBMIT_TRANSCRIPT',token:requestToken,transcript:captions});
    if(token!==requestToken||signal.aborted)return;
    if(result.error)apply({...state,status:'model_unavailable',segments:[]});else apply(result.state);
}
function bindPlayer() {
    const video=document.querySelector('#movie_player video')||document.querySelector('video');
    const player=document.querySelector('#movie_player');const bar=document.querySelector('.ytp-progress-bar');
    ui.bind(player);
    if(video&&id&&token) {
        playback.attach(video,id,token);if(settings)playback.configure(settings);
        if(state){playback.pause(state.paused);playback.setSegments(state.segments||[],id,token);ui.state(state);}
    }else playback.detach();
    if(player!==lastPlayer||bar!==lastBar){lastPlayer=player;lastBar=bar;if(state)ui.highlights(state.segments||[],state.duration);}
}
function refresh() {
    const current=videoId();
    if(current!==id) {
        controller?.abort();playback.detach();ui.destroy();transcript=null;state=null;id=null;token=null;
        if(current)void start();
    }else bindPlayer();
    if(state){const ad=playback.isAd();ui.state(ad?{...state,status:'ad'}:state);playback.schedule();}
}
const epoch=settingsEpoch;
loadSettings(chrome.storage.sync).then(value=>{if(settingsEpoch===epoch){settings=value;playback.configure(settings);}}).catch(()=>{});
chrome.storage.onChanged.addListener((changes,area)=>{
    if(area!=='sync'||!['viewerSchema','isEnabled','autoSkip','selfPromotion'].some(key=>changes[key]))return;
    settingsEpoch++;
    const next={...(settings||normalizeSettings()),viewerSchema:1};
    for(const key of ['isEnabled','autoSkip','selfPromotion'])if(changes[key])next[key]=changes[key].newValue;
    settings=normalizeSettings(next);playback.configure(settings);
    if(!settings.isEnabled){controller?.abort();token=null;ui.clearNotice();if(state){state={...state,status:'disabled',segments:[]};ui.state(state);ui.highlights([],state.duration);}}
    else if(changes.isEnabled)void start();
    else if(state)ui.highlights(state.segments.filter(s=>s.category==='sponsor'||settings.selfPromotion),state.duration);
});
chrome.runtime.onMessage.addListener((message,sender)=>{
    if(sender.id&&sender.id!==chrome.runtime.id)return;
    if(message.type==='VIEWER_STATE')apply(message.state);
    else if(message.type==='RETRY_VIDEO')void start(true);
});
let queued=false;
const observer=new MutationObserver(()=>{
    if(queued)return;queued=true;queueMicrotask(()=>{queued=false;refresh();});
});
observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','src']});
window.addEventListener('yt-navigate-finish',refresh);
window.addEventListener('popstate',refresh);
window.addEventListener('pagehide',()=>{controller?.abort();playback.detach();ui.destroy();observer.disconnect();});
refresh();
