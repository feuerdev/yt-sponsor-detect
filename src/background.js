import { classifyText } from './classifier.js';

console.log("Background script loaded.");

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.initiator === `chrome-extension://${chrome.runtime.id}`) {
        return; // Ignore requests from the extension itself
    }
    chrome.storage.sync.get({ isEnabled: true }, (data) => {
      if (!data.isEnabled) {
        return; // Do nothing if the feature is disabled
      }

      // Proceed only if the feature is enabled
      if (details.url.includes("youtube.com/api/timedtext")) {
        console.log("Found timedtext request:", details.url);
        
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
                        .filter(caption => caption.text);
                    
                    // Send captions to the active tab's content script
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        if (tabs[0]) {
                            chrome.tabs.sendMessage(tabs[0].id, {
                                type: "CAPTIONS_RECEIVED",
                                payload: captions
                            });
                        }
                    });
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "CHAPTERS_FOUND") {
      console.log("Received chapters from content script:", request.payload);
      // We can store or process these chapters later
    } else if (request.type === "ANALYZE_TEXT") {
        chrome.storage.sync.get({ confidenceThreshold: 0.8 }, async (data) => {
            const result = await classifyText(request.payload.text, data.confidenceThreshold);
            console.log("Classification result:", result);
    
            // Send result back to the content script
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                  chrome.tabs.sendMessage(tabs[0].id, {
                    type: "ANALYSIS_RESULT",
                    payload: result
                  });
                }
            });
        });
        return true; // Keep message channel open for async response
    }
    return true;
});
