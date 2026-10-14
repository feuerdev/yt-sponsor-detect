// SPDX-License-Identifier: GPL-3.0-or-later
export const MODES=Object.freeze(['off','manual','automatic']);
export const DEFAULT_SETTINGS=Object.freeze({viewerSchema:2,mode:'automatic',isEnabled:true,autoSkip:true,selfPromotion:false});
export function normalizeSettings(value={}) {
    const mode=value.viewerSchema===2&&MODES.includes(value.mode)?value.mode:
        value.isEnabled===false?'off':value.autoSkip===false?'manual':'automatic';
    return {viewerSchema:2,mode,isEnabled:mode!=='off',autoSkip:mode==='automatic',selfPromotion:value.selfPromotion===true};
}
export async function loadSettings(storage){return normalizeSettings(await storage.get(null));}
export async function initializeSettings(storage) {
    let existing=await storage.get(null);
    if(existing.viewerSchema===2&&MODES.includes(existing.mode))return normalizeSettings(existing);
    existing=await storage.get(null);
    const settings=normalizeSettings(existing);
    if(existing.viewerSchema!==2||!MODES.includes(existing.mode))await storage.set(settings);
    return settings;
}
export const STATUS_TEXT=Object.freeze({
    loading:'Getting captions…',recovering:'Recovering captions from the transcript…',initializing:'Preparing the local model…',analyzing:'Checking captions for possible sponsors…',
    no_captions:'No captions available for this video',unsupported_language:'English captions are required for local analysis',
    fetch_failed:'Could not retrieve captions',invalid_captions:'Caption timing could not be read',insufficient_text:'No usable speech captions',
    model_unavailable:'Local model unavailable',inference_failed:'Local analysis could not finish',invalid_output:'Local analysis returned invalid results',
    disabled:'Sponsor detection is off',ad:'Waiting for YouTube ad to finish',
});
export function statusText(state) {
    if(!state)return 'Open a YouTube video';
    if(state.status==='ready')return state.segments?.length?'Caption check complete · '+(state.mode==='manual'?'Manual skipping':state.paused?'Automatic skips paused':'Automatic skipping'):'Checked available captions: no possible sponsors found';
    return STATUS_TEXT[state.status]||'Could not read this video’s status';
}
