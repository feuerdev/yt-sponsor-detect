// SPDX-License-Identifier: GPL-3.0-or-later
// Viewer preferences are deliberately independent of detection/cache policy.
export const DEFAULT_SETTINGS = Object.freeze({viewerSchema: 1, isEnabled: true, autoSkip: true, selfPromotion: false});
export function normalizeSettings(value = {}) {
    return {viewerSchema: 1, isEnabled: value.isEnabled !== false,
        autoSkip: value.viewerSchema === 1 ? value.autoSkip !== false : true,
        selfPromotion: value.viewerSchema === 1 && value.selfPromotion === true};
}
export async function loadSettings(storage) {
    return normalizeSettings(await storage.get(null));
}
export async function initializeSettings(storage) {
    const existing = await storage.get(null);
    if (existing.viewerSchema === 1) return normalizeSettings(existing);
    const latest = await storage.get(null);
    if (latest.viewerSchema === 1) return normalizeSettings(latest);
    // Never rewrite an existing enable choice during worker startup.
    await storage.set({viewerSchema: 1, autoSkip: true, selfPromotion: false});
    return normalizeSettings({...latest, viewerSchema: 1, autoSkip: true, selfPromotion: false});
}
export const STATUS_TEXT = Object.freeze({
    loading: 'Getting captions…', analyzing: 'Checking for sponsors…', ready: 'Sponsor skipping ready',
    no_captions: 'No captions available for this video', unsupported_language: 'English captions required',
    fetch_failed: 'Could not retrieve captions', invalid_captions: 'Caption timing could not be read',
    insufficient_text: 'No usable speech captions', model_unavailable: 'Local model unavailable',
    inference_failed: 'Local analysis could not finish', invalid_output: 'Local analysis returned invalid results',
    disabled: 'Sponsor skipping is off', paused: 'Paused for this video', ad: 'Waiting for YouTube ad to finish',
});
export function statusText(state) {
    if (state?.status === 'ready' && !state.segments?.length) return 'Checked captions: no sponsors detected';
    return STATUS_TEXT[state?.status] || 'Open a YouTube video';
}
