document.addEventListener('DOMContentLoaded', () => {
    const enabledCheckbox = document.getElementById('enabled-checkbox');
  
    // Load the saved setting and update the checkbox
    chrome.storage.sync.get({ isEnabled: true }, (data) => {
      enabledCheckbox.checked = data.isEnabled;
    });
  
    // Save the setting when the checkbox is changed
    enabledCheckbox.addEventListener('change', () => {
      chrome.storage.sync.set({ isEnabled: enabledCheckbox.checked });
    });
  }); 