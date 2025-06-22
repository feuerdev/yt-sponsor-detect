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
