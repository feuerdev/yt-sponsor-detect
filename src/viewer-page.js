// SPDX-License-Identifier: GPL-3.0-or-later
import {fetchTranscript, validVideoId} from './viewer/transcript.js';
import {REQUEST, RESPONSE, CANCEL} from './viewer/bridge.js';
const pending = new Map();
window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin || typeof event.data?.nonce !== 'string'
        || event.data.nonce.length > 100) return;
    const {type,videoId,nonce} = event.data;
    if (type === CANCEL) { pending.get(nonce)?.abort(); return; }
    if (type !== REQUEST || !validVideoId(videoId) || pending.has(nonce) || pending.size >= 2) return;
    const controller = new AbortController(); pending.set(nonce,controller);
    const timer = setTimeout(() => controller.abort(),17000);
    fetchTranscript(videoId,{playerData:window.ytInitialPlayerResponse, signal:controller.signal})
        .then(payload => { if (!controller.signal.aborted) window.postMessage({type:RESPONSE,nonce,payload},location.origin); })
        .finally(() => { clearTimeout(timer); pending.delete(nonce); });
});
