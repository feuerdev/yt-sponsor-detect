// SPDX-License-Identifier: GPL-3.0-or-later
import {initializeSettings} from './viewer/settings.js';
import {SessionCoordinator} from './viewer/coordinator.js';
import {ResultCache} from './viewer/cache.js';
import {MODEL_SPEC} from './model-spec.js';
import {captureOpenTranscript} from './transcript-panel.js';
import {panelToTranscript} from './viewer/panel.js';
let creating;
const jobs=new Map();
async function ensureOffscreen() {
    if ((await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']})).length) return;
    creating ||= chrome.offscreen.createDocument({url:'viewer-offscreen.html',reasons:['WORKERS'],justification:'Run local caption classification without blocking the YouTube player.'}).finally(()=>{creating=null;});
    await creating;
}
export const coordinator=new SessionCoordinator({
    settings:chrome.storage.sync,cache:new ResultCache(chrome.storage.local),
    modelKey:JSON.stringify(['viewer-v2',MODEL_SPEC.directory,MODEL_SPEC.revision,MODEL_SPEC.files.at(-1).sha256,MODEL_SPEC.pipelineVersion,'word-cues',MODEL_SPEC.decoding]),
    notify:(tabId,state)=>chrome.tabs.sendMessage(tabId,{type:'VIEWER_STATE',state}),
    cancel:jobId=>{if(jobs.has(jobId))jobs.get(jobId).cancelled=true;if(jobId)chrome.runtime.sendMessage({scope:'offscreen',type:'CANCEL_DETECTION',jobId}).catch(()=>{});},
    detect:async(transcript,{jobId})=>{
        const job={cancelled:false};jobs.set(jobId,job);
        try {
        await ensureOffscreen();
        if(job.cancelled)throw Object.assign(new Error('cancelled'),{code:'cancelled'});
        const reply=await chrome.runtime.sendMessage({scope:'offscreen',type:'RUN_DETECTION',jobId,transcript});
        if (!reply || reply.error) throw Object.assign(new Error('local_analysis_failed'),{code:reply?.error||'model_unavailable'});
        return reply;
        } finally {jobs.delete(jobId);}
    },
});
chrome.runtime.onInstalled.addListener(()=>{initializeSettings(chrome.storage.sync).catch(()=>{});});
// Startup repairs missing defaults without requiring the popup to be opened.
initializeSettings(chrome.storage.sync).catch(()=>{});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='sync'&&changes.isEnabled?.newValue===false)coordinator.disabled();});
chrome.tabs.onRemoved.addListener(id=>coordinator.clear(id));
chrome.tabs.onUpdated.addListener((id,change)=>{
    if(!change.url)return;const session=coordinator.sessions.get(id);if(!session)return;
    try{const url=new URL(change.url);if(url.pathname!=='/watch'||url.searchParams.get('v')!==session.videoId)coordinator.clear(id);}catch{coordinator.clear(id);}
});
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if (!message || typeof message!=='object') return false;
    if (message.scope==='offscreen') return false;
    if(message.type==='DETECTION_PROGRESS'&&sender.id===chrome.runtime.id&&sender.url===chrome.runtime.getURL('viewer-offscreen.html')) {
        coordinator.progress(message.jobId,message.progress);return false;
    }
    let task;
    if (sender.tab && typeof sender.tab.id==='number') {
        let url;try{url=new URL(sender.url||sender.tab.url);}catch{return false;}
        if(url.hostname!=='www.youtube.com'||url.pathname!=='/watch')return false;
        const tabId=sender.tab.id;
        if(message.type==='START_SESSION'&&message.videoId===url.searchParams.get('v'))task=coordinator.begin(tabId,message.videoId,message.token,{retry:message.retry===true});
        else if(message.type==='CAPTURE_PANEL'){
            capturePanel(tabId,message.token).then(respond,()=>respond({error:'fetch_failed'}));return true;
        }
        else if(message.type==='SUBMIT_TRANSCRIPT')task=coordinator.submit(tabId,message.token,message.transcript);
        else if(message.type==='TRANSCRIPT_UNAVAILABLE')task=coordinator.unavailable(tabId,message.token,message.reason);
        else if(message.type==='PLAYER_STATUS')task=coordinator.snapshot(coordinator.sessions.get(tabId));
    } else if(sender.id===chrome.runtime.id && ['GET_VIDEO_STATUS','PAUSE_VIDEO','RETRY_VIDEO'].includes(message.type)) {
        task=(async()=>{
            const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
            if(!tab)return null;
            if(message.type==='PAUSE_VIDEO')return coordinator.pause(tab.id,message.paused);
            if(message.type==='RETRY_VIDEO'){await chrome.tabs.sendMessage(tab.id,{type:'RETRY_VIDEO'});return {retry:true};}
            return coordinator.snapshot(coordinator.sessions.get(tab.id));
        })();
    }
    if(task===undefined)return false;
    Promise.resolve(task).then(state=>respond({state}),()=>respond({error:'unavailable'}));return true;
});

async function capturePanel(tabId,token) {
    const session=coordinator.sessions.get(tabId);
    if(!session||session.token!==token||session.status!=='loading')return {error:'fetch_failed'};
    const current=()=>coordinator.current(tabId,session);
    const [{result:snapshot}={}]=await chrome.scripting.executeScript({target:{tabId,frameIds:[0]},world:'MAIN',func:captureOpenTranscript,args:[session.videoId,true]});
    if(!current())return {error:'fetch_failed'};
    const tab=await chrome.tabs.get(tabId);const url=new URL(tab.url);
    if(url.origin!=='https://www.youtube.com'||url.pathname!=='/watch'||url.searchParams.get('v')!==session.videoId)return {error:'fetch_failed'};
    if(!snapshot||!Array.isArray(snapshot.rows)||snapshot.rows.length>10000)return {error:'fetch_failed'};
    const text=snapshot.rows.map(r=>typeof r?.text==='string'?r.text:'').join(' ');
    if(!text||text.length>2000000)return {error:'fetch_failed'};
    const language=await chrome.i18n.detectLanguage(text);if(!current())return {error:'fetch_failed'};
    try{return {transcript:panelToTranscript(snapshot,session.videoId,language)};}
    catch(error){return {error:error.message==='unsupported_language'?'unsupported_language':'invalid_captions'};}
}
