export const CATEGORIES = ['sponsor', 'selfpromo'];
export const STATUSES = ['ok', 'abstained', 'unsupported_backend', 'unsupported_category', 'missing_captions', 'initialization_failure', 'inference_failure', 'invalid_output', 'resource_deferred'];
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
export function interval(value, duration, context = 'interval') {
  requireValue(value && Number.isFinite(value.start) && Number.isFinite(value.end)
    && value.start >= 0 && value.end > value.start && value.end <= duration, `Invalid ${context}`);
}
export function validateFixture(f) {
  requireValue(f && typeof f.videoId === 'string' && f.videoId.length > 0 && typeof f.channelId === 'string' && f.channelId.length > 0, 'Missing video/channel ID');
  requireValue(Number.isFinite(f.durationSeconds) && f.durationSeconds > 0 && f.language === 'en', 'Invalid duration/language');
  requireValue(['partial', 'complete'].includes(f.annotationCompleteness), 'Invalid annotation completeness');
  requireValue(Array.isArray(f.cues) && Array.isArray(f.referenceSegments) && Array.isArray(f.reviewedNegativeIntervals), 'Missing fixture arrays');
  let previous = -1;
  for (const cue of f.cues) {
    interval(cue, f.durationSeconds, 'cue');
    requireValue(cue.start >= previous && typeof cue.text === 'string' && cue.text.trim().length > 0, 'Unsorted/empty cue'); previous = cue.start;
  }
  for (const segment of f.referenceSegments) {
    interval(segment, f.durationSeconds, 'reference');
    requireValue(CATEGORIES.includes(segment.category) && ['provisional', 'reviewed', 'uncertain', 'disputed'].includes(segment.status), 'Invalid reference category/status');
  }
  for (const negative of f.reviewedNegativeIntervals) {
    interval(negative, f.durationSeconds, 'negative');
    requireValue(negative.status === 'reviewed', 'Negative intervals require explicit review');
    requireValue(!f.referenceSegments.some(r => r.end > negative.start && r.start < negative.end), 'Negative/reference conflict');
  }
  if (f.annotationCompleteness === 'complete') {
    requireValue(f.reviewVersion && f.referenceSegments.every(s => s.status === 'reviewed'), 'Complete annotations require a review version and reviewed positives');
    let end=0;for(const s of [...f.referenceSegments,...f.reviewedNegativeIntervals].sort((a,b)=>a.start-b.start)){requireValue(s.start<=end,'Incomplete reviewed coverage');end=Math.max(end,s.end);}
    requireValue(end===f.durationSeconds,'Incomplete reviewed coverage');
  }
  return f;
}
export function validatePrediction(p, fixture) {
  requireValue(p && p.videoId === fixture.videoId && typeof p.runId === 'string' && p.runId.length > 0 && typeof p.model === 'string', 'Invalid prediction identity');
  requireValue(STATUSES.includes(p.status) && ['wasm', 'webgpu', 'javascript', null].includes(p.backend), 'Invalid prediction status/backend');
  requireValue(Array.isArray(p.supportedCategories) && new Set(p.supportedCategories).size === p.supportedCategories.length && p.supportedCategories.every(c => CATEGORIES.includes(c)), 'Invalid supported categories');
  requireValue(Array.isArray(p.segments), 'Missing prediction segments');
  requireValue(p.status === 'ok' || p.segments.length === 0, 'Failure/abstention cannot contain predictions');
  for (const segment of p.segments) {
    interval(segment, fixture.durationSeconds, 'prediction');
    requireValue(p.supportedCategories.includes(segment.category) && (segment.score === undefined || (Number.isFinite(segment.score) && segment.score >= 0 && segment.score <= 1)), 'Invalid prediction category/score');
  }
  return p;
}
export function validateManifest(m) {
  requireValue(m.schemaVersion === 1 && Array.isArray(m.videos), 'Invalid manifest');
  const ids = new Set(), channels = new Map(), campaigns = new Map();
  for (const v of m.videos) {
    requireValue(typeof v.videoId === 'string' && /^[\w-]{11}$/.test(v.videoId) && !ids.has(v.videoId), 'Invalid/duplicate video'); ids.add(v.videoId);
    requireValue(['tune', 'test', 'smoke'].includes(v.split) && typeof v.channelId === 'string' && v.channelId.length > 0, 'Invalid split/channel');
    if (v.split === 'smoke') continue;
    requireValue(!channels.has(v.channelId) || channels.get(v.channelId) === v.split, 'Channel leakage'); channels.set(v.channelId, v.split);
    if (v.campaignGroup) { requireValue(!campaigns.has(v.campaignGroup) || campaigns.get(v.campaignGroup) === v.split, 'Campaign leakage'); campaigns.set(v.campaignGroup, v.split); }
  }
  return m;
}
