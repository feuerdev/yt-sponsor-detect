// SPDX-License-Identifier: GPL-3.0-or-later
let creating,starting=false,generation=0;
const ask=message=>chrome.runtime.sendMessage({scope:'audio-offscreen',...message});
async function ensureOffscreen(){
    if((await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']})).length)return;
    creating ||= chrome.offscreen.createDocument({url:'offscreen.html',reasons:['USER_MEDIA','AUDIO_PLAYBACK','WORKERS'],justification:'Explicitly requested, bounded local audio transcription experiment; preserve tab audio.'}).finally(()=>{creating=null;});await creating;
}
async function snapshot(){if(!(await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']})).length)return {status:'idle'};return ask({type:'STATUS'});}
async function start(){
    if(starting)throw new Error('busy');starting=true;const request=++generation;const current=()=>{if(request!==generation)throw new Error('cancelled');};
    try{
        const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
        const url=new URL(tab?.url||'about:blank');const videoId=url.searchParams.get('v');
        if(url.origin!=='https://www.youtube.com'||url.pathname!=='/watch'||!videoId)throw new Error('open_video');
        if(['starting','recording','transcribing'].includes((await snapshot()).status))throw new Error('busy');
        current();await ensureOffscreen();current();
        const streamId=await chrome.tabCapture.getMediaStreamId({targetTabId:tab.id});
        current();const refreshed=await chrome.tabs.get(tab.id);current();const after=new URL(refreshed.url);
        if(after.origin!==url.origin||after.pathname!=='/watch'||after.searchParams.get('v')!==videoId)throw new Error('video_changed');
        return await ask({type:'START',streamId,tabId:tab.id,videoId});
    }finally{starting=false;}
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL('popup.html')||message?.scope==='audio-offscreen')return false;
    let task;
    if(message.type==='AUDIO_START')task=start();
    else if(message.type==='AUDIO_STATUS')task=snapshot();
    else if(message.type==='AUDIO_CANCEL')task=(async()=>{generation++;if((await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']})).length){await ask({type:'CANCEL'});await chrome.offscreen.closeDocument();}return {status:'idle'};})();
    else if(message.type==='AUDIO_FINISH')task=ask({type:'FINISH'});
    else return false;
    task.then(respond,error=>respond({status:'error',error:['busy','open_video','video_changed','cancelled'].includes(error.message)?error.message:'capture_failed'}));return true;
});
async function cancelledTab(tabId,url){
    try{const state=await snapshot();if(state.tabId!==tabId)return;
        if(url){const next=new URL(url);if(next.origin==='https://www.youtube.com'&&next.pathname==='/watch'&&next.searchParams.get('v')===state.videoId)return;}
        await ask({type:'CANCEL'});await chrome.offscreen.closeDocument();
    }catch{/* Tab/document already gone. */}
}
chrome.tabs.onRemoved.addListener(id=>{void cancelledTab(id);});
chrome.tabs.onUpdated.addListener((id,change)=>{if(change.url)void cancelledTab(id,change.url);});
