import {decodeWindows,mergeSegments} from './adapters/common.mjs';
import {decodeBilou} from './adapters/ettin-text.mjs';
import {decodeSponsorSkip} from './adapters/sponsorskip-decode.mjs';
export function decode(raw,config) {
 if(raw.kind==='nli-windows')return decodeWindows(raw,config.threshold,config.mergeGapSeconds);
 if(raw.kind==='keywords')return mergeSegments(raw.segments);
 if(raw.kind==='ettin-bilou')return decodeBilou(raw,config);
 if(raw.kind==='sponsorskip-words')return decodeSponsorSkip(new Float32Array(raw.probabilities),raw.words,config.threshold,config.thresholdLo,raw.meta);
 throw new Error('Unknown cached inference kind');
}
