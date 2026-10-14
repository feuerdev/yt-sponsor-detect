// SPDX-License-Identifier: GPL-3.0-or-later
import {loadSettings,normalizeSettings} from './viewer/settings.js';
import {requestTranscript} from './viewer/bridge.js';
import {PlaybackController} from './viewer/playback.js';
import {PlayerUI} from './viewer/ui.js';
const videoId=()=>location.pathname==='/watch'?new URLSearchParams(location.search).get('v'):null;
let id=null,token=null,visitToken=null,settings=null,settingsEpoch=0,state=null,controller=null,transcript=null,lastPlayer=null,lastBar=null;
const ui=new PlayerUI(document,{retry:()=>start(true),pause:paused=>send({type:'PAUSE_VIDEO',token,paused}),
    mode:mode=>chrome.storage.sync.set({viewerSchema:2,mode,isEnabled:mode!=='off',autoSkip:mode==='automatic'}).catch(()=>{ui.error.textContent='Could not save mode.';}),
    watch:segment=>{const success=playback.watch(segment);if(state)showStatus(state);return success;},undo:()=>{const success=playback.undo();if(state)showStatus(state);return success;},
    reject:segment=>send({type:'REJECT_SEGMENT',token,index:state?.segments.findIndex(s=>s.start===segment.start&&s.end===segment.end&&s.category===segment.category)}).then(result=>{if(result.error)ui.error.textContent='Could not save correction.';else apply(result.state);}),
    behavior:segment=>playback.behavior(segment)});
const playback=new PlaybackController({videoId,isAd:()=>document.querySelector('#movie_player')?.classList.contains('ad-showing')===true,onSkip:event=>{ui.skipped(event);if(state)showStatus(state);},onOffer:offer=>ui.suggest(offer),onChange:()=>{if(state){showStatus(state);renderHighlights();}}});
const showStatus=next=>ui.state({...next,mode:settings?.mode,lastSkip:playback.skipSnapshot(),...(next.status!=='disabled'&&playback.isAd()?{status:'ad'}:{})});
const send=message=>chrome.runtime.sendMessage(message).catch(()=>({error:'unavailable'}));
function apply(next) {
    if(!next||next.videoId!==id||next.token!==token||settings?.mode==='off'&&next.status!=='disabled')return;
    state=next;playback.update(next,id,visitToken);
    showStatus(next);renderHighlights();
}
async function start(retry=false,fresh=false) {
    const current=videoId();if(!current)return;
    controller?.abort();controller=new AbortController();const signal=controller.signal;
    const same=id===current,paused=same&&state?.paused===true;id=current;token=crypto.randomUUID();const requestToken=token;
    // A detector retry gets a new request token, but keeps the playback visit and Undo history.
    if(!visitToken)visitToken=crypto.randomUUID();
    if(!same){transcript=null;ui.clearNotice();}
    state={videoId:id,token,status:'loading',segments:[],paused};
    bindPlayer();showStatus(state);
    const reply=await send({type:'START_SESSION',videoId:id,token:requestToken,retry,paused});
    if(signal.aborted||token!==requestToken)return;
    if(reply.error){apply({...state,status:'fetch_failed'});return;}
    apply(reply.state);
    if(reply.state?.status!=='loading')return;
    let captions=same&&transcript&&!fresh?transcript:await requestTranscript(window,id,{signal});
    if(captions.error&&!signal.aborted){signal.addEventListener('abort',()=>{void send({type:'CANCEL_PANEL',token:requestToken,videoId:current});},{once:true});const fallback=await send({type:'CAPTURE_PANEL',token:requestToken});if(signal.aborted||token!==requestToken)return;
        if(fallback.transcript)captions=fallback.transcript;else if(fallback.error)captions=fallback;}
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
        playback.attach(video,id,visitToken);if(settings)playback.configure(settings);
        if(state){playback.update(state,id,visitToken);showStatus(state);}
    }else playback.detach();
    if(player!==lastPlayer||bar!==lastBar){lastPlayer=player;lastBar=bar;if(state)ui.highlights(state.segments||[],state.duration);}
}
function renderHighlights(){if(state)ui.highlights(playback.isAd()?[]:(state.segments||[]).filter(s=>s.category==='sponsor'||settings?.selfPromotion),state.duration);}
function refresh() {
    const current=videoId();
    if(current!==id) {
        controller?.abort();playback.detach();ui.destroy();transcript=null;state=null;id=null;token=null;visitToken=null;
        if(current)void start();
    }else bindPlayer();
    if(state){showStatus(state);playback.schedule();renderHighlights();}
}
const epoch=settingsEpoch;
loadSettings(chrome.storage.sync).then(value=>{if(settingsEpoch===epoch){settings=value;playback.configure(settings);}}).catch(()=>{});
chrome.storage.onChanged.addListener((changes,area)=>{
    if(area!=='sync'||!['viewerSchema','isEnabled','autoSkip','selfPromotion','mode'].some(key=>changes[key]))return;
    settingsEpoch++;
    const next={...(settings||normalizeSettings()),viewerSchema:2};
    for(const key of ['isEnabled','autoSkip','selfPromotion','mode'])if(changes[key])next[key]=changes[key].newValue;
    if(!changes.mode&&(changes.isEnabled||changes.autoSkip))next.mode=next.isEnabled===false?'off':next.autoSkip===false?'manual':'automatic';
    settings=normalizeSettings(next);playback.configure(settings);
    if(!settings.isEnabled){controller?.abort();ui.clearNotice();if(state){state={...state,status:'disabled',segments:[]};showStatus(state);ui.highlights([],state.duration);}}
    else if(changes.isEnabled||(changes.mode&&state?.status==='disabled'))void start();
    else if(state)ui.highlights(state.segments.filter(s=>s.category==='sponsor'||settings.selfPromotion),state.duration);
});
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(sender.id&&sender.id!==chrome.runtime.id)return;
    if(message.type==='GET_PLAYER_SESSION'){respond?.(id&&token&&videoId()===id?{videoId:id,token,paused:state?.paused===true,lastSkip:playback.skipSnapshot(),behaviors:state?.segments.map(s=>playback.behavior(s))}:null);return false;}
    if(message.type==='VIEWER_STATE')apply(message.state);
    else if(message.type==='RETRY_VIDEO')void start(true,message.fresh===true);
    else if(message.type==='PLAYER_ACTION') {
        if(message.videoId!==id||message.token!==token||videoId()!==id){respond?.({error:'stale_session'});return false;}
        const success=message.action==='undo'?playback.undo():message.action==='watch'&&playback.watch(message.segment);
        if(success){ui.clearNotice();if(state)showStatus(state);ui.highlights(state?.segments||[],state?.duration);}
        respond?.(success?{lastSkip:playback.skipSnapshot()}:{error:'playback_unavailable'});return false;
    }
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
