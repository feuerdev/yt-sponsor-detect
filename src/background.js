import { classifyText } from './classifier.js';

console.log("Background script loaded.");

const captionBuffers = {};
const BUFFER_SIZE = 5; // Store the last 5 captions for each tab

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.initiator === `chrome-extension://${chrome.runtime.id}`) {
        return; // Ignore requests from the extension itself
    }
    chrome.storage.sync.get({ isEnabled: true, confidenceThreshold: 0.8 }, (data) => {
      if (!data.isEnabled || details.tabId < 0) {
        return;
      }

      if (details.url.includes("youtube.com/api/timedtext")) {
        fetch(details.url)
          .then(response => {
              if (!response.ok) {
                  throw new Error(`HTTP error! status: ${response.status}`);
              }
              return response.text();
          })
          .then(async (responseText) => {
            try {
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

                    // Buffer management
                    const tabId = details.tabId;
                    if (!captionBuffers[tabId]) {
                        captionBuffers[tabId] = [];
                    }
                    captionBuffers[tabId].push(...captions);
                    if (captionBuffers[tabId].length > BUFFER_SIZE) {
                        captionBuffers[tabId] = captionBuffers[tabId].slice(captionBuffers[tabId].length - BUFFER_SIZE);
                    }
                    const buffer = captionBuffers[tabId];
                    const textToAnalyze = buffer.map(c => c.text).join(' ');

                    // Classification
                    const result = await classifyText(textToAnalyze, data.confidenceThreshold);
                    if (result.block) {
                        console.log(`Sponsor segment detected in tab ${tabId}! Confidence: ${result.scores['promotional content']}. Skipping...`);
                        const lastCaption = buffer[buffer.length - 1];
                        const skipToTime = parseFloat(lastCaption.start) + parseFloat(lastCaption.duration);

                        chrome.tabs.sendMessage(tabId, {
                            type: "SKIP_SEGMENT",
                            payload: { skipToTime }
                        });
                        // Clear buffer to prevent immediate re-triggering
                        captionBuffers[tabId] = [];
                    }
                }
            } catch (e) {
                console.error("Error parsing captions:", e, "Payload:", responseText);
            }
          })
          .catch(error => {
            console.error("Error fetching or parsing captions:", error);
          });
      }
    });
  },
  { urls: ["*://*.youtube.com/*"] }
);

// Clean up buffer when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    if (captionBuffers[tabId]) {
        delete captionBuffers[tabId];
        console.log(`Cleaned up buffer for closed tab: ${tabId}`);
    }
});

// This listener is no longer needed for caption analysis,
// but we'll keep it for the chapter functionality.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "CHAPTERS_FOUND") {
      console.log("Received chapters from content script:", request.payload);
      // We can store or process these chapters later
    }
    return true;
});
