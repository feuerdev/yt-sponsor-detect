// SPDX-License-Identifier: GPL-3.0-or-later
import {panelCaptions} from '../transcript-panel.js';
import {validateTranscript} from './transcript.js';
export function panelToTranscript(snapshot,videoId,language) {
    const {captions,provenance}=panelCaptions(snapshot,videoId,language,{allowPartial:true});
    const words=[];
    for(const cue of captions){const tokens=cue.text.trim().split(/\s+/);
        for(let i=0;i<tokens.length;i++)words.push({text:tokens[i],start:cue.start+cue.duration*i/tokens.length,end:cue.start+cue.duration*(i+1)/tokens.length});}
    const transcript={videoId,duration:snapshot.durationSeconds,words,timing:'estimated',track:'public-panel',language:'en',...provenance};
    if(!validateTranscript(transcript,videoId))throw Error('invalid_captions');return transcript;
}
