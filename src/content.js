console.log("Content script loaded.");

const sponsoredSegments = [];

function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Listener for commands from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "SPONSORED_SEGMENT_FOUND") {
    const { startTime, endTime } = request.payload;
    console.log(`Received sponsored segment: [${formatTime(startTime)} - ${formatTime(endTime)}]`);
    sponsoredSegments.push(request.payload);
  } else if (request.type === "CLEAR_SEGMENTS") {
    console.log("Clearing detected sponsor segments.");
    sponsoredSegments.length = 0;
    clearProgressBarHighlights();
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

function updateProgressBarHighlights() {
    const progressBar = document.querySelector('.ytp-progress-bar');
    const video = document.querySelector('video');

    if (!progressBar || !video || !video.duration) {
        return;
    }

    const duration = video.duration;

    for (const segment of sponsoredSegments) {
        const highlightId = `sponsored-highlight-${segment.startTime}-${segment.endTime}`;
        if (document.getElementById(highlightId)) {
            continue;
        }

        const highlight = document.createElement('div');
        highlight.id = highlightId;
        highlight.className = 'sponsored-segment-highlight';
        highlight.style.position = 'absolute';
        highlight.style.backgroundColor = 'rgba(255, 234, 0, 0.8)';
        highlight.style.top = '0';
        highlight.style.bottom = '0';
        highlight.style.zIndex = '9998';

        const left = (segment.startTime / duration) * 100;
        const width = ((segment.endTime - segment.startTime) / duration) * 100;

        highlight.style.left = `${left}%`;
        highlight.style.width = `${width}%`;

        progressBar.appendChild(highlight);
    }
}

function clearProgressBarHighlights() {
    const highlights = document.querySelectorAll('.sponsored-segment-highlight');
    highlights.forEach(h => h.remove());
}

function checkForSponsorBlock() {
    const video = document.querySelector('video');
    if (!video || video.readyState < 1) return; // No video or not ready to play

    updateProgressBarHighlights();

    for (const segment of sponsoredSegments) {
        // A tiny buffer to prevent getting stuck in a skip loop if a segment starts exactly where another ends.
        const buffer = 0.1; 
        if (video.currentTime > segment.startTime && video.currentTime < segment.endTime - buffer) {
            console.log(`Skipping sponsored segment from ${formatTime(video.currentTime)} to ${formatTime(segment.endTime)}`);
            video.currentTime = segment.endTime;
            showSkipNotification();
            break; 
        }
    }
}

let videoElement = null;
let lastVideoSrc = null;

function initializeVideoListener() {
    const video = document.querySelector('video');
    
    if (video) {
        // Check if it's a new video by looking at the src.
        // On YouTube, navigating to a new video in the same tab changes the video source.
        if (video.src !== lastVideoSrc) {
            console.log('New video detected.');
            lastVideoSrc = video.src;

            // Clear segments from the previous video
            sponsoredSegments.length = 0;
            clearProgressBarHighlights();
            
            if (videoElement) {
                videoElement.removeEventListener('timeupdate', checkForSponsorBlock);
            }
            videoElement = video;
            videoElement.addEventListener('timeupdate', checkForSponsorBlock);
            console.log("Attached listener to new video element.");
        }
    } else if (lastVideoSrc) {
        // Video has been removed from the page
        console.log('Video element removed.');
        lastVideoSrc = null;
        if (videoElement) {
            videoElement.removeEventListener('timeupdate', checkForSponsorBlock);
            videoElement = null;
        }
    }
}

// Use a MutationObserver to detect when the video player is added to or removed from the page.
// This is more efficient than polling with setInterval.
const observer = new MutationObserver(() => {
    initializeVideoListener();
});

// Start observing the body for changes in the DOM tree.
observer.observe(document.body, {
    childList: true,
    subtree: true
});

// Run once on load in case the video is already on the page.
initializeVideoListener();
