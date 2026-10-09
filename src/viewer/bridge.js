// SPDX-License-Identifier: GPL-3.0-or-later
import {validateTranscript, validVideoId} from './transcript.js';
export const REQUEST = 'yt-sponsor:transcript-request:v1';
export const RESPONSE = 'yt-sponsor:transcript-response:v1';
export const CANCEL = 'yt-sponsor:transcript-cancel:v1';
const ERRORS = new Set(['no_captions','unsupported_language','fetch_failed','invalid_captions','insufficient_text']);
export function requestTranscript(win, videoId, {signal, timeout = 18000, nonce = globalThis.crypto.randomUUID()} = {}) {
    if (!validVideoId(videoId) || signal?.aborted) return Promise.resolve({error:'fetch_failed'});
    return new Promise(resolve => {
        let timer;
        const done = value => { clearTimeout(timer); win.removeEventListener('message', receive); signal?.removeEventListener('abort', cancel); resolve(value); };
        const cancel = () => { win.postMessage({type:CANCEL, nonce},win.location.origin); done({error:'fetch_failed'}); };
        const receive = event => {
            if (event.source !== win || event.origin !== win.location.origin || event.data?.type !== RESPONSE
                || event.data.nonce !== nonce) return;
            const payload = event.data.payload;
            if (payload?.error && ERRORS.has(payload.error)) done({error:payload.error});
            else done(validateTranscript(payload,videoId) ? payload : {error:'invalid_captions'});
        };
        win.addEventListener('message',receive);
        signal?.addEventListener('abort',cancel,{once:true});
        timer = setTimeout(cancel,timeout);
        win.postMessage({type:REQUEST, videoId, nonce},win.location.origin);
    });
}
