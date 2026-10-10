// SPDX-License-Identifier: GPL-3.0-or-later
import {AudioExperiment} from './experiment.js';
let session=null;
const experiment=new AudioExperiment({
    mediaDevices:navigator.mediaDevices,workletURL:chrome.runtime.getURL('worklet.js'),
    createContext:options=>{const context=new AudioContext(options);context.makeCollector=()=>new AudioWorkletNode(context,'local-audio-collector');return context;},
    createWorker:()=>new Worker(chrome.runtime.getURL('worker.js'),{type:'module'}),
});
const state=()=>({...experiment.state,...session});
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(sender.id!==chrome.runtime.id||message?.scope!=='audio-offscreen')return false;
    if(message.type==='STATUS'){respond(state());return false;}
    let operation;
    if(message.type==='START'){
        if(experiment.job){respond({status:'error',error:'busy'});return false;}
        if(!Number.isInteger(message.tabId)||typeof message.videoId!=='string'){respond({status:'error',error:'invalid_session'});return false;}
        session={tabId:message.tabId,videoId:message.videoId};operation=experiment.start(message.streamId);
    }else if(message.type==='CANCEL'){session=null;operation=experiment.cancel();}
    else if(message.type==='FINISH'){void experiment.finish();respond(state());return false;}
    else return false;
    operation.then(()=>respond(state()),()=>respond({status:'error',error:'capture_failed'}));return true;
});
window.addEventListener('pagehide',()=>{void experiment.cancel();});
