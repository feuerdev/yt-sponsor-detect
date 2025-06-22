document.addEventListener('DOMContentLoaded', () => {
    const enabledCheckbox = document.getElementById('enabled-checkbox');
    const confidenceSlider = document.getElementById('confidence-slider');
    const confidenceValue = document.getElementById('confidence-value');

    // Load saved settings and update the UI
    chrome.storage.sync.get({ isEnabled: true, confidenceThreshold: 0.80 }, (data) => {
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
    });
}); 