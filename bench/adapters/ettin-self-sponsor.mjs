// SPDX-License-Identifier: GPL-3.0-or-later
// Development-only policy; never chooses which text is sent to the model.
const interval=s=>s&&Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.start>=0&&s.end>s.start;
const affirmative=/(?:^|[.!?]\s+)(?:and\s+)?(?:we(?:'re| are)|i(?:'m| am))\s+self[- ]sponsored\b/iu;
const external=/\b(?:sponsored|brought to you|paid for)\s+by\b|\b(?:our|the)\s+sponsor\s+(?:is|for)\b/iu;
export function filterExplicitSelfSponsorship(segments,cues) {
 if(!Array.isArray(segments)||segments.some(s=>!interval(s)))throw Error('Invalid prediction interval');
 if(!Array.isArray(cues)||cues.some(c=>!interval(c)||typeof c.text!=='string'))throw Error('Invalid caption cue');
 const kept=[],rejected=[];
 for(const segment of segments) {
  const text=cues.filter(c=>c.start>=segment.start&&c.end<=segment.end).map(c=>c.text).join(' ')
   .replace(/"[^"]*"|“[^”]*”/gu,' ').replace(/’/gu,"'").replace(/\s+/gu,' ').trim();
  if(affirmative.test(text)&&!external.test(text))rejected.push({segment:{...segment},reason:'explicit_self_sponsorship'});
  else kept.push({...segment});
 }
 return {segments:kept,rejected};
}
