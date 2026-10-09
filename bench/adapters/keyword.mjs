import {mergeSegments} from './common.mjs';
export async function initialize(spec) {
 return {backend:'javascript',async infer(f){return {kind:'keywords',segments:f.cues.filter(c=>spec.preprocessing.phrases.some(p=>c.text.toLowerCase().includes(p))).map(c=>({start:c.start,end:c.end,category:'sponsor',score:1}))};},decode:raw=>mergeSegments(raw.segments),dispose:async()=>{}};
}
