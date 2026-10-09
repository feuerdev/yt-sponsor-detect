import {captureOpenTranscript,panelCaptions} from './transcript-panel.js';
import { classifyCaptions } from './classifier.js';
import { sponsorLabels } from './sponsor-policy.js';
import { validateSegments } from './caption-contract.js';
import { MODEL_SPEC } from './model-spec.js';

console.log("Background script loaded.");

const tabState = {};
let policyGeneration = 0;
const CACHE_PREFIX = 'sponsor-cache:';
const CACHE_MAX_ENTRIES = 30;
const CACHE_TTL_MS = 48 * 3600000;
function policyKey(labels) {
    const policy=sponsorLabels(labels);
    if (!policy) return null;
    return JSON.stringify([3, MODEL_SPEC.revision, MODEL_SPEC.files.at(-1).sha256,
        MODEL_SPEC.pipelineVersion,MODEL_SPEC.decoding.mergeGapCharacters,MODEL_SPEC.decoding.mergeGapSeconds,policy]);
}
function validSegments(segments) {
    return Array.isArray(segments) && segments.length <= 1000 && segments.every(segment =>
        Number.isFinite(segment?.startTime) && Number.isFinite(segment?.endTime)
        && segment.startTime >= 0 && segment.endTime > segment.startTime
        && typeof segment.label === 'string');
}
let cacheWriteQueue = Promise.resolve();
function cacheCompleted(tabId, videoId, labels, tabData) {
    // Serialize the read/evict/write transaction across tabs.
    const write = cacheWriteQueue.then(() => writeCompletedCache(tabId, videoId, labels, tabData));
    cacheWriteQueue = write.catch(() => {});
    return write;
}
async function writeCompletedCache(tabId, videoId, labels, tabData) {
    const key = tabData.policyKey || policyKey(labels);
    const settings = await chrome.storage.sync.get({isEnabled: true, labels: null});
    if (tabState[tabId] !== tabData || !settings.isEnabled || policyKey(settings.labels) !== key
        || !validSegments(tabData.foundSegments)) return;
    const cached = await chrome.storage.local.get(null);
    if (tabState[tabId] !== tabData) return;
    const others = Object.entries(cached).filter(([name]) => name.startsWith(CACHE_PREFIX)
        && name !== CACHE_PREFIX + videoId).sort((a,b) => (a[1]?.createdAt || 0) - (b[1]?.createdAt || 0));
    if (others.length >= CACHE_MAX_ENTRIES)
        await chrome.storage.local.remove(others.slice(0, others.length - CACHE_MAX_ENTRIES + 1).map(([name]) => name));
    if (tabState[tabId] !== tabData) return;
    await chrome.storage.local.set({[CACHE_PREFIX + videoId]: {
        policyKey: key, complete: true, createdAt: Date.now(), backend: tabData.backend || null, model: MODEL_SPEC.revision, captionProvenance: tabData.captionProvenance || null, segments: tabData.foundSegments.map(segment => ({...segment}))
    }});
}
chrome.storage.onChanged?.addListener((changes, area) => {
    if (area !== 'sync' || (!changes.labels && !changes.isEnabled)) return;
    policyGeneration++;
    for (const [id, state] of Object.entries(tabState)) {
        delete tabState[id];
        chrome.tabs.sendMessage(Number(id), {type: 'CLEAR_SEGMENTS', videoId: state.videoId}).catch(() => {});
    }
});

function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

async function processCaptions(tabId,videoId,labels) {
    const tabData=tabState[tabId],policy=sponsorLabels(labels);
    if (!tabData || tabData.isAnalyzing || !policy || !tabData.allCaptions.length) return;
    tabData.isAnalyzing=true;
    let failed=false;
    const send=async(type,payload)=>{if(tabState[tabId]===tabData)await chrome.tabs.sendMessage(tabId,{type,videoId,payload}).catch(()=>{});};
    await send('ANALYSIS_STARTED',{total:0,processed:0,captionProvenance:tabData.captionProvenance||null});
    try {
        const result=policy[0].blocked?await classifyCaptions(tabData.allCaptions,policy[0].threshold,p=>{send('ANALYSIS_PROGRESS',p);}):{segments:[]};
        if(tabState[tabId]!==tabData)return;
        validateSegments(result.segments,tabData.allCaptions);
        tabData.backend=result.backend;
        for(const segment of result.segments){
            if(tabState[tabId]!==tabData)return;
            await processNewSegment(tabId,videoId,{startTime:segment.start,endTime:segment.end,label:'sponsor'});
        }
        if(tabState[tabId]===tabData)await cacheCompleted(tabId,videoId,labels,tabData);
    } catch(error) {
        failed=true;
        if(tabState[tabId]===tabData){
            tabData.foundSegments.length=0;
            await chrome.storage.local.remove(CACHE_PREFIX+videoId).catch(()=>{});
            const code=['model_unavailable','inference_failed','invalid_output'].includes(error?.code)?error.code:'analysis_failed';
            await send('CLEAR_SEGMENTS');await send('ANALYSIS_ERROR',{code});
            if(tabState[tabId]===tabData)delete tabState[tabId];
        }
    } finally {
        tabData.isAnalyzing=false;
        if(!failed)await send('ANALYSIS_FINISHED');
    }
}

async function processNewSegment(tabId, videoId, newSegment) {
    const tabData = tabState[tabId];
    if (!tabData || tabData.videoId !== videoId) return;
    
    // Check for duplicates or overlaps with already found segments
    const isDuplicate = tabData.foundSegments.some(s =>
        s.label === newSegment.label &&
        Math.abs(s.startTime - newSegment.startTime) < 1 &&
        Math.abs(s.endTime - newSegment.endTime) < 1
    );

    if (isDuplicate) return;

    // This is a new, valid segment
    tabData.foundSegments.push(newSegment);
    console.log(`Sponsored segment found for video ${videoId} on tab ${tabId}: [${formatTime(newSegment.startTime)} - ${formatTime(newSegment.endTime)}] - Category: ${newSegment.label}`);
    
    // Send to content script
    try {
        await chrome.tabs.sendMessage(tabId, {
            type: "SPONSORED_SEGMENT_FOUND",
            videoId,
            payload: newSegment
        });
    } catch (e) {
        if (e.message.includes('Receiving end does not exist')) {
            console.log(`Tab ${tabId} not available to send message. It was likely closed.`);
        } else {
            console.error(`An unexpected error occurred when sending message to tab ${tabId}:`, e);
        }
    }
    

}

chrome.webRequest.onCompleted.addListener(
  async (details) => {
    if (details.initiator === `chrome-extension://${chrome.runtime.id}`) {
        return; // Ignore requests from the extension itself
    }
    
    if (details.tabId < 0 || !details.url.includes("youtube.com/api/timedtext")) return;
    const url = new URL(details.url);
    const videoId = url.searchParams.get('v');
    if (!videoId) return;

    // Capture state before the first await: older responses must not revive a tab.
    const tabId = details.tabId;
    // A user-selected public panel owns this request; late caption URLs must not replace it.
    if(tabState[tabId]?.videoId===videoId && tabState[tabId]?.captionUrl==='public-transcript-panel')return;
    if (!tabState[tabId] || tabState[tabId].videoId !== videoId || tabState[tabId].captionUrl !== details.url) {
        console.log(`New video detected (${videoId}) on tab ${tabId}. Resetting state.`);
        tabState[tabId] = {
            videoId: videoId,
            captionUrl: details.url,
            captionsFetched: false,
            captionRequestPending: false,
            allCaptions: [],
            foundSegments: [],
            isAnalyzing: false
        };
    }

    const tabData = tabState[tabId];
    const language=url.searchParams.get('tlang') || url.searchParams.get('lang');
    if(!/^en(?:[-_]|$)/i.test(language || '')){
        delete tabState[tabId];
        await chrome.tabs.sendMessage(tabId,{type:'CLEAR_SEGMENTS',videoId}).catch(()=>{});
        await chrome.tabs.sendMessage(tabId,{type:'ANALYSIS_ERROR',videoId,payload:{code:'unsupported_language'}}).catch(()=>{});
        return;
    }
    if (tabData.captionsFetched || tabData.captionRequestPending) return;
    tabData.captionRequestPending = true;
    const generation = policyGeneration;

    const { isEnabled, labels } = await chrome.storage.sync.get({ 
        isEnabled: true, 
        labels: null
    });

    if (generation !== policyGeneration || tabState[tabId] !== tabData || !isEnabled || !policyKey(labels)) {
      tabData.captionRequestPending = false;
      return;
    }
    tabData.policyKey = policyKey(labels);

    if (details.url.includes("youtube.com/api/timedtext")) {

      // The webRequest API doesn't provide the response body, so we re-fetch the URL to get the captions.
      try {
        const response = await fetch(details.url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const responseText = await response.text();
        if (tabState[tabId] !== tabData) return;
        const data = JSON.parse(responseText);
        
        if (data && Array.isArray(data.events)) {
            const textEvents = data.events.filter(event => event.segs).map(event => {
                if (!Array.isArray(event.segs) || event.segs.some(segment => typeof segment.utf8 !== 'string'))
                    throw new Error('invalid_captions');
                return {...event, text: event.segs.map(s => s.utf8).join('').replace(/\n/g, ' ').trim()};
            }).filter(event => event.text);
            // JSON3 line-break events can omit duration. Only speech needs boundaries.
            if (textEvents.some(event => !Number.isFinite(event.tStartMs) || event.tStartMs < 0
                || !Number.isFinite(event.dDurationMs) || event.dDurationMs <= 0))
                throw new Error('invalid_captions');
            const captions = textEvents.map(event => ({
                    start: (event.tStartMs / 1000).toFixed(3),
                    duration: (event.dDurationMs / 1000).toFixed(3),
                    text: event.text
                }));
            
            if (captions.length === 0) return;

            captions.sort((a,b) => Number(a.start) - Number(b.start));
            tabData.captionsFetched = true;
            tabData.allCaptions.push(...captions);

            // Analyze every speech cue, including short tracks and the tail.
            processCaptions(tabId,videoId,labels);
        }
      } catch (error) {
        if (tabState[tabId] === tabData) {
            delete tabState[tabId];
            await chrome.tabs.sendMessage(tabId, {type: 'CLEAR_SEGMENTS', videoId}).catch(() => {});
            await chrome.tabs.sendMessage(tabId, {type: 'ANALYSIS_ERROR', videoId, payload: {code: 'captions_unavailable'}}).catch(() => {});
        }
      } finally {
        tabData.captionRequestPending = false;
      }
    }
  },
  { urls: ["*://*.youtube.com/*"] }
);

function watchVideoId(tab) {
    try {
        const url=new URL(tab?.url);
        const id=url.searchParams.get('v');
        return url.protocol==='https:' && url.hostname==='www.youtube.com' && url.pathname==='/watch'
            && /^[a-zA-Z0-9_-]{11}$/.test(id || '') ? id : null;
    }catch{return null;}
}
async function analyzeOpenTranscript(targetTab=null,automatic=false) {
    const generation=policyGeneration;
    let tab,videoId,state;
    const cancelled=()=>generation!==policyGeneration || tabState[tab.id]!==state;
    try {
        if(targetTab)tab=targetTab;else [tab]=await chrome.tabs.query({active:true,currentWindow:true});videoId=watchVideoId(tab);
        if(!videoId || !Number.isInteger(tab.id))return {ok:false,code:'not_youtube_video'};
        const settings=await chrome.storage.sync.get({isEnabled:true,labels:null});
        if(generation!==policyGeneration)return {ok:false,code:'cancelled'};
        const labels=sponsorLabels(settings.labels);
        if(!settings.isEnabled || !labels?.[0]?.blocked)return {ok:false,code:'disabled'};
        if(watchVideoId(await chrome.tabs.get(tab.id))!==videoId)return {ok:false,code:'cancelled'};
        if(tabState[tab.id]?.videoId===videoId && (tabState[tab.id].isAnalyzing
            || tabState[tab.id].captionUrl==='public-transcript-panel'&&(tabState[tab.id].captionRequestPending||automatic&&tabState[tab.id].captionsFetched)))return {ok:false,code:'analysis_in_progress'};
        state={videoId,captionUrl:'public-transcript-panel',captionRequestPending:true,captionsFetched:false,
            allCaptions:[],foundSegments:[],isAnalyzing:false,policyKey:policyKey(settings.labels)};
        tabState[tab.id]=state;
        const results=await chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},world:'MAIN',func:captureOpenTranscript,args:automatic?[videoId,true]:[videoId]});
        if(cancelled())return {ok:false,code:'cancelled'};
        const snapshot=results?.find(result=>result.frameId===0)?.result;
        if(!snapshot)throw Error('captions_unavailable');
        const language=await chrome.i18n.detectLanguage(snapshot.rows.map(row=>row.text).join(' '));
        const currentVideoId=watchVideoId(await chrome.tabs.get(tab.id));
        if(cancelled() || currentVideoId!==videoId)return {ok:false,code:'cancelled'};
        const parsed=panelCaptions(snapshot,videoId,language,{allowPartial:automatic});
        state.allCaptions=parsed.captions;state.captionProvenance=parsed.provenance;
        state.captionRequestPending=false;state.captionsFetched=true;
        await chrome.tabs.sendMessage(tab.id,{type:'CLEAR_SEGMENTS',videoId}).catch(()=>{});
        if(cancelled())return {ok:false,code:'cancelled'};
        await processCaptions(tab.id,videoId,settings.labels);
        return cancelled()?{ok:false,code:'analysis_failed'}:{ok:true,captionProvenance:state.captionProvenance,segments:state.foundSegments.length};
    }catch(error) {
        const code=error?.message==='unsupported_language'?'unsupported_language':'captions_unavailable';
        if(state && !cancelled()) {
            delete tabState[tab.id];
            await chrome.storage.local.remove(CACHE_PREFIX+videoId).catch(()=>{});
            await chrome.tabs.sendMessage(tab.id,{type:'ANALYSIS_ERROR',videoId,payload:{code}}).catch(()=>{});
        }
        return {ok:false,code};
    }finally{if(state)state.captionRequestPending=false;}
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if(request.type==='ANALYZE_OPEN_TRANSCRIPT') {
        if(sender.id!==chrome.runtime.id || sender.url!==chrome.runtime.getURL('popup.html')) {
            sendResponse({ok:false,code:'invalid_request'});return false;
        }
        analyzeOpenTranscript().then(sendResponse);return true;
    }

    if (request.type === 'GET_CACHED_SEGMENTS') {
        const videoId = request.videoId;
        (async () => {
            try {
                const generation = policyGeneration;
                if (typeof videoId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(videoId)) {
                    sendResponse({segments: []}); return;
                }
                const settings = await chrome.storage.sync.get({isEnabled: true, labels: null});
                const key = policyKey(settings.labels);
                const data = await chrome.storage.local.get(CACHE_PREFIX + videoId);
                const entry = data[CACHE_PREFIX + videoId];
                const valid = generation === policyGeneration && settings.isEnabled && key && entry?.complete === true
                    && entry.policyKey === key && Number.isFinite(entry.createdAt)
                    && Date.now() >= entry.createdAt && Date.now() - entry.createdAt <= CACHE_TTL_MS
                    && validSegments(entry.segments);
                sendResponse({ segments: valid ? entry.segments : [], cached:!!valid, captionProvenance:valid?entry.captionProvenance:null });
                // A normal watch-page content script requests its cache on load and SPA navigation.
                // Acquire independently of CC/network traffic, including valid empty-result caching.
                if(!valid && sender.id===chrome.runtime.id && sender.frameId===0
                    && watchVideoId(sender.tab)===videoId && new URL(sender.url).origin==='https://www.youtube.com')
                    await analyzeOpenTranscript(sender.tab,true);
            } catch (e) {
                console.error("Error getting cached segments:", e);
                sendResponse({ segments: [] });
            }
        })();
        return true; // Indicates we will respond asynchronously.
    } else if (request.type === 'CLEAR_CACHE_FOR_ACTIVE_TAB') {
        (async () => {
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                const videoId = watchVideoId(tab);
                if (videoId) {
                    const state = tabState[tab.id];
                    // Serialize clear with writes so a newer completed result cannot be erased.
                    const clear = cacheWriteQueue.then(() =>
                        chrome.storage.local.remove([videoId, CACHE_PREFIX + videoId]));
                    cacheWriteQueue = clear.catch(() => {});
                    await clear;
                    if (tabState[tab.id] !== state) return;
                    if (state) delete tabState[tab.id];
                    await chrome.tabs.sendMessage(tab.id, {type: 'CLEAR_SEGMENTS', videoId});
                }
            } catch(e) {
                console.error("Error clearing cache for active tab:", e);
            }
        })();
        sendResponse({cleared: true});
        return false;
    }
});

// Clean up buffer when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabState[tabId]) {
        delete tabState[tabId];
        console.log(`Cleaned up state for closed tab: ${tabId}`);
    }
});

chrome.tabs.onUpdated?.addListener((tabId, changeInfo) => {
    if (changeInfo.url && tabState[tabId]) delete tabState[tabId];
});
