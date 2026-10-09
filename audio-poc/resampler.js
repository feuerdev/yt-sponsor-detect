// SPDX-License-Identifier: GPL-3.0-or-later
// Bounded streaming box-filter downsampling; no video-timeline claim.
export class Resampler {
    constructor(inputRate,emit) {
        if(!Number.isFinite(inputRate)||inputRate<16000||inputRate>192000)throw new Error('unsupported_rate');
        this.ratio=inputRate/16000;this.emit=emit;this.sum=0;this.weight=0;this.chunk=new Float32Array(4096);this.offset=0;
    }
    push(channels) {
        if(!channels.length)return;
        for(let i=0;i<channels[0].length;i++){
            const value=channels.reduce((sum,channel)=>sum+(channel[i]||0),0)/channels.length;let left=1;
            while(left>1e-9){const part=Math.min(left,this.ratio-this.weight);this.sum+=value*part;this.weight+=part;left-=part;
                if(this.weight>=this.ratio-1e-9){this.chunk[this.offset++]=this.sum/this.ratio;this.sum=0;this.weight=0;
                    if(this.offset===this.chunk.length){this.emit(this.chunk);this.chunk=new Float32Array(4096);this.offset=0;}
                }
            }
        }
    }
}
