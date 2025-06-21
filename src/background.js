import { classifyText } from './classifier.js';

console.log("Background script loaded.");

chrome.webRequest.onCompleted.addListener(
  (details) => {
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
          .then(xmlText => {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, "text/xml");
            const textNodes = xmlDoc.getElementsByTagName("text");
            const captions = Array.from(textNodes).map(node => ({
              start: node.getAttribute("start"),
              duration: node.getAttribute("dur"),
              text: node.textContent.replace(/<\/?.*?>/g, "").replace(/\n/g, " ").trim()
            }));
            
            // Send captions to the active tab's content script
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                  type: "CAPTIONS_RECEIVED",
                  payload: captions
                });
              }
            });
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
