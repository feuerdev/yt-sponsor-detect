document.addEventListener('DOMContentLoaded', () => {
    const enabledCheckbox = document.getElementById('enabled-checkbox');
    const clearButton = document.getElementById('clear-segments-btn');
    const labelsList = document.getElementById('labels-list');
    const addLabelButton = document.getElementById('add-label-btn');

    let settings = {};

    const defaultLabels = [
        { id: `label-${Date.now()}`, name: 'Sponsored Content', threshold: 0.85 },
        { id: `label-${Date.now()+1}`, name: 'Advertisement', threshold: 0.85 },
        { id: `label-${Date.now()+2}`, name: 'This is a paid promotion, endorsement, or sponsorship.', threshold: 0.85 }
    ];

    function saveSettings() {
        chrome.storage.sync.set(settings);
    }

    function renderLabels() {
        labelsList.innerHTML = '';
        if (!settings.labels) return;

        settings.labels.forEach(label => {
            const labelId = `label-item-${label.id}`;
            const nameId = `name-${label.id}`;
            const sliderId = `slider-${label.id}`;
            const valueId = `value-${label.id}`;
            const removeId = `remove-${label.id}`;

            const item = document.createElement('div');
            item.classList.add('label-item');
            item.id = labelId;
            item.innerHTML = `
                <input type="text" id="${nameId}" value="${label.name}" placeholder="Category Name">
                <input type="range" id="${sliderId}" min="0" max="1" step="0.01" value="${label.threshold}">
                <span id="${valueId}">${label.threshold}</span>
                <button id="${removeId}">X</button>
            `;
            labelsList.appendChild(item);

            const nameInput = document.getElementById(nameId);
            const sliderInput = document.getElementById(sliderId);
            const valueSpan = document.getElementById(valueId);
            const removeButton = document.getElementById(removeId);

            nameInput.addEventListener('change', (e) => {
                label.name = e.target.value;
                saveSettings();
            });

            sliderInput.addEventListener('input', (e) => {
                valueSpan.textContent = e.target.value;
            });

            sliderInput.addEventListener('change', (e) => {
                label.threshold = parseFloat(e.target.value);
                saveSettings();
                // Trigger re-analysis on change
                clearSegmentsInActiveTab();
            });

            removeButton.addEventListener('click', () => {
                settings.labels = settings.labels.filter(l => l.id !== label.id);
                saveSettings();
                renderLabels();
                // Trigger re-analysis on change
                clearSegmentsInActiveTab();
            });
        });
    }
    
    addLabelButton.addEventListener('click', () => {
        const newLabel = {
            id: `label-${Date.now()}`,
            name: 'New Category',
            threshold: 0.9
        };
        if (!settings.labels) {
            settings.labels = [];
        }
        settings.labels.push(newLabel);
        saveSettings();
        renderLabels();
    });

    function clearSegmentsInActiveTab() {
        chrome.runtime.sendMessage({ type: "CLEAR_CACHE_FOR_ACTIVE_TAB" }, () => {
            if (chrome.runtime.lastError) {
                console.log('Could not send message.', chrome.runtime.lastError.message);
            }
        });
    }

    // Load saved settings and update the UI
    chrome.storage.sync.get({ isEnabled: true, labels: null }, (data) => {
        settings.isEnabled = data.isEnabled;
        settings.labels = data.labels === null ? defaultLabels : data.labels;
        enabledCheckbox.checked = settings.isEnabled;
        renderLabels();
        saveSettings(); // Save defaults if they were just loaded
    });

    enabledCheckbox.addEventListener('change', () => {
        settings.isEnabled = enabledCheckbox.checked;
        saveSettings();
    });
    
    clearButton.addEventListener('click', () => {
        clearSegmentsInActiveTab();
    });
}); 