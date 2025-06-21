chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'parse-xml') {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(request.payload, 'text/xml');
        const textNodes = xmlDoc.getElementsByTagName('text');
        const captions = Array.from(textNodes).map(node => ({
            start: node.getAttribute('start'),
            duration: node.getAttribute('dur'),
            text: node.textContent.replace(/<\/?.*?>/g, '').replace(/\n/g, ' ').trim()
        }));
        sendResponse(captions);
    }
    return true; // Keep the message channel open for async response
}); 