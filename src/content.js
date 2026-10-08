console.log("Content script loaded.");

const sponsoredSegments = [];
const ANALYSIS_INDICATOR_ID = 'analysis-in-progress-indicator';
const NOTIFICATION_CONTAINER_ID = 'sponsor-block-notification-container';

// Wait for saved settings before changing playback, and prefer newer toggle events.
let isEnabled = false;
let settingsGeneration = 0;
const initialSettingsGeneration = settingsGeneration;
chrome.storage.sync.get({ isEnabled: true, autoSkip: false }).then(settings => {
    if (settingsGeneration === initialSettingsGeneration) isEnabled = settings.isEnabled === true;
}).catch(() => console.error('Unable to load sponsor settings. Playback unchanged.'));
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.isEnabled) {
        settingsGeneration++;
        isEnabled = (changes.isEnabled.newValue ?? true) === true;
        if (!isEnabled) clearPlaybackControls();
    }
    if (changes.labels || changes.isEnabled) {
        videoGeneration++;
        sponsoredSegments.length = 0;
        clearPlaybackControls();
        clearProgressBarHighlights();
        hideAnalysisIndicator();
    }
});


function addSponsoredSegment(newSegment) {
    if (!newSegment || !Number.isFinite(newSegment.startTime) || !Number.isFinite(newSegment.endTime)
        || newSegment.startTime < 0 || newSegment.endTime <= newSegment.startTime) return;
    const isDuplicate = sponsoredSegments.some(
        s => s.startTime === newSegment.startTime && s.endTime === newSegment.endTime
    );
    if (!isDuplicate) {
        // Ensure skipDisabled is initialized
        newSegment.skipDisabled = false;
        sponsoredSegments.push(newSegment);
    }
}

function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Listener for commands from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.videoId && request.videoId !== new URLSearchParams(window.location.search).get('v')) return;
  if (request.type === "SPONSORED_SEGMENT_FOUND") {
    console.log(`Received sponsored segment: [${formatTime(request.payload.startTime)} - ${formatTime(request.payload.endTime)}]`);
    addSponsoredSegment(request.payload);
  } else if (request.type === "CLEAR_SEGMENTS") {
    console.log("Clearing detected sponsor segments.");
    sponsoredSegments.length = 0;
    clearPlaybackControls();
    document.getElementById('sponsor-analysis-error')?.remove();
    document.getElementById('sponsor-transcript-coverage')?.remove();
    clearProgressBarHighlights();
  } else if (request.type === "ANALYSIS_ERROR") {
    sponsoredSegments.length = 0;
    clearProgressBarHighlights();
    clearPlaybackControls();
    showAnalysisError(request.payload?.code);
  } else if (request.type === "ANALYSIS_STARTED") {
    document.getElementById('sponsor-analysis-error')?.remove();
    showTranscriptCoverage(request.payload.captionProvenance);
    showAnalysisIndicator(request.payload.processed, request.payload.total);
  } else if (request.type === "ANALYSIS_PROGRESS") {
    updateAnalysisIndicator(request.payload.processed, request.payload.total);
  } else if (request.type === "ANALYSIS_FINISHED") {
    hideAnalysisIndicator();
  }
});

function getNotificationContainer() {
    let container = document.getElementById(NOTIFICATION_CONTAINER_ID);
    if (container) return container;

    const videoContainer = document.querySelector('#movie_player');
    if (!videoContainer) return null;
    
    container = document.createElement('div');
    container.id = NOTIFICATION_CONTAINER_ID;
    container.style.position = 'absolute';
    container.style.top = '10px';
    container.style.right = '10px';
    container.style.zIndex = '9999';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '5px';
    container.style.alignItems = 'flex-end';

    videoContainer.appendChild(container);
    return container;
}

function showAnalysisIndicator(processed, total) {
    let container = document.getElementById(NOTIFICATION_CONTAINER_ID);
    if (!container) container = getNotificationContainer();
    if (!container) return;

    let indicator = document.getElementById(ANALYSIS_INDICATOR_ID);
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = ANALYSIS_INDICATOR_ID;
        indicator.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        indicator.style.color = 'white';
        indicator.style.padding = '8px 12px';
        indicator.style.borderRadius = '5px';
        indicator.style.fontSize = '14px';
        indicator.style.width = '250px';
        indicator.style.textAlign = 'center';
        indicator.style.transition = 'opacity 0.3s ease-in-out';
        indicator.style.opacity = '1';

        const text = document.createElement('span');
        text.id = 'analysis-indicator-text';
        indicator.appendChild(text);

        const progressBarOuter = document.createElement('div');
        progressBarOuter.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
        progressBarOuter.style.borderRadius = '3px';
        progressBarOuter.style.marginTop = '5px';
        progressBarOuter.style.height = '6px';
        progressBarOuter.style.width = '100%';
        progressBarOuter.style.overflow = 'hidden';

        const progressBarInner = document.createElement('div');
        progressBarInner.id = 'analysis-indicator-progress';
        progressBarInner.style.backgroundColor = '#FFEA00';
        progressBarInner.style.width = '0%';
        progressBarInner.style.height = '100%';
        progressBarInner.style.borderRadius = '3px';
        progressBarInner.style.transition = 'width 0.2s ease-out';
        
        progressBarOuter.appendChild(progressBarInner);
        indicator.appendChild(progressBarOuter);

        container.appendChild(indicator);
    }
    
    updateAnalysisIndicator(processed, total);
}

function updateAnalysisIndicator(processed, total) {
    const indicatorText = document.getElementById('analysis-indicator-text');
    const progressBar = document.getElementById('analysis-indicator-progress');

    if (indicatorText) {
        indicatorText.textContent = total > 0 ? `Analyzing... (${processed}/${total} windows)` : 'Loading sponsor detector...';
    }
    if (progressBar) {
        const percentage = total > 0 ? (processed / total) * 100 : 0;
        progressBar.style.width = `${percentage}%`;
    }
}

function hideAnalysisIndicator() {
    const indicator = document.getElementById(ANALYSIS_INDICATOR_ID);
    if (indicator) {
        indicator.style.opacity = '0';
        // Remove from DOM after transition
        setTimeout(() => indicator.remove(), 300);
    }
}

function clearPlaybackControls() {
    document.getElementById('sponsor-skip-suggestion')?.remove();
    document.getElementById('sponsor-undo-notice')?.remove();
}

function contentPlaybackAvailable(video) {
    return video?.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0
        && !video.error && !document.querySelector('#movie_player')?.classList?.contains('ad-showing');
}

function playbackIdentity(video) {
    return { video, generation: videoGeneration, src: video.src,
        videoId: new URLSearchParams(window.location.search).get('v') };
}
function isCurrentPlayback(identity) {
    return isEnabled && contentPlaybackAvailable(identity.video) && identity.video === document.querySelector('video')
        && identity.generation === videoGeneration && identity.src === identity.video.src
        && identity.videoId === new URLSearchParams(window.location.search).get('v');
}

function showTranscriptCoverage(provenance) {
    document.getElementById('sponsor-transcript-coverage')?.remove();
    if(provenance?.coverage!=='partial' || !Number.isFinite(provenance.coverageStart)
        || !Number.isFinite(provenance.coverageEnd))return;
    const container=getNotificationContainer();if(!container)return;
    const status=document.createElement('div');status.id='sponsor-transcript-coverage';status.setAttribute('role','status');
    status.textContent=`Partial transcript analyzed: ${formatTime(provenance.coverageStart)}–${formatTime(provenance.coverageEnd)}. Other portions were not checked.`;
    status.style.backgroundColor='rgba(0,0,0,0.8)';status.style.color='white';status.style.padding='8px';container.appendChild(status);
}
function showAnalysisError(code) {
    hideAnalysisIndicator();
    document.getElementById('sponsor-transcript-coverage')?.remove();
    const container = getNotificationContainer();
    if (!container) return;
    document.getElementById('sponsor-analysis-error')?.remove();
    const status = document.createElement('div');
    status.id = 'sponsor-analysis-error';
    status.setAttribute('role', 'status');
    status.textContent = ({
        captions_unavailable:'YouTube transcript unavailable. Playback unchanged.',
        unsupported_language:'Sponsor detection currently requires an English transcript. Playback unchanged.',
        model_unavailable:'Sponsor model unavailable. Playback unchanged.',
        inference_failed:'Sponsor analysis failed. Playback unchanged.',
        invalid_output:'Sponsor analysis returned invalid results. Playback unchanged.',
    })[code] || 'Sponsor detection unavailable. Playback unchanged.';
    status.style.backgroundColor = 'rgba(0,0,0,0.8)';
    status.style.color = 'white';
    status.style.padding = '8px';
    container.appendChild(status);
}

function showSkipNotification(video, segment, previousTime) {
    const container = getNotificationContainer();
    if (!container) return;
    document.getElementById('sponsor-undo-notice')?.remove();
    document.getElementById('sponsor-skip-suggestion')?.remove();
    const identity = playbackIdentity(video);
    const notice = document.createElement('div');
    notice.id = 'sponsor-undo-notice';
    notice.style.backgroundColor = 'rgba(0,0,0,0.8)';
    notice.style.color = 'white';
    notice.style.padding = '8px';
    const text = document.createElement('span');
    text.textContent = `Skipped suggestion: ${segment.label || 'sponsor'} `;
    const undo = document.createElement('button');
    undo.type = 'button';
    undo.textContent = 'Undo';
    undo.addEventListener('click', () => {
        if (!isCurrentPlayback(identity) || !sponsoredSegments.includes(segment)) return;
        segment.skipDisabled = true;
        video.currentTime = previousTime;
        notice.remove();
        updateProgressBarHighlights();
    });
    notice.appendChild(text);
    notice.appendChild(undo);
    container.appendChild(notice);
}

function performSkip(video, segment) {
    if (!isEnabled || !contentPlaybackAvailable(video) || segment.skipDisabled || !sponsoredSegments.includes(segment)
        || !Number.isFinite(video.currentTime) || video.currentTime < segment.startTime
        || video.currentTime >= segment.endTime - 0.1) return;
    const destination = Math.min(segment.endTime, video.duration);
    if (destination <= video.currentTime) return;
    const previousTime = video.currentTime;
    video.currentTime = destination;
    showSkipNotification(video, segment, previousTime);
}

function showSkipSuggestion(video, segment) {
    const existing = document.getElementById('sponsor-skip-suggestion');
    if (existing?.segment === segment) return;
    existing?.remove();
    const container = getNotificationContainer();
    if (!container) return;
    const identity = playbackIdentity(video);
    const notice = document.createElement('div');
    notice.id = 'sponsor-skip-suggestion';
    notice.segment = segment;
    notice.style.backgroundColor = 'rgba(0,0,0,0.8)';
    notice.style.color = 'white';
    notice.style.padding = '8px';
    const text = document.createElement('span');
    text.textContent = `Suggested interval: ${segment.label || 'sponsor'} `;
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.textContent = 'Skip suggestion';
    skip.addEventListener('click', () => {
        if (isCurrentPlayback(identity)) performSkip(video, segment);
    });
    notice.appendChild(text);
    notice.appendChild(skip);
    container.appendChild(notice);
}

function updateProgressBarHighlights() {
    const progressBar = document.querySelector('.ytp-progress-bar');
    const video = document.querySelector('video');

    if (!progressBar || !contentPlaybackAvailable(video)) {
        clearProgressBarHighlights();
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
        
        // Use bright yellow for segments, or grey if skipping is disabled
        const color = segment.skipDisabled ? 'rgba(128, 128, 128, 0.6)' : '#FFEA00';
        highlight.style.backgroundColor = color;
        highlight.style.opacity = '0.8';

        highlight.style.top = '0';
        highlight.style.bottom = '0';
        highlight.style.zIndex = '9998';
        highlight.title = segment.skipDisabled ? 'Skipping disabled' : `Category: ${segment.label}`;

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
    if (!isEnabled) return;
    const video = document.querySelector('video');
    if (!contentPlaybackAvailable(video)) {
        clearPlaybackControls();
        clearProgressBarHighlights();
        return;
    }
    updateProgressBarHighlights();
    for (const segment of sponsoredSegments) {
        if (!segment.skipDisabled && video.currentTime >= segment.startTime && video.currentTime < segment.endTime - 0.1) {
            showSkipSuggestion(video, segment);
            return;
        }
    }
    document.getElementById('sponsor-skip-suggestion')?.remove();
}

let videoElement = null;
let lastVideoSrc = null;
let lastVideoId = null;
let videoGeneration = 0;

function initializeVideoListener() {
    const video = document.querySelector('video');
    const videoId = new URLSearchParams(window.location.search).get('v');

    if (video) {
        if (video !== videoElement || video.src !== lastVideoSrc || videoId !== lastVideoId) {
            console.log('New video detected.');
            lastVideoSrc = video.src;
            lastVideoId = videoId;
            const generation = ++videoGeneration;

            if (videoElement) {
                videoElement.removeEventListener('timeupdate', checkForSponsorBlock);
            }
            sponsoredSegments.length = 0;
            clearPlaybackControls();
            document.getElementById('sponsor-analysis-error')?.remove();
            document.getElementById('sponsor-transcript-coverage')?.remove();
            clearProgressBarHighlights();

            if (videoId) {
                console.log(`Requesting cached segments for video ${videoId}`);
                chrome.runtime.sendMessage({ type: "GET_CACHED_SEGMENTS", videoId: videoId }, (response) => {
                    if (generation !== videoGeneration ||
                        document.querySelector('video') !== video ||
                        new URLSearchParams(window.location.search).get('v') !== videoId) return;
                    if (chrome.runtime.lastError) {
                        console.error("Error getting cached segments:", chrome.runtime.lastError.message);
                        return;
                    }
                    if(response?.cached)showTranscriptCoverage(response.captionProvenance);
                    if (response && response.segments && response.segments.length > 0) {
                        showTranscriptCoverage(response.captionProvenance);
                        console.log(`Received ${response.segments.length} cached segments for video ${videoId}.`);
                        response.segments.forEach(addSponsoredSegment);
                        updateProgressBarHighlights();
                    }
                });
            }

            videoElement = video;
            videoElement.addEventListener('timeupdate', checkForSponsorBlock);
            console.log("Attached listener to new video element.");
        }

    } else if (videoElement) {
        console.log('Video element removed.');
        lastVideoSrc = null;
        lastVideoId = null;
        videoGeneration++;
        sponsoredSegments.length = 0;
        clearPlaybackControls();
        document.getElementById('sponsor-analysis-error')?.remove();
        clearProgressBarHighlights();
        hideAnalysisIndicator();
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
