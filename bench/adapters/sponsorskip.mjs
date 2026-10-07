import {cueWords} from './common.mjs';
export async function initialize(spec,backend) {
 if(backend!=='webgpu'||!navigator.gpu||!(await navigator.gpu.requestAdapter()))throw Object.assign(new Error('No usable WebGPU adapter; no CPU substitution'),{status:'unsupported_backend'});
 const {Detector}=await import('../browser/vendor/sponsorskip.mjs');const detector=new Detector();await detector.init({variant:'base'});
 return {backend:detector.backend,async infer(f){const words=cueWords(f);const probabilities=await detector.wordProbs(words);return {kind:'sponsorskip-words',words,probabilities:Array.from(probabilities),meta:detector.meta};},
  decode:(raw,config)=>detector.decode(new Float32Array(raw.probabilities),raw.words,config.threshold,Math.min(config.thresholdLo,config.threshold)),dispose:()=>detector.session.release()};
}
