import {sponsorLabels,DEFAULT_THRESHOLD} from './sponsor-policy.js';
document.addEventListener('DOMContentLoaded',()=>{
    const enabled=document.getElementById('enabled-checkbox'),threshold=document.getElementById('sponsor-threshold'),value=document.getElementById('threshold-value'),suggestions=document.getElementById('sponsor-checkbox');
    const analyze=document.getElementById('analyze-transcript-btn'),status=document.getElementById('transcript-status');
    let settings,busy=false;
    const updateAnalyze=()=>{analyze.disabled=busy || !settings?.isEnabled || !settings?.labels?.[0]?.blocked;};
    analyze.addEventListener('click',async()=>{
        if(analyze.disabled || busy)return;
        busy=true;updateAnalyze();status.textContent='Analyzing the open transcript…';
        try {
            const reply=await chrome.runtime.sendMessage({type:'ANALYZE_OPEN_TRANSCRIPT'});
            if(reply?.ok)status.textContent=reply.segments
                ? `${reply.segments} sponsor suggestion${reply.segments===1?'':'s'} found. Timing from the transcript panel is approximate. Review each suggestion before skipping.`
                : 'No sponsor suggestions found. This does not prove the video is sponsor-free.';
            else status.textContent=({
                captions_unavailable:'Open the complete YouTube transcript, clear its search field, then try again.',
                unsupported_language:'The open transcript could not be reliably verified as English.',
                not_youtube_video:'Select a YouTube video with its transcript open, then try again.',
                disabled:'Enable sponsor suggestions first.',
                cancelled:'The video or settings changed. Try again on the current video.',
                analysis_in_progress:'This video is already being analyzed. Check the video for progress.',
            })[reply?.code] || 'Sponsor analysis unavailable. Try again; playback is unchanged.';
        }catch{status.textContent='Sponsor analysis unavailable. Try again; playback is unchanged.';}
        finally{busy=false;updateAnalyze();}
    });
    const clear=()=>chrome.runtime.sendMessage({type:'CLEAR_CACHE_FOR_ACTIVE_TAB'}).catch(()=>{});
    const save=()=>chrome.storage.sync.set(settings);
    chrome.storage.sync.get({isEnabled:true,autoSkip:false,labels:null},data=>{
        settings={isEnabled:data.isEnabled,autoSkip:false,labels:sponsorLabels(data.labels)||[{name:'sponsor',threshold:DEFAULT_THRESHOLD,blocked:true}]};
        enabled.checked=settings.isEnabled;suggestions.checked=settings.labels[0].blocked;threshold.value=settings.labels[0].threshold;value.textContent=threshold.value;
        save();updateAnalyze();
        enabled.addEventListener('change',()=>{settings.isEnabled=enabled.checked;save();updateAnalyze();});
        suggestions.addEventListener('change',()=>{settings.labels[0].blocked=suggestions.checked;save();updateAnalyze();});
        threshold.addEventListener('input',()=>{value.textContent=threshold.value;});
        threshold.addEventListener('change',()=>{settings.labels[0].threshold=Number(threshold.value);save();});
        document.getElementById('clear-segments-btn').addEventListener('click',clear);
    });
});
