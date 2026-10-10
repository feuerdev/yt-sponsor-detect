// SPDX-License-Identifier: GPL-3.0-or-later
import {Resampler} from './resampler.js';
class Collector extends AudioWorkletProcessor {
    constructor(){super();this.resampler=new Resampler(sampleRate,pcm=>this.port.postMessage(pcm,[pcm.buffer]));}
    process(inputs,outputs){this.resampler.push(inputs[0]||[]);for(const output of outputs)for(const channel of output)channel.fill(0);return true;}
}
registerProcessor('local-audio-collector',Collector);
