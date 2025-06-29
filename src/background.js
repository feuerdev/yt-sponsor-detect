import { env } from '@xenova/transformers';
import { classifyText } from './classifier.js';

// Due to a bug in onnxruntime-web, we must disable multithreading for now.
// See https://github.com/microsoft/onnxruntime/issues/14445 for more information.
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.wasmPaths = '/ort/';

console.log("Background script loaded.");

const PROD_LABELS = [
    "This is a paid promotion, endorsement, or sponsorship.",
    "This is neutral, normal, or regular content."
];
const PROD_PROMOTIONAL_LABEL = PROD_LABELS[0];

const tabState = {}; // Changed from tabSegments to tabState for clarity
const MIN_TEXT_LENGTH = 1000; // User-defined minimum text length for a chunk
const MAX_TEXT_LENGTH = 1400; // Failsafe character limit to prevent model errors

function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

async function analyzeCaptionChunk(tabId, videoId, captions, confidenceThreshold) {
    if (captions.length === 0) return;

    let textToAnalyze = captions.map(c => c.text).join(' ');
    // The chunking logic should prevent this, but as a safeguard:
    if (textToAnalyze.length > MAX_TEXT_LENGTH) {
        textToAnalyze = textToAnalyze.substring(0, MAX_TEXT_LENGTH);
    }

    const scores = await classifyText(textToAnalyze, PROD_LABELS);
    const promotionalScore = scores[PROD_PROMOTIONAL_LABEL] || 0;

    console.log(`Analyzing segment for video ${videoId} on tab ${tabId}: "${textToAnalyze.substring(0,100)}..."`);
    console.log(`Classification scores:`, JSON.stringify(scores));

    if (promotionalScore > confidenceThreshold) {
        const startTime = parseFloat(captions[0].start);
        const lastCaption = captions[captions.length - 1];
        const endTime = parseFloat(lastCaption.start) + parseFloat(lastCaption.duration);
        
        try {
            const tab = await chrome.tabs.get(tabId);
            // Ensure the tab is still on the correct YouTube video page
            if (tab.url && tab.url.includes("youtube.com/watch")) {
                const currentUrl = new URL(tab.url);
                const currentVideoId = currentUrl.searchParams.get('v');

                if (currentVideoId === videoId) {
                    console.log(`Sponsored segment found for video ${videoId} on tab ${tabId}: [${formatTime(startTime)} - ${formatTime(endTime)}] - Confidence: ${promotionalScore.toFixed(2)}`);
                    // No need to await, but we want to catch if it fails
                    chrome.tabs.sendMessage(tabId, {
                        type: "SPONSORED_SEGMENT_FOUND",
                        payload: { startTime, endTime }
                    });
                } else {
                     console.log(`Tab ${tabId} is no longer on video ${videoId} (now on ${currentVideoId}). Aborting message send.`);
                }
            }
        } catch (error) {
            // This can happen if the tab was closed. It's not a critical error.
            if (error.message.includes('No tab with id') || error.message.includes('Receiving end does not exist')) {
                console.log(`Tab ${tabId} not available to send message. It was likely closed.`);
            } else {
                console.error(`An unexpected error occurred when sending message to tab ${tabId}:`, error);
            }
        }
    }
}

chrome.webRequest.onCompleted.addListener(
  async (details) => {
    if (details.initiator === `chrome-extension://${chrome.runtime.id}`) {
        return; // Ignore requests from the extension itself
    }
    
    const { isEnabled, confidenceThreshold } = await chrome.storage.sync.get({ 
        isEnabled: true, 
        confidenceThreshold: 0.85 
    });

    if (!isEnabled || details.tabId < 0) {
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
            // If we have no state for this tab or the video ID has changed, reset it.
            if (!tabState[tabId] || tabState[tabId].videoId !== videoId) {
                console.log(`New video detected (${videoId}) on tab ${tabId}. Resetting caption buffer.`);
                tabState[tabId] = { videoId: videoId, captions: [] };
            }

            tabState[tabId].captions.push(...captions);
            
            const accumulatedTextLength = tabState[tabId].captions.reduce((sum, cap) => sum + cap.text.length + 1, 0);

            if (accumulatedTextLength >= MIN_TEXT_LENGTH) {
                let allCaptions = tabState[tabId].captions;
                tabState[tabId].captions = []; // Reset for next segment

                while (allCaptions.length > 0) {
                    let chunkCaptions = [];
                    let chunkLength = 0;
                    let lastGoodIndex = -1;

                    // Greedily build a chunk up to MAX_TEXT_LENGTH
                    for (let i = 0; i < allCaptions.length; i++) {
                        const caption = allCaptions[i];
                        const newLength = chunkLength + (caption.text + ' ').length;
                        
                        if (newLength > MAX_TEXT_LENGTH && i > 0) {
                            break; 
                        }
                        
                        chunkLength = newLength;

                        if (chunkLength >= MIN_TEXT_LENGTH) {
                            lastGoodIndex = i;
                        }
                    }

                    if (lastGoodIndex !== -1) {
                        // We have a chunk that's >= MIN_TEXT_LENGTH and <= MAX_TEXT_LENGTH
                        chunkCaptions = allCaptions.slice(0, lastGoodIndex + 1);
                        await analyzeCaptionChunk(tabId, videoId, chunkCaptions, confidenceThreshold);
                        allCaptions = allCaptions.slice(lastGoodIndex + 1);
                    } else {
                        // Could not form a chunk of MIN_TEXT_LENGTH.
                        // Put remaining captions back to be processed with the next batch.
                        tabState[tabId].captions = allCaptions;
                        break; // Exit the while loop
                    }
                }
            }
        }
      } catch (error) {
        console.error("Error processing captions:", error);
      }
    }
  },
  { urls: ["*://*.youtube.com/*"] }
);

// Listen for messages from content scripts - REMOVED as it's no longer needed.

// Clean up buffer when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabState[tabId]) {
        delete tabState[tabId];
        console.log(`Cleaned up state for closed tab: ${tabId}`);
    }
});
