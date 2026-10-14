// SPDX-License-Identifier: GPL-3.0-or-later
import {loadSettings,statusText} from './viewer/settings.js';
import {formatTime,rangeText,coverageText,behaviorText} from './viewer/ui.js';
import {matchesCorrection} from './viewer/corrections.js';
const $=id=>document.getElementById(id);let current=null,settings=null,intervalSignature=null,refreshEpoch=0,busy=false;
function render(state) {
    current=state;
    const mode=settings?.mode||'automatic';
    const status=mode==='off'?'disabled':state?.status==='loading'&&state.stage==='recovering'?'recovering':state?.status==='analyzing'&&state.stage==='initializing'?'initializing':state?.status;
    const label=statusText(mode==='off'?{status:'disabled'}:state?{...state,status,mode}:null);if($('status').textContent!==label)$('status').textContent=label;
    $('video').textContent=state?'Current video · '+state.videoId:'Current video';$('mode-summary').textContent='Mode: '+mode+(state?.paused?' · Automatic skips paused for this visit':'');
    $('pause').disabled=!state||mode!=='automatic'||busy;$('pause').textContent=state?.paused?'Resume automatic skips':'Pause automatic skips for this visit';
    $('retry').hidden=!state;$('fresh').hidden=!state;$('retry').disabled=!state||mode==='off'||busy;$('fresh').disabled=$('retry').disabled;
    $('coverage').textContent=coverageText(state);
    const p=state?.progress;$('progress').textContent=state?.status==='analyzing'&&Number.isFinite(p?.processed)&&p.total>0?'Checked '+p.processed+' of '+p.total+' caption batches.':'';
    $('recovery').textContent=state?.recovery?.restored===false?'Caption recovery finished, but the previous panel could not be fully restored. You can close or reopen it in YouTube.':state?.recovery?.reason==='searched_transcript'?'Your transcript search was preserved. Clear it in YouTube and retrieve captions again.':'';
    $('undo').hidden=!state?.lastSkip;$('undo').disabled=busy||mode==='off'||!state?.lastSkip?.available||state?.lastSkip?.undone;
    $('last-skip').textContent=state?.lastSkip?'Last jump: '+formatTime(state.lastSkip.previousTime)+' → '+formatTime(state.lastSkip.segment.end)+(state.lastSkip.undone?' · Undone':''):'';
    $('reset').hidden=!state?.rejected?.length;$('reset').disabled=busy;
    const segments=state?.segments||[];
    const signature=JSON.stringify([state?.token,mode,state?.paused,state?.rejected,state?.behaviors,segments]);
    if(signature!==intervalSignature){
        const focused=$('segments').contains(document.activeElement);intervalSignature=signature;$('segments').replaceChildren();
        for(const [index,segment] of segments.entries()) {
            const rejected=state.rejected?.some(s=>matchesCorrection(s,segment));
            const behavior=rejected?'rejected':state.behaviors?.[index]==='replay'?'replay':mode==='automatic'&&!state.paused?'automatic':'manual';
            const item=document.createElement('li'),label=document.createElement('p');label.textContent='Estimated sponsor '+rangeText(segment)+' · '+behaviorText(behavior);item.appendChild(label);
            for(const [text,type] of [['Watch segment','WATCH_SEGMENT'],['Not a sponsor','REJECT_SEGMENT']]) {
                const button=document.createElement('button');button.type='button';button.textContent=text;button.disabled=mode==='off'||type==='REJECT_SEGMENT'&&rejected;
                button.addEventListener('click',()=>action(type,{index}));item.appendChild(button);
            }$('segments').appendChild(item);
        }
        if(focused)$('mode').focus();
    }
    $('diagnostics').textContent=state?.diagnostics?JSON.stringify(state.diagnostics,null,2):'No completed local analysis.';
}
function failure(error){$('error').textContent=error==='playback_unavailable'?'Playback is unavailable. Try after the ad or video loads.':error==='stale_session'?'The video changed. Refreshing its controls.':'Could not complete the request. Try again.';}
async function refresh() {
    const epoch=++refreshEpoch;
    try {const result=await chrome.runtime.sendMessage({type:'GET_VIDEO_STATUS'});if(epoch!==refreshEpoch)return;
        if(!result||result.error){failure(result?.error);return;}render(result.state);}
    catch{if(epoch===refreshEpoch)failure('unavailable');}
}
async function action(type,extra={}) {
    if(busy)return;busy=true;$('error').textContent='';render(current);
    try{const result=await chrome.runtime.sendMessage({type,videoId:current?.videoId,token:current?.token,...extra});
        if(!result||result.error){failure(result?.error);return;}
        if(result.state&&!result.state.retry)render(result.state);await refresh();
    }catch{failure('unavailable');}finally{busy=false;render(current);}
}
loadSettings(chrome.storage.sync).then(value=>{settings=value;$('mode').value=value.mode;$('mode').disabled=false;render(current);}).catch(()=>{failure('unavailable');});
$('mode').addEventListener('change',async()=>{
    const mode=$('mode').value;$('mode').disabled=true;$('error').textContent='';
    try{await chrome.storage.sync.set({viewerSchema:2,mode,isEnabled:mode!=='off',autoSkip:mode==='automatic'});settings={...settings,mode};await refresh();}
    catch{failure('unavailable');$('mode').value=settings?.mode||'automatic';}finally{$('mode').disabled=false;render(current);}
});
$('pause').addEventListener('click',()=>action('PAUSE_VIDEO',{paused:!current?.paused}));
$('retry').addEventListener('click',()=>action('RETRY_VIDEO'));
$('fresh').addEventListener('click',()=>action('RETRY_VIDEO',{fresh:true}));
$('undo').addEventListener('click',()=>action('UNDO_SKIP'));
$('reset').addEventListener('click',()=>action('RESET_CORRECTIONS'));
chrome.runtime.onMessage.addListener(message=>{if(message.type==='VIEWER_STATE'&&message.state?.videoId===current?.videoId&&message.state?.token===current?.token)render({...message.state,lastSkip:current?.lastSkip});});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='sync')loadSettings(chrome.storage.sync).then(value=>{settings=value;$('mode').value=value.mode;render(current);}).catch(()=>{});});
const timer=setInterval(()=>{if(!busy)void refresh();},1000);window.addEventListener('pagehide',()=>clearInterval(timer));void refresh();
