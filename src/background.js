import { env } from '@xenova/transformers';
import { classifyText } from './classifier.js';

// Due to a bug in onnxruntime-web, we must disable multithreading for now.
// See https://github.com/microsoft/onnxruntime/issues/14445 for more information.
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.wasmPaths = '/ort/';
env.allowRemoteModels = true;
env.allowLocalModels = false;

console.log("Background script loaded.");

const PROD_LABELS = [
    "This is a paid promotion, endorsement, or sponsorship.",
    "This is neutral, normal, or regular content."
];
const PROD_PROMOTIONAL_LABEL = PROD_LABELS[0];

const tabSegments = {};
const WORDS_PER_SEGMENT_THRESHOLD = 50;
const MAX_TEXT_LENGTH = 1500; // Failsafe character limit to prevent model errors

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
            if (!tabSegments[tabId]) {
                tabSegments[tabId] = { captions: [], wordCount: 0 };
            }

            tabSegments[tabId].captions.push(...captions);
            const newWords = captions.reduce((sum, cap) => sum + cap.text.split(' ').length, 0);
            tabSegments[tabId].wordCount += newWords;

            if (tabSegments[tabId].wordCount >= WORDS_PER_SEGMENT_THRESHOLD) {
                const segment = tabSegments[tabId];
                tabSegments[tabId] = { captions: [], wordCount: 0 }; // Reset for next segment

                let textToAnalyze = segment.captions.map(c => c.text).join(' ');
                if (textToAnalyze.length > MAX_TEXT_LENGTH) {
                    textToAnalyze = textToAnalyze.substring(0, MAX_TEXT_LENGTH);
                }
                const scores = await classifyText(textToAnalyze, PROD_LABELS);

                const promotionalScore = scores[PROD_PROMOTIONAL_LABEL] || 0;

                if (promotionalScore > confidenceThreshold) {
                    const startTime = parseFloat(segment.captions[0].start);
                    const lastCaption = segment.captions[segment.captions.length - 1];
                    const endTime = parseFloat(lastCaption.start) + parseFloat(lastCaption.duration);

                    const tab = await chrome.tabs.get(tabId);
                    if (tab.url && tab.url.includes("youtube.com/watch")) {
                        console.log(`Sponsored segment found for tab ${tabId}: "${textToAnalyze}" [${startTime}s - ${endTime}s] - Confidence: ${promotionalScore.toFixed(2)}`);
                        console.log(`Classification scores:`, JSON.stringify(scores));
                        chrome.tabs.sendMessage(tabId, {
                            type: "SPONSORED_SEGMENT_FOUND",
                            payload: { startTime, endTime }
                        });
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

// Clean up buffer when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabSegments[tabId]) {
        delete tabSegments[tabId];
        console.log(`Cleaned up segment data for closed tab: ${tabId}`);
    }
});
