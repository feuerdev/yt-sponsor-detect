// SPDX-License-Identifier: GPL-3.0-or-later
// Presentation only. Hashes continue to identify the private original caches;
// redacted exports cannot replace those caches for decoding or verification.
export function redactCaptionText(value) {
 const copy=structuredClone(value);
 function visit(node) {
  if(!node||typeof node!=='object')return;
  if(Array.isArray(node.cues))for(const cue of node.cues)delete cue.text;
  if(node.kind==='sponsorskip-words'&&Array.isArray(node.words))for(const word of node.words)word[0]=null;
  for(const child of Object.values(node))visit(child);
 }
 visit(copy);return copy;
}
