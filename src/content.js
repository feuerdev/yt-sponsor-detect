console.log("Content script loaded.");

let captionBuffer = [];
const BUFFER_SIZE = 5; // Store the last 5 captions

// Function to extract chapters
const extractChapters = () => {
    try {
        const data = window.ytInitialPlayerResponse;
        const chapters = data?.playerOverlays?.playerOverlayRenderer?.decoratedPlayerBarRenderer?.decoratedPlayerBar?.playerBar?.chapteredPlayerBarRenderer?.chapters;
        if (chapters) {
            console.log("Found chapters:", chapters.map(c => ({ title: c.chapterRenderer.title.simpleText, startTime: c.chapterRenderer.timeRangeStartMillis })));
            // Send chapters to background script
            chrome.runtime.sendMessage({ type: "CHAPTERS_FOUND", payload: chapters });
        }
    } catch (e) {
        console.error("Could not extract chapters", e);
    }
};

// Listener for captions from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "CAPTIONS_RECEIVED") {
    console.log("Received captions:", request.payload);
    // Add new captions to the buffer
    captionBuffer.push(...request.payload);

    // Keep the buffer at a fixed size
    if (captionBuffer.length > BUFFER_SIZE) {
      captionBuffer = captionBuffer.slice(captionBuffer.length - BUFFER_SIZE);
    }

    const textToAnalyze = captionBuffer.map(c => c.text).join(' ');
    console.log("Sending text for analysis:", textToAnalyze);
    chrome.runtime.sendMessage({
      type: "ANALYZE_TEXT",
      payload: {
        text: textToAnalyze,
      }
    });
  } else if (request.type === "ANALYSIS_RESULT") {
    console.log("Received analysis result:", request.payload);
    
    const { classification, score } = request.payload;

    // Check if the top label is 'sponsored' with a high confidence.
    if (classification === 'sponsored' && score > 0.8) {
      console.log(`Sponsor segment detected! Confidence: ${score}. Skipping...`);

      const video = document.querySelector('video');
      if (video && captionBuffer.length > 0) {
        const lastCaption = captionBuffer[captionBuffer.length - 1];
        const skipToTime = parseFloat(lastCaption.start) + parseFloat(lastCaption.duration);
        
        // Don't skip if we are already past that time
        if (video.currentTime < skipToTime) {
            video.currentTime = skipToTime;
            console.log(`Skipped to ${skipToTime}s`);
            showSkipNotification();
            // Clear buffer to prevent immediate re-triggering
            captionBuffer = [];
        }
      }
    }
  }
});

const showSkipNotification = () => {
    const videoContainer = document.querySelector('#movie_player');
    if (!videoContainer) return;

    const notification = document.createElement('div');
    notification.textContent = 'Skipped sponsored segment';
    notification.style.position = 'absolute';
    notification.style.top = '10px';
    notification.style.right = '10px';
    notification.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    notification.style.color = 'white';
    notification.style.padding = '5px 10px';
    notification.style.borderRadius = '5px';
    notification.style.zIndex = '9999';
    notification.style.fontSize = '14px';
    
    videoContainer.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
};

// Run chapter extraction once the page is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', extractChapters);
} else {
    extractChapters();
}
