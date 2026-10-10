import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../audio-poc/background.js',import.meta.url),'utf8');
const tick=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setImmediate(resolve));};
function fixture(){const f={contexts:[],messages:[],state:{status:'idle'},url:'https://www.youtube.com/watch?v=first',streams:0};
    const chrome={runtime:{id:'fixture',getURL:path=>'chrome-extension://fixture/'+path,getContexts:async()=>f.contexts,
        sendMessage:async message=>{f.messages.push(message);if(message.type==='START')f.state={status:'recording',tabId:message.tabId,videoId:message.videoId};if(message.type==='CANCEL')f.state={status:'idle'};return f.state;},onMessage:{addListener:fn=>{f.handler=fn;}}},
        offscreen:{createDocument:async()=>{f.contexts=[{}];},closeDocument:async()=>{f.contexts=[];f.closed=true;}},
        tabCapture:{getMediaStreamId:async()=>{f.streams++;return f.pendingStream?await f.pendingStream:'synthetic-opaque-id';}},
        tabs:{query:async()=>[{id:1,url:f.url}],get:async()=>({id:1,url:f.url}),onUpdated:{addListener:fn=>{f.updated=fn;}},onRemoved:{addListener:fn=>{f.removed=fn;}}}};
    vm.runInNewContext(source,{chrome,URL});f.popup={id:'fixture',url:'chrome-extension://fixture/popup.html'};
    f.call=(type,sender=f.popup)=>new Promise(resolve=>{if(f.handler({type},sender,resolve)!==true)resolve(undefined);});return f;
}
test('only explicit extension-popup requests can start current YouTube capture',async()=>{
    const f=fixture();assert.equal(await f.call('AUDIO_START',{id:'fixture',url:f.url,tab:{id:1}}),undefined);assert.equal(f.streams,0);
    assert.equal((await f.call('AUDIO_START')).status,'recording');assert.equal(f.streams,1);assert.equal(f.messages.at(-1).videoId,'first');
    assert.equal((await f.call('AUDIO_START')).error,'busy');assert.equal(f.streams,1);
});
test('wrong tabs are rejected before capture and navigation clears offscreen state',async()=>{
    const f=fixture();f.url='https://example.com/watch?v=first';assert.equal((await f.call('AUDIO_START')).error,'open_video');assert.equal(f.streams,0);
    f.url='https://www.youtube.com/watch?v=first';await f.call('AUDIO_START');f.updated(1,{url:'https://www.youtube.com/watch?v=second'});await tick();assert.equal(f.closed,true);assert.equal(f.state.status,'idle');
});
test('cancel during a pending stream ID prevents any delayed recording start',async()=>{
    const f=fixture();let release;f.pendingStream=new Promise(r=>{release=r;});const start=f.call('AUDIO_START');await tick();
    await f.call('AUDIO_CANCEL');release('synthetic-opaque-id');assert.equal((await start).error,'cancelled');assert.equal(f.messages.some(m=>m.type==='START'),false);assert.equal(f.closed,true);
});
test('tab closure clears recording even when state lives only in the offscreen document',async()=>{
    const f=fixture();f.contexts=[{}];f.state={status:'transcribing',tabId:1,videoId:'first'};f.removed(1);await tick();assert.equal(f.closed,true);assert.equal(f.state.status,'idle');
});
