// SPDX-License-Identifier: GPL-3.0-or-later
import {initializeSettings} from './viewer/settings.js';
import {SessionCoordinator} from './viewer/coordinator.js';
import {ResultCache} from './viewer/cache.js';
import {CorrectionStore} from './viewer/corrections.js';
import {MODEL_SPEC} from './model-spec.js';
import {TRANSCRIPT_VERSION,validVideoId} from './viewer/transcript.js';
import {captureOpenTranscript,cancelTranscriptRecovery} from './transcript-panel.js';
import {panelToTranscript} from './viewer/panel.js';
let creating;
const jobs=new Map(),recoveries=new Map();
async function ensureOffscreen() {
    if ((await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']})).length) return;
    creating ||= chrome.offscreen.createDocument({url:'viewer-offscreen.html',reasons:['WORKERS'],justification:'Run local caption classification without blocking the YouTube player.'}).finally(()=>{creating=null;});
    await creating;
}
export const coordinator=new SessionCoordinator({
    settings:chrome.storage.sync,corrections:new CorrectionStore(chrome.storage.local),cache:new ResultCache(chrome.storage.local),
    modelKey:JSON.stringify(['viewer-v2',MODEL_SPEC.directory,MODEL_SPEC.revision,MODEL_SPEC.files.at(-1).sha256,MODEL_SPEC.pipelineVersion,'word-cues',TRANSCRIPT_VERSION,MODEL_SPEC.decoding]),
    notify:(tabId,state)=>chrome.tabs.sendMessage(tabId,{type:'VIEWER_STATE',state}),
    cancel:jobId=>{if(jobId){const separator=jobId.indexOf(':');void cancelPanel(Number(jobId.slice(0,separator)),jobId.slice(separator+1)).catch(()=>{});}if(jobs.has(jobId))jobs.get(jobId).cancelled=true;if(jobId)chrome.runtime.sendMessage({scope:'offscreen',type:'CANCEL_DETECTION',jobId}).catch(()=>{});},
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
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='sync'&&(changes.isEnabled?.newValue===false||changes.mode?.newValue==='off'))coordinator.disabled();});
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
        let url,source;try{source=new URL(sender.url||sender.tab.url);url=new URL(sender.tab.url||sender.url);}catch{return false;}
        // A content script can survive YouTube's home-to-watch SPA navigation.
        // The source origin must be trusted; the current tab URL owns video identity.
        if(sender.id!==chrome.runtime.id||(sender.frameId!==undefined&&sender.frameId!==0)
            ||source.origin!=='https://www.youtube.com'||url.origin!=='https://www.youtube.com')return false;
        if(message.type==='CANCEL_PANEL'){cancelPanel(sender.tab.id,message.token,message.videoId).then(()=>respond({cancelled:true}),()=>respond({error:'fetch_failed'}));return true;}
        if(url.pathname!=='/watch')return false;
        const tabId=sender.tab.id;
        if(message.type!=='START_SESSION'&&coordinator.sessions.has(tabId)&&coordinator.sessions.get(tabId).videoId!==url.searchParams.get('v'))return false;
        if(message.type==='START_SESSION'&&message.videoId===url.searchParams.get('v'))task=coordinator.begin(tabId,message.videoId,message.token,{retry:message.retry===true,paused:message.paused===true});
        else if(message.type==='CAPTURE_PANEL'){
            capturePanel(tabId,message.token).then(respond,()=>respond({error:'fetch_failed'}));return true;
        }
        else if(['PAUSE_VIDEO','REJECT_SEGMENT','PLAYER_STATUS'].includes(message.type))task=(async()=>{
            await restoreSession(sender.tab);
            const session=coordinator.sessions.get(tabId);
            if(!session||session.token!==message.token||session.videoId!==url.searchParams.get('v'))throw Error('stale_session');
            if(message.type==='PAUSE_VIDEO')return coordinator.pause(tabId,message.paused);
            if(message.type==='REJECT_SEGMENT')return coordinator.correct(tabId,message.token,message.index);
            return coordinator.snapshot(session);
        })();
        else if(message.type==='SUBMIT_TRANSCRIPT')task=coordinator.submit(tabId,message.token,message.transcript);
        else if(message.type==='TRANSCRIPT_UNAVAILABLE')task=coordinator.unavailable(tabId,message.token,message.reason);
    } else if(sender.id===chrome.runtime.id && ['GET_VIDEO_STATUS','PAUSE_VIDEO','RETRY_VIDEO','WATCH_SEGMENT','UNDO_SKIP','REJECT_SEGMENT','RESET_CORRECTIONS'].includes(message.type)) {
        task=(async()=>{
            const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
            if(!tab)return null;
            await restoreSession(tab);
            const session=coordinator.sessions.get(tab.id);
            if(message.type!=='GET_VIDEO_STATUS'&&(!session||(message.token!==undefined&&message.token!==session.token)||(message.videoId!==undefined&&message.videoId!==session.videoId)))throw Error('stale_session');
            if(message.type==='PAUSE_VIDEO')return coordinator.pause(tab.id,message.paused);
            if(message.type==='RETRY_VIDEO'){await chrome.tabs.sendMessage(tab.id,{type:'RETRY_VIDEO',fresh:message.fresh===true});return {retry:true};}
            if(message.type==='REJECT_SEGMENT'||message.type==='RESET_CORRECTIONS')return coordinator.correct(tab.id,session.token,message.index,message.type==='RESET_CORRECTIONS');
            if(message.type==='WATCH_SEGMENT'||message.type==='UNDO_SKIP') {
                const segment=session.segments[message.index];
                if(message.type==='WATCH_SEGMENT'&&!segment)throw Error('invalid_segment');
                const reply=await chrome.tabs.sendMessage(tab.id,{type:'PLAYER_ACTION',token:session.token,videoId:session.videoId,action:message.type==='UNDO_SKIP'?'undo':'watch',segment});
                if(!reply||reply.error)throw Error(reply?.error||'playback_unavailable');
                return {...coordinator.snapshot(session),lastSkip:reply.lastSkip};
            }
            const visit=await chrome.tabs.sendMessage(tab.id,{type:'GET_PLAYER_SESSION'}).catch(()=>null);
            return session?{...coordinator.snapshot(session),behaviors:visit?.token===session.token?visit.behaviors:[],lastSkip:visit?.token===session.token&&visit?.videoId===session.videoId?visit.lastSkip:null}:null;
        })();
    }
    if(task===undefined)return false;
    Promise.resolve(task).then(state=>respond({state}),error=>respond({error:['playback_unavailable','stale_session','invalid_segment'].includes(error?.message)?error.message:'unavailable'}));return true;
});

async function cancelPanel(tabId,token,videoId) {
    const operation=recoveries.get(tabId);
    if(!operation){
        // A worker restart loses its map, but MAIN still owns the request.
        if(validVideoId(videoId)&&typeof token==='string'&&token.length<=100)await chrome.scripting.executeScript({target:{tabId,frameIds:[0]},world:'MAIN',func:cancelTranscriptRecovery,args:[videoId,token]}).catch(()=>{});
        return;
    }
    if(token&&operation.token!==token)return;
    await chrome.scripting.executeScript({target:{tabId,frameIds:[0]},world:'MAIN',func:cancelTranscriptRecovery,args:[operation.videoId,operation.token]}).catch(()=>{});
    await operation.work.catch(()=>{});
    if(recoveries.get(tabId)===operation)recoveries.delete(tabId);
}
async function capturePanel(tabId,token) {
    const session=coordinator.sessions.get(tabId);
    if(!session||session.token!==token||session.status!=='loading')return {error:'fetch_failed'};
    await cancelPanel(tabId);
    const current=()=>coordinator.current(tabId,session);
    if(!current())return {error:'fetch_failed'};
    coordinator.recovering(tabId,token);
    const operation={videoId:session.videoId,token};recoveries.set(tabId,operation);
    operation.work=chrome.scripting.executeScript({target:{tabId,frameIds:[0]},world:'MAIN',func:captureOpenTranscript,args:[session.videoId,true,token]});
    let snapshot;
    try{[{result:snapshot}={}]=await operation.work;}finally{if(recoveries.get(tabId)===operation)recoveries.delete(tabId);}
    if(!current())return {error:'fetch_failed'};
    const tab=await chrome.tabs.get(tabId);const url=new URL(tab.url);
    if(!current()||url.origin!=='https://www.youtube.com'||url.pathname!=='/watch'||url.searchParams.get('v')!==session.videoId)return {error:'fetch_failed'};
    session.recovery=snapshot?.recovery;coordinator.publish(tabId,session);
    if(!snapshot||snapshot.error||!Array.isArray(snapshot.rows)||snapshot.rows.length>10000)return {error:'fetch_failed'};
    const text=snapshot.rows.map(r=>typeof r?.text==='string'?r.text:'').join(' ');
    if(!text||text.length>2000000)return {error:'fetch_failed'};
    const language=await chrome.i18n.detectLanguage(text);if(!current())return {error:'fetch_failed'};
    try{return {transcript:panelToTranscript(snapshot,session.videoId,language)};}
    catch(error){return {error:error.message==='unsupported_language'?'unsupported_language':'invalid_captions'};}
}

async function restoreSession(tab) {
    if(coordinator.sessions.has(tab.id))return;
    let url;try{url=new URL(tab.url);}catch{return;}
    if(url.origin!=='https://www.youtube.com'||url.pathname!=='/watch')return;
    let visit;try{visit=await chrome.tabs.sendMessage(tab.id,{type:'GET_PLAYER_SESSION'});}catch{return;}
    if(!visit||visit.videoId!==url.searchParams.get('v')||typeof visit.token!=='string'||!visit.token||visit.token.length>100)return;
    const current=await chrome.tabs.get(tab.id);if(current.url!==tab.url)return;
    // Another popup refresh or a navigation may have established a newer session.
    if(coordinator.sessions.has(tab.id))return;
    const state=await coordinator.begin(tab.id,visit.videoId,visit.token,{paused:visit.paused===true});
    if(state?.status==='loading')await chrome.tabs.sendMessage(tab.id,{type:'RETRY_VIDEO'}).catch(()=>{});
}
