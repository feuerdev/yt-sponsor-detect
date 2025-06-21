console.log("Content script loaded.");

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

// Listener for commands from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "SKIP_SEGMENT") {
    const { skipToTime } = request.payload;
    console.log(`Received skip command. Skipping to ${skipToTime}s`);

    const video = document.querySelector('video');
    if (video) {
        // Don't skip if we are already past that time
        if (video.currentTime < skipToTime) {
            video.currentTime = skipToTime;
            console.log(`Skipped to ${skipToTime}s`);
            showSkipNotification();
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
