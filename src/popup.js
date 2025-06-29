document.addEventListener('DOMContentLoaded', () => {
    const enabledCheckbox = document.getElementById('enabled-checkbox');
    const confidenceSlider = document.getElementById('confidence-slider');
    const confidenceValue = document.getElementById('confidence-value');
    const clearButton = document.getElementById('clear-segments-btn');

    // Function to send a message to the active content script to clear segments
    function clearSegmentsInActiveTab() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0 && tabs[0].id) {
                chrome.tabs.sendMessage(tabs[0].id, { type: "CLEAR_SEGMENTS" }, () => {
                    if (chrome.runtime.lastError) {
                        // This error is expected if the active tab is not a YouTube page.
                        // We can safely ignore it.
                        console.log('Could not send CLEAR_SEGMENTS message. Active tab is not a valid target.');
                    }
                });
            }
        });
    }

    // Load saved settings and update the UI
    chrome.storage.sync.get({ isEnabled: true, confidenceThreshold: 0.85 }, (data) => {
        enabledCheckbox.checked = data.isEnabled;
        confidenceSlider.value = data.confidenceThreshold;
        confidenceValue.textContent = data.confidenceThreshold;
    });

    // Save the 'enabled' setting when the checkbox is changed
    enabledCheckbox.addEventListener('change', () => {
        chrome.storage.sync.set({ isEnabled: enabledCheckbox.checked });
    });

    // Update the display and save the 'confidenceThreshold' when the slider is moved
    confidenceSlider.addEventListener('input', () => {
        confidenceValue.textContent = confidenceSlider.value;
    });
    confidenceSlider.addEventListener('change', () => {
        chrome.storage.sync.set({ confidenceThreshold: parseFloat(confidenceSlider.value) });
        clearSegmentsInActiveTab();
    });
    
    // Add listener for the clear button
    clearButton.addEventListener('click', () => {
        clearSegmentsInActiveTab();
    });
}); 