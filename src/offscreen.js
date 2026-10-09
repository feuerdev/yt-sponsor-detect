let worker=null,idleTimer=null;
const pending=new Map();
function stopWorker(){clearTimeout(idleTimer);worker?.terminate();worker=null;for(const item of pending.values()){clearTimeout(item.timer);item.reply({ok:false,code:'inference_failed'});}pending.clear();}
function idle(){if(!pending.size)idleTimer=setTimeout(stopWorker,60000);}
function ensureWorker(){
    if(worker)return;
    worker=new Worker(chrome.runtime.getURL('inference-worker.js'),{type:'module'});
    worker.onerror=stopWorker;
    worker.onmessage=({data})=>{
        const item=pending.get(data.id);if(!item)return;
        if(data.progress){chrome.runtime.sendMessage({target:'ettin-background',id:data.id,...data.progress}).catch(()=>{});return;}
        clearTimeout(item.timer);pending.delete(data.id);item.reply(data);idle();
    };
}
chrome.runtime.onMessage.addListener((request,sender,sendResponse)=>{
    if(request?.target!=='ettin-offscreen'||sender.id!==chrome.runtime.id||sender.tab)return;
    if(typeof request.id!=='string'||pending.has(request.id)){sendResponse({ok:false,code:'invalid_output'});return false;}
    clearTimeout(idleTimer);
    try{ensureWorker();pending.set(request.id,{reply:sendResponse,timer:setTimeout(stopWorker,180000)});worker.postMessage(request);}
    catch{const queued=pending.has(request.id);stopWorker();if(!queued)sendResponse({ok:false,code:'model_unavailable'});return false;}
    return true;
});
