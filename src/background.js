import { env } from '@xenova/transformers';
import { classifyText } from './classifier.js';
import { MODEL_SPEC } from './model-spec.js';

// Due to a bug in onnxruntime-web, we must disable multithreading for now.
// See https://github.com/microsoft/onnxruntime/issues/14445 for more information.
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.wasmPaths = '/ort/';

console.log("Background script loaded.");

const tabState = {};
let policyGeneration = 0;
const CACHE_PREFIX = 'sponsor-cache:';
const CACHE_MAX_ENTRIES = 30;
const CACHE_TTL_MS = 48 * 3600000;
function policyKey(labels) {
    if (!Array.isArray(labels) || labels.length === 0 || labels.length > 30
        || labels.some(label => !label || typeof label.name !== 'string' || !label.name.trim()
            || label.name.length > 160 || !Number.isFinite(label.threshold)
            || label.threshold < 0 || label.threshold > 1 || typeof label.blocked !== 'boolean')
        || new Set(labels.map(label => label.name)).size !== labels.length) return null;
    return JSON.stringify([2, MODEL_SPEC.revision, MODEL_SPEC.files.at(-1).sha256,
        labels.map(({name, threshold, blocked}) => ({name, threshold, blocked}))]);
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
    const settings = await chrome.storage.sync.get({isEnabled: true, labels: []});
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
        policyKey: key, complete: true, createdAt: Date.now(), segments: tabData.foundSegments.map(segment => ({...segment}))
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

// New constants for sliding window
const WINDOW_SIZE_CAPTIONS = 20; // Number of captions in a window
const WINDOW_STEP_CAPTIONS = 5;  // Number of captions to slide forward for the next window
const MIN_WINDOW_TEXT_LENGTH = 50; // Minimum number of characters in a window to be worth analyzing

function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

async function processWindowQueue(tabId, videoId, labels) {
    const tabData = tabState[tabId];
    if (!tabData || tabData.isAnalyzing || tabData.windowQueue.length === 0) {
        return;
    }
    tabData.isAnalyzing = true;
    const totalWindows = tabData.windowQueue.length;
    let processedWindows = 0;
    let failed = false;

    try {
        await chrome.tabs.sendMessage(tabId, { type: "ANALYSIS_STARTED", videoId, payload: { total: totalWindows, processed: 0 } });
    } catch (e) { /* Tab might be closed, ignore */ }

    try {
        // Process all windows currently in the queue
        while (tabState[tabId] === tabData && tabData.windowQueue.length > 0) {
            const windowCaptions = tabData.windowQueue.shift(); // Get next window

            let textToAnalyze = windowCaptions.map(c => c.text).join(' ');
            if (textToAnalyze.length < MIN_WINDOW_TEXT_LENGTH) {
                processedWindows++;
                continue;
            }
            
            const classificationLabels = labels.map(l => l.name);
            const allScores = await classifyText(textToAnalyze, classificationLabels);
            if (tabState[tabId] !== tabData) return;

            const windowStartTime = parseFloat(windowCaptions[0].start);
            const lastCaption = windowCaptions[windowCaptions.length - 1];
            const windowEndTime = parseFloat(lastCaption.start) + parseFloat(lastCaption.duration);

            const windowScore = {
                startTime: windowStartTime,
                endTime: windowEndTime,
                scores: allScores
            };
            
            tabData.windowScores.push(windowScore);
            processedWindows++;
            try {
                await chrome.tabs.sendMessage(tabId, { type: "ANALYSIS_PROGRESS", videoId, payload: { total: totalWindows, processed: processedWindows } });
            } catch(e) { /* Tab might be closed, ignore */ }
        }

        tabData.windowScores.sort((a, b) => a.startTime - b.startTime);

        // After processing new windows, run the coalescing logic once.
        if (tabState[tabId] === tabData && processedWindows > 0) {
            await findAndProcessSponsoredSegments(tabId, videoId, labels);
            if (tabState[tabId] === tabData) await cacheCompleted(tabId, videoId, labels, tabData);
        }

    } catch (error) {
        failed = true;
        if (tabState[tabId] === tabData) {
            tabData.windowQueue.length = 0;
            tabData.windowScores.length = 0;
            tabData.foundSegments.length = 0;
            await chrome.storage.local.remove(CACHE_PREFIX + videoId).catch(() => {});
            const codes = ['model_unavailable', 'inference_failed', 'invalid_output'];
            const code = codes.includes(error?.code) ? error.code : 'analysis_failed';
            try {
                await chrome.tabs.sendMessage(tabId, { type: 'CLEAR_SEGMENTS', videoId });
                if (tabState[tabId] === tabData) {
                    await chrome.tabs.sendMessage(tabId, { type: 'ANALYSIS_ERROR', videoId, payload: { code } });
                }
            } catch { /* Closed tabs require no playback action. */ }
            // Allow the next caption request to rebuild a failed analysis from scratch.
            if (tabState[tabId] === tabData) delete tabState[tabId];
        }
    } finally {
        tabData.isAnalyzing = false;
        if (tabState[tabId] === tabData && !failed) {
            try {
                await chrome.tabs.sendMessage(tabId, { type: "ANALYSIS_FINISHED", videoId });
            } catch(e) { /* Tab might be closed, ignore */ }
        }
    }
}

async function findAndProcessSponsoredSegments(tabId, videoId, labels) {
    const tabData = tabState[tabId];
    if (!tabData || tabData.videoId !== videoId) return;

    for (const label of labels) {
        if (!label.blocked) continue;

        let currentSegment = null;
        const scoreThreshold = label.threshold;

        for (const window of tabData.windowScores) {
            if (tabState[tabId] !== tabData) return;
            const score = window.scores[label.name] || 0;

            if (score > scoreThreshold) {
                // Window is a candidate for this label
                if (currentSegment) {
                    if (window.startTime > currentSegment.endTime) {
                        await processNewSegment(tabId, videoId, currentSegment);
                        if (tabState[tabId] !== tabData) return;
                        currentSegment = {startTime: window.startTime, endTime: window.endTime, label: label.name};
                    } else {
                        currentSegment.endTime = Math.max(currentSegment.endTime, window.endTime);
                    }
                } else {
                    // Start a new potential segment
                    currentSegment = {
                        startTime: window.startTime,
                        endTime: window.endTime,
                        label: label.name
                    };
                }
            } else {
                // Window is not a candidate, so any active segment ends here
                if (currentSegment) {
                    await processNewSegment(tabId, videoId, currentSegment);
                    currentSegment = null;
                }
            }
        }
        // Process any segment that was active at the very end
        if (currentSegment && tabState[tabId] === tabData) {
            await processNewSegment(tabId, videoId, currentSegment);
        }
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
    if (!tabState[tabId] || tabState[tabId].videoId !== videoId || tabState[tabId].captionUrl !== details.url) {
        console.log(`New video detected (${videoId}) on tab ${tabId}. Resetting state.`);
        tabState[tabId] = {
            videoId: videoId,
            captionUrl: details.url,
            captionsFetched: false,
            captionRequestPending: false,
            allCaptions: [],
            windowScores: [],
            foundSegments: [],
            lastWindowStartCaptionIndex: -1,
            windowQueue: [],
            isAnalyzing: false
        };
    }

    const tabData = tabState[tabId];
    if (tabData.captionsFetched || tabData.captionRequestPending) return;
    tabData.captionRequestPending = true;
    const generation = policyGeneration;

    const { isEnabled, labels } = await chrome.storage.sync.get({ 
        isEnabled: true, 
        labels: []
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

            // Determine where to start creating new windows from
            const startFromIndex = tabData.lastWindowStartCaptionIndex === -1
                ? 0
                : tabData.lastWindowStartCaptionIndex + WINDOW_STEP_CAPTIONS;
            
            let windowsAdded = 0;
            for (let i = startFromIndex; i <= tabData.allCaptions.length - WINDOW_SIZE_CAPTIONS; i += WINDOW_STEP_CAPTIONS) {
                const windowCaptions = tabData.allCaptions.slice(i, i + WINDOW_SIZE_CAPTIONS);
                tabData.windowQueue.push(windowCaptions);
                tabData.lastWindowStartCaptionIndex = i;
                windowsAdded++;
            }

            if (windowsAdded > 0) {
                 console.log(`Added ${windowsAdded} new windows to the queue for video ${videoId}.`);
                 // This is fire-and-forget; the function handles its own concurrency.
                 processWindowQueue(tabId, videoId, labels);
            }
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'GET_CACHED_SEGMENTS') {
        const videoId = request.videoId;
        (async () => {
            try {
                const generation = policyGeneration;
                if (typeof videoId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(videoId)) {
                    sendResponse({segments: []}); return;
                }
                const settings = await chrome.storage.sync.get({isEnabled: true, labels: []});
                const key = policyKey(settings.labels);
                const data = await chrome.storage.local.get(CACHE_PREFIX + videoId);
                const entry = data[CACHE_PREFIX + videoId];
                const valid = generation === policyGeneration && settings.isEnabled && key && entry?.complete === true
                    && entry.policyKey === key && Number.isFinite(entry.createdAt)
                    && Date.now() >= entry.createdAt && Date.now() - entry.createdAt <= CACHE_TTL_MS
                    && validSegments(entry.segments);
                sendResponse({ segments: valid ? entry.segments : [] });
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
                if (tab && tab.url && tab.url.includes("youtube.com/watch")) {
                    const url = new URL(tab.url);
                    const videoId = url.searchParams.get('v');
                    if (videoId) {
                        await chrome.storage.local.remove([videoId, CACHE_PREFIX + videoId]);
                        console.log(`Cleared cache for video ${videoId}.`);
                        
                        // Also clear runtime state for the tab
                        if (tabState[tab.id]) {
                            delete tabState[tab.id];
                            console.log(`Cleared runtime state for tab ${tab.id}.`);
                        }

                        // Also clear segments in the content script
                        await chrome.tabs.sendMessage(tab.id, { type: "CLEAR_SEGMENTS" });
                    }
                }
            } catch(e) {
                console.error("Error clearing cache for active tab:", e);
            }
        })();
        sendResponse({cleared: true});
        return false;
    }
});

// Listen for messages from content scripts - REMOVED as it's no longer needed.

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
