import {sponsorLabels,DEFAULT_THRESHOLD} from './sponsor-policy.js';
document.addEventListener('DOMContentLoaded',()=>{
    const enabled=document.getElementById('enabled-checkbox'),threshold=document.getElementById('sponsor-threshold'),value=document.getElementById('threshold-value'),suggestions=document.getElementById('sponsor-checkbox');
    let settings;
    const clear=()=>chrome.runtime.sendMessage({type:'CLEAR_CACHE_FOR_ACTIVE_TAB'}).catch(()=>{});
    const save=()=>chrome.storage.sync.set(settings);
    chrome.storage.sync.get({isEnabled:true,autoSkip:false,labels:null},data=>{
        settings={isEnabled:data.isEnabled,autoSkip:false,labels:sponsorLabels(data.labels)||[{name:'sponsor',threshold:DEFAULT_THRESHOLD,blocked:true}]};
        enabled.checked=settings.isEnabled;suggestions.checked=settings.labels[0].blocked;threshold.value=settings.labels[0].threshold;value.textContent=threshold.value;
        save();
        enabled.addEventListener('change',()=>{settings.isEnabled=enabled.checked;save();});
        suggestions.addEventListener('change',()=>{settings.labels[0].blocked=suggestions.checked;save();clear();});
        threshold.addEventListener('input',()=>{value.textContent=threshold.value;});
        threshold.addEventListener('change',()=>{settings.labels[0].threshold=Number(threshold.value);save();clear();});
        document.getElementById('clear-segments-btn').addEventListener('click',clear);
    });
});
