// SPDX-License-Identifier: GPL-3.0-or-later
// Adapted design: edde746/SponsorSkip src/page/transcript.ts at 01e53cbe.
// See docs/viewer-attribution.md. Retrieval uses YouTube only; no transcript upload.
export const MAX_WORDS = 100000;
const MAX_BODY = 8 * 1024 * 1024;
export function validVideoId(id) { return typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id); }
export function validateTranscript(value, videoId) {
    if (!value || value.videoId !== videoId || !Number.isFinite(value.duration) || value.duration <= 0
        || value.duration > 86400 || !Array.isArray(value.words) || !value.words.length || value.words.length > MAX_WORDS) return false;
    if(value.coverage!==undefined&&(!['full','partial'].includes(value.coverage)||!Number.isFinite(value.coverageStart)||!Number.isFinite(value.coverageEnd)||value.coverageStart<0||value.coverageEnd<=value.coverageStart||value.coverageEnd>value.duration))return false;
    let previous = -1;
    for (const word of value.words) {
        if (!word || typeof word.text !== 'string' || !word.text.trim() || word.text.length > 500
            || !Number.isFinite(word.start) || !Number.isFinite(word.end) || word.start < previous
            || word.start < 0 || word.end <= word.start || word.end > value.duration + 1) return false;
        if(value.coverage==='partial'&&(word.start<value.coverageStart-0.001||word.end>value.coverageEnd+0.001))return false;
        previous = word.start;
    }
    return value.timing === 'word' || value.timing === 'estimated';
}
export function parseJson3(events, duration) {
    if (!Array.isArray(events) || !Number.isFinite(duration) || duration <= 0) throw new Error('invalid_captions');
    const speech = events.filter(event => Array.isArray(event?.segs) && event.segs.some(seg => typeof seg?.utf8 === 'string' && seg.utf8.trim()));
    const words = []; let estimated = false;
    for (let i = 0; i < speech.length; i++) {
        const event = speech[i];
        if (!Number.isFinite(event.tStartMs) || event.tStartMs < 0) throw new Error('invalid_captions');
        const start = event.tStartMs / 1000;
        const end = Number.isFinite(event.dDurationMs) && event.dDurationMs > 0
            ? Math.min(duration, start + event.dDurationMs / 1000)
            : speech[i + 1]?.tStartMs / 1000;
        if (!Number.isFinite(end) || end <= start || end > duration + 1) throw new Error('invalid_captions');
        const pieces = event.segs.filter(seg => typeof seg?.utf8 === 'string' && seg.utf8.trim());
        for (let j = 0; j < pieces.length; j++) {
            const piece = pieces[j];
            if (piece.tOffsetMs !== undefined && (!Number.isFinite(piece.tOffsetMs) || piece.tOffsetMs < 0)) throw new Error('invalid_captions');
            const at = start + (piece.tOffsetMs || 0) / 1000;
            const next = pieces[j + 1]?.tOffsetMs;
            const until = next !== undefined ? start + next / 1000 : end;
            const tokens = piece.utf8.trim().split(/\s+/);
            if (!Number.isFinite(until) || until <= at || at < start || until > end + 0.1) throw new Error('invalid_captions');
            if (tokens.length > 1 || piece.tOffsetMs === undefined) estimated = true;
            for (let k = 0; k < tokens.length; k++) {
                words.push({text: tokens[k], start: at + (until - at) * k / tokens.length,
                    end: Math.min(duration, at + (until - at) * (k + 1) / tokens.length)});
                if (words.length > MAX_WORDS) throw new Error('invalid_captions');
            }
        }
    }
    words.sort((a,b) => a.start - b.start);
    // Rolling caption events can repeat words at exactly the same timestamp.
    const unique = words.filter((word, index) => !index || word.start !== words[index-1].start || word.text !== words[index-1].text);
    return {words: unique, timing: estimated ? 'estimated' : 'word'};
}
export function captionTracks(player) {
    return player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
}
function allowedTrack(track) {
    try { const url = new URL(track.baseUrl); return url.protocol === 'https:' && url.hostname === 'www.youtube.com' && url.pathname === '/api/timedtext'; }
    catch { return false; }
}
async function readJson(response) {
    if (!response.ok) throw new Error('fetch_failed');
    const text = await response.text();
    if (!text.length || text.length > MAX_BODY) throw new Error('fetch_failed');
    return JSON.parse(text);
}
const IOS_CONTEXT = {client: {clientName:'IOS', clientVersion:'20.10.4', deviceMake:'Apple', deviceModel:'iPhone16,2', osName:'iPhone', osVersion:'18.3.2.22D82', hl:'en', gl:'US'}};
export async function fetchTranscript(videoId, {fetchFn = globalThis.fetch, playerData, signal} = {}) {
    if (!validVideoId(videoId)) return {error:'fetch_failed'};
    const players = [];
    if (playerData?.videoDetails?.videoId === videoId) players.push(playerData);
    let failed = false, hadEnglish = false, hadTracks = false, invalid = false, empty = false;
    const tried = new Set();
    async function tryPlayer(player) {
        if (player?.videoDetails?.videoId && player.videoDetails.videoId !== videoId) { failed = true; return null; }
        if (player?.playabilityStatus?.status && player.playabilityStatus.status !== 'OK') { failed = true; return null; }
        const duration = Number(player?.videoDetails?.lengthSeconds);
        const tracks = captionTracks(player);
        if (!Array.isArray(tracks)) { failed = true; return null; }
        hadTracks ||= tracks.length > 0;
        const english = tracks.filter(track => /^en(?:-|$)/i.test(track?.languageCode || ''))
            .sort((a,b) => Number(a.kind !== 'asr') - Number(b.kind !== 'asr'));
        hadEnglish ||= english.length > 0;
        for (const track of english) {
            if (signal?.aborted) return null;
            if (!allowedTrack(track) || tried.has(track.baseUrl)) continue;
            tried.add(track.baseUrl);
            try {
                const url = new URL(track.baseUrl); url.searchParams.set('fmt','json3');
                const raw = await readJson(await fetchFn(url.href, {signal, credentials:'same-origin'}));
                const parsed = parseJson3(raw.events, duration);
                if (!parsed.words.length) { empty = true; continue; }
                const result = {...parsed, videoId, duration, track: track.kind === 'asr' ? 'automatic' : 'creator', language:'en'};
                if (!validateTranscript(result,videoId)) { invalid = true; continue; }
                return result;
            } catch (error) { if (error.message === 'invalid_captions') invalid = true; else failed = true; }
        }
        return null;
    }
    for (const player of players) { const result = await tryPlayer(player); if (result) return result; }
    if (!signal?.aborted) {
        try {
            const player = await readJson(await fetchFn('https://www.youtube.com/youtubei/v1/player', {
                method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', signal,
                body:JSON.stringify({videoId, context:IOS_CONTEXT}),
            }));
            const result = await tryPlayer(player); if (result) return result;
        } catch { failed = true; }
    }
    return {error: invalid ? 'invalid_captions' : hadEnglish ? (failed ? 'fetch_failed' : empty ? 'insufficient_text' : 'fetch_failed')
        : failed ? 'fetch_failed' : hadTracks ? 'unsupported_language' : 'no_captions'};
}
