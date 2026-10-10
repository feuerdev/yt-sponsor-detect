// SPDX-License-Identifier: GPL-3.0-or-later
const $=id=>document.getElementById(id);
const errors={cancelled:'Recording cancelled.',busy:'An experiment is already running.',open_video:'Open a YouTube video first.',video_changed:'The video changed. Start again.',capture_failed:'Could not capture audio. Reopen this popup and try again.',capture_ended:'Audio capture ended.',insufficient_audio:'Too little audio was captured.',transcription_failed:'Local transcription failed. Check the installed model assets.',transcription_timeout:'Local transcription exceeded two minutes.',invalid_audio:'Captured audio was invalid.'};
function render(state={status:'idle'}){
    const active=['starting','recording','transcribing'].includes(state.status);
    $('start').disabled=active;$('finish').hidden=state.status!=='recording';$('cancel').hidden=state.status==='idle';
    const label=({idle:'Ready for an explicit recording.',starting:'Starting capture…',recording:'Recording locally…',transcribing:'Capture stopped. Transcribing locally…',ready:'Local transcript ready.',error:errors[state.error]||'Experiment unavailable.'})[state.status]||'Experiment unavailable.';
    if($('status').textContent!==label)$('status').textContent=label;
    $('transcript').textContent=state.text||'';
    $('details').textContent=state.status==='ready'?JSON.stringify({audioSeconds:state.seconds,captureMs:state.captureMs,modelLoadAndInferenceMs:state.inferenceMs,inputSampleRate:state.sampleRate,timeline:state.timeline,timestampAdjustment:state.timestampAdjustment,chunks:state.chunks},null,2):'';
}
async function send(type){try{const state=await chrome.runtime.sendMessage({type});render(state);}catch{render({status:'error'});}}
$('start').addEventListener('click',()=>{render({status:'starting'});void send('AUDIO_START');});
$('finish').addEventListener('click',()=>{void send('AUDIO_FINISH');});
$('cancel').addEventListener('click',()=>{void send('AUDIO_CANCEL');});
const timer=setInterval(()=>send('AUDIO_STATUS'),1000);window.addEventListener('pagehide',()=>clearInterval(timer));void send('AUDIO_STATUS');
