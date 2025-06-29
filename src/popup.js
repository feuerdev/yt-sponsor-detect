document.addEventListener('DOMContentLoaded', () => {
    const enabledCheckbox = document.getElementById('enabled-checkbox');
    const confidenceSlider = document.getElementById('confidence-slider');
    const confidenceValue = document.getElementById('confidence-value');
    const clearButton = document.getElementById('clear-segments-btn');

    // Function to send a message to the active content script to clear segments
    function clearSegmentsInActiveTab() {
        // This message now triggers the full cache clearing process in the background script
        chrome.runtime.sendMessage({ type: "CLEAR_CACHE_FOR_ACTIVE_TAB" }, () => {
            if (chrome.runtime.lastError) {
                // This might happen if the background script has an issue, or on unsupported pages.
                console.log('Could not send CLEAR_CACHE_FOR_ACTIVE_TAB message.', chrome.runtime.lastError.message);
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