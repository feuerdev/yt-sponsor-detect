document.addEventListener('DOMContentLoaded', () => {
    const enabledCheckbox = document.getElementById('enabled-checkbox');
    const clearButton = document.getElementById('clear-segments-btn');
    const labelsList = document.getElementById('labels-list');
    const addLabelButton = document.getElementById('add-label-btn');

    let settings = {};

    const defaultLabels = [
        { id: `label-${Date.now()}`, name: 'contains sponsored content', threshold: 0.98, blocked: true },
        { id: `label-${Date.now()+1}`, name: 'contains regular content', threshold: 0.85, blocked: false }
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
            const blockedId = `blocked-${label.id}`;

            const item = document.createElement('div');
            item.classList.add('label-item');
            item.id = labelId;
            item.innerHTML = `
                <input type="text" id="${nameId}" value="${label.name}" placeholder="Category Name">
                <input type="range" id="${sliderId}" min="0" max="1" step="0.01" value="${label.threshold}">
                <span id="${valueId}">${label.threshold}</span>
                <input type="checkbox" id="${blockedId}" ${label.blocked ? 'checked' : ''} title="If checked, segments with this category will be skipped">
                <button id="${removeId}">X</button>
            `;
            labelsList.appendChild(item);

            const nameInput = document.getElementById(nameId);
            const sliderInput = document.getElementById(sliderId);
            const valueSpan = document.getElementById(valueId);
            const removeButton = document.getElementById(removeId);
            const blockedCheckbox = document.getElementById(blockedId);

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

            blockedCheckbox.addEventListener('change', (e) => {
                label.blocked = e.target.checked;
                saveSettings();
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
            threshold: 0.9,
            blocked: true
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
        if (data.labels === null) {
            settings.labels = defaultLabels;
        } else {
            // For backwards compatibility, add 'blocked' property if it's missing.
            settings.labels = data.labels.map(l => ({ ...l, blocked: l.blocked !== undefined ? l.blocked : true }));
        }
        enabledCheckbox.checked = settings.isEnabled;
        renderLabels();
        saveSettings(); // Save defaults or migrated labels
    });

    enabledCheckbox.addEventListener('change', () => {
        settings.isEnabled = enabledCheckbox.checked;
        saveSettings();
    });
    
    clearButton.addEventListener('click', () => {
        clearSegmentsInActiveTab();
    });
}); 