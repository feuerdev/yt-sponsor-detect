// SPDX-License-Identifier: GPL-3.0-or-later
import {loadSettings,statusText} from './viewer/settings.js';
import {formatTime} from './viewer/ui.js';
const $=id=>document.getElementById(id);let current=null,enabled=true;
function render(state) {
    current=state;
    $('status').textContent=statusText(!enabled?{status:'disabled'}:state?.paused&&state.status!=='disabled'?{...state,status:'paused'}:state);
    $('pause').disabled=!state||!enabled;$('pause').textContent=state?.paused?'Resume skipping for this video':'Pause skipping for this video';
    $('retry').hidden=!state||!['fetch_failed','invalid_captions','model_unavailable','inference_failed','insufficient_text','no_captions'].includes(state.status);
    $('segments').replaceChildren();
    for(const segment of state?.segments||[]) {
        const item=document.createElement('li');item.textContent=formatTime(segment.start)+'–'+formatTime(segment.end)+' · '+(segment.category==='sponsor'?'Paid sponsor':'Self-promotion');$('segments').appendChild(item);
    }
    const details=state?.diagnostics;
    $('diagnostics').textContent=details?JSON.stringify(details,null,2):state?.status==='analyzing'?'Local analysis in progress.':'No completed local analysis.';
}
async function refresh() {
    try {const result=await chrome.runtime.sendMessage({type:'GET_VIDEO_STATUS'});render(result?.state);}
    catch {$('status').textContent='Extension unavailable. Reopen this popup.';}
}
loadSettings(chrome.storage.sync).then(settings=>{
    enabled=settings.isEnabled;render(current);
    for(const [id,key] of [['enabled','isEnabled'],['automatic','autoSkip'],['self-promotion','selfPromotion']]) {
        $(id).checked=settings[key];$(id).disabled=false;
        $(id).addEventListener('change',async()=>{
            $(id).disabled=true;$('error').textContent='';
            try {await chrome.storage.sync.set({viewerSchema:1,[key]:$(id).checked});if(key==='isEnabled')enabled=$(id).checked;await refresh();}
            catch {$('error').textContent='Could not save this setting.';$(id).checked=!$(id).checked;}
            finally {$(id).disabled=false;}
        });
    }
}).catch(()=>{$('error').textContent='Could not read saved settings.';});
$('pause').addEventListener('click',async()=>{try{const result=await chrome.runtime.sendMessage({type:'PAUSE_VIDEO',paused:!current?.paused});render(result?.state);}catch{$('error').textContent='Could not change this video.';}});
$('retry').addEventListener('click',async()=>{try{await chrome.runtime.sendMessage({type:'RETRY_VIDEO'});await refresh();}catch{$('error').textContent='Could not retry analysis.';}});
chrome.runtime.onMessage.addListener(message=>{if(message.type==='VIEWER_STATE'&&message.state?.videoId===current?.videoId)render(message.state);});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='sync'&&changes.isEnabled){enabled=changes.isEnabled.newValue!==false;render(current);}});
const timer=setInterval(refresh,1000);window.addEventListener('pagehide',()=>clearInterval(timer));void refresh();
