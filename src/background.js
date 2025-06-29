import { env } from '@xenova/transformers';
import { classifyText } from './classifier.js';

// Due to a bug in onnxruntime-web, we must disable multithreading for now.
// See https://github.com/microsoft/onnxruntime/issues/14445 for more information.
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.wasmPaths = '/ort/';

console.log("Background script loaded.");

const tabState = {};

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

    try {
        await chrome.tabs.sendMessage(tabId, { type: "ANALYSIS_STARTED", payload: { total: totalWindows, processed: 0 } });
    } catch (e) { /* Tab might be closed, ignore */ }

    try {
        // Process all windows currently in the queue
        while (tabData.windowQueue.length > 0) {
            const windowCaptions = tabData.windowQueue.shift(); // Get next window

            let textToAnalyze = windowCaptions.map(c => c.text).join(' ');
            if (textToAnalyze.length < MIN_WINDOW_TEXT_LENGTH) {
                processedWindows++;
                continue;
            }
            
            const classificationLabels = labels.map(l => l.name);
            const allScores = await classifyText(textToAnalyze, classificationLabels);

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
                await chrome.tabs.sendMessage(tabId, { type: "ANALYSIS_PROGRESS", payload: { total: totalWindows, processed: processedWindows } });
            } catch(e) { /* Tab might be closed, ignore */ }
        }

        tabData.windowScores.sort((a, b) => a.startTime - b.startTime);

        // After processing new windows, run the coalescing logic once.
        if (processedWindows > 0) {
            await findAndProcessSponsoredSegments(tabId, videoId, labels);
        }

    } catch (error) {
        console.error("Error processing window queue:", error);
    } finally {
        tabData.isAnalyzing = false;
        try {
            await chrome.tabs.sendMessage(tabId, { type: "ANALYSIS_FINISHED" });
        } catch(e) { /* Tab might be closed, ignore */ }
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
            const score = window.scores[label.name] || 0;

            if (score > scoreThreshold) {
                // Window is a candidate for this label
                if (currentSegment) {
                    // Extend the current segment
                    currentSegment.endTime = window.endTime;
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
        if (currentSegment) {
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
            payload: newSegment
        });
    } catch (e) {
        if (e.message.includes('Receiving end does not exist')) {
            console.log(`Tab ${tabId} not available to send message. It was likely closed.`);
        } else {
            console.error(`An unexpected error occurred when sending message to tab ${tabId}:`, e);
        }
    }
    
    // Save to local storage
    try {
        const result = await chrome.storage.local.get(videoId);
        const existingSegments = result[videoId] || [];
        const updatedSegments = [...existingSegments, newSegment];
        await chrome.storage.local.set({ [videoId]: updatedSegments });
    } catch (e) {
        console.error('Failed to cache segment:', e);
    }
}

chrome.webRequest.onCompleted.addListener(
  async (details) => {
    if (details.initiator === `chrome-extension://${chrome.runtime.id}`) {
        return; // Ignore requests from the extension itself
    }
    
    const { isEnabled, labels } = await chrome.storage.sync.get({ 
        isEnabled: true, 
        labels: []
    });

    if (!isEnabled || details.tabId < 0 || !labels || labels.length === 0) {
      return;
    }

    if (details.url.includes("youtube.com/api/timedtext")) {
      const url = new URL(details.url);
      const videoId = url.searchParams.get('v');
      if (!videoId) {
        return; // Not a video caption request we can use
      }

      // The webRequest API doesn't provide the response body, so we re-fetch the URL to get the captions.
      try {
        const response = await fetch(details.url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const responseText = await response.text();
        const data = JSON.parse(responseText);
        
        if (data && data.events) {
            const captions = data.events
                .filter(event => event.segs)
                .map(event => ({
                    start: (event.tStartMs / 1000).toFixed(3),
                    duration: (event.dDurationMs / 1000).toFixed(3),
                    text: event.segs.map(s => s.utf8).join('').replace(/\n/g, ' ').trim()
                }))
                .filter(caption => caption.text && caption.text.length > 0);
            
            if (captions.length === 0) return;

            const tabId = details.tabId;
            if (!tabState[tabId] || tabState[tabId].videoId !== videoId) {
                console.log(`New video detected (${videoId}) on tab ${tabId}. Resetting state.`);
                tabState[tabId] = { 
                    videoId: videoId, 
                    allCaptions: [], 
                    windowScores: [], 
                    foundSegments: [],
                    lastWindowStartCaptionIndex: -1,
                    windowQueue: [],
                    isAnalyzing: false
                };
            }
            
            const tabData = tabState[tabId];
            const firstNewCaptionIndex = tabData.allCaptions.length;
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
        console.error("Error processing captions:", error);
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
                const data = await chrome.storage.local.get(videoId);
                sendResponse({ segments: data[videoId] || [] });
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
                        await chrome.storage.local.remove(videoId);
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
        return true; // Async response
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
