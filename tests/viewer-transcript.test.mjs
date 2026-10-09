import assert from 'node:assert/strict';
import test from 'node:test';
import {fetchTranscript, parseJson3, validateTranscript} from '../src/viewer/transcript.js';
import {normalizeSettings, initializeSettings} from '../src/viewer/settings.js';
import {requestTranscript, REQUEST, RESPONSE} from '../src/viewer/bridge.js';
const track = (kind='asr', languageCode='en', name='asr') => ({kind,languageCode,baseUrl:'https://www.youtube.com/api/timedtext?v=first&name='+name});
const player = tracks => ({videoDetails:{videoId:'first',lengthSeconds:'20'},playabilityStatus:{status:'OK'},captions:{playerCaptionsTracklistRenderer:{captionTracks:tracks}}});
const json = value => ({ok:true,text:async()=>JSON.stringify(value)});
const speech = {events:[{tStartMs:1000,dDurationMs:3000,segs:[{utf8:'sponsored',tOffsetMs:0},{utf8:'by',tOffsetMs:1000},{utf8:'example',tOffsetMs:2000}]},{tStartMs:2000,segs:[{utf8:'\n'}]}]};
test('proactive acquisition needs neither visible captions nor a player caption request', async()=>{
    const calls=[];
    const result=await fetchTranscript('first',{fetchFn:async(url)=>{calls.push(url);return json(url.includes('/player')?player([track()]):speech);}});
    assert.equal(result.words.length,3);assert.equal(result.timing,'word');assert.equal(result.words[1].start,2);
    assert.ok(calls[0].includes('/youtubei/v1/player'));assert.ok(calls[1].includes('fmt=json3'));
});
test('failed ASR track falls back to creator captions and retains estimated timing',async()=>{
    const calls=[];
    const result=await fetchTranscript('first',{playerData:player([track('manual','en','manual'),track()]),fetchFn:async(url)=>{
        calls.push(url);if(url.includes('name=asr'))return {ok:false};
        return json({events:[{tStartMs:1000,dDurationMs:3000,segs:[{utf8:'sponsored by example'}]}]});
    }});
    assert.equal(result.track,'creator');assert.equal(result.timing,'estimated');assert.equal(result.words[2].end,4);
    assert.equal(calls.length,2);assert.ok(calls[0].includes('name=asr'));
});
test('unusable page snapshot falls back to refreshed player metadata',async()=>{
    const result=await fetchTranscript('first',{playerData:player([]),fetchFn:async(url)=>json(url.includes('/player')?player([track()]):speech)});
    assert.equal(result.words.length,3);
});
test('absence, unsupported language and network failure are distinct',async()=>{
    for(const [tracks,error] of [[[],'no_captions'],[[track('asr','de')],'unsupported_language']]) {
        assert.equal((await fetchTranscript('first',{fetchFn:async()=>json(player(tracks))})).error,error);
    }
    assert.equal((await fetchTranscript('first',{fetchFn:async()=>({ok:false})})).error,'fetch_failed');
    assert.equal((await fetchTranscript('first',{fetchFn:async(url)=>url.includes('/player')?json(player([track()])):json({events:[]})})).error,'insufficient_text');
});
test('malformed times and unsafe URLs cannot become analyzed captions',async()=>{
    assert.throws(()=>parseJson3([{tStartMs:0,segs:[{utf8:'speech'}]}],20),/invalid_captions/);
    const forged=player([{...track(),baseUrl:'https://third-party.example/captions'}]);
    const calls=[];const result=await fetchTranscript('first',{playerData:forged,fetchFn:async(url)=>{calls.push(url);return json(forged);}});
    assert.equal(result.error,'fetch_failed');assert.ok(calls.every(url=>url.startsWith('https://www.youtube.com/')));
    assert.equal(validateTranscript({videoId:'second',duration:20,words:[{text:'x',start:1,end:2}],timing:'word'},'first'),false);
});
test('missing speech duration can use next speech boundary; blank separators need no duration',()=>{
    const parsed=parseJson3([{tStartMs:1000,segs:[{utf8:'one'}]},{tStartMs:1500,segs:[{utf8:'\n'}]},{tStartMs:2000,dDurationMs:1000,segs:[{utf8:'two'}]}],20);
    assert.equal(parsed.words[0].end,2);assert.equal(parsed.words.length,2);
});
test('installation defaults work without opening popup and migrate forced legacy manual mode',async()=>{
    let saved;const storage={get:async()=>({autoSkip:false,labels:[]}),set:async value=>{saved=value;}};
    await initializeSettings(storage);assert.equal(saved.autoSkip,true);assert.equal(saved.selfPromotion,false);
    assert.equal(normalizeSettings({isEnabled:false}).isEnabled,false);
    assert.equal(normalizeSettings({viewerSchema:1,autoSkip:false}).autoSkip,false);
});
function windowFixture() {
    const listeners=new Set();const win={location:{origin:'https://www.youtube.com'},addEventListener:(_,fn)=>listeners.add(fn),removeEventListener:(_,fn)=>listeners.delete(fn),postMessage(value){win.sent=value;},emit(data,source=win,origin=win.location.origin){for(const fn of [...listeners])fn({data,source,origin});}};
    return win;
}
test('bridge rejects different source, nonce, video and non-finite timing',async()=>{
    const win=windowFixture();const task=requestTranscript(win,'first',{nonce:'known'});
    assert.equal(win.sent.type,REQUEST);
    const payload={videoId:'first',duration:20,timing:'word',words:[{text:'x',start:1,end:2}]};
    win.emit({type:RESPONSE,nonce:'other',payload});win.emit({type:RESPONSE,nonce:'known',payload},{});
    win.emit({type:RESPONSE,nonce:'known',payload:{...payload,videoId:'second'}});
    assert.equal((await task).error,'invalid_captions');
    const task2=requestTranscript(win,'first',{nonce:'known2'});
    win.emit({type:RESPONSE,nonce:'known2',payload:{...payload,words:[{text:'x',start:NaN,end:2}]}});
    assert.equal((await task2).error,'invalid_captions');
});
test('bridge cancellation releases listener and ignores a late response',async()=>{
    const win=windowFixture(),controller=new AbortController();const task=requestTranscript(win,'first',{nonce:'n',signal:controller.signal});
    controller.abort();assert.equal((await task).error,'fetch_failed');
    win.emit({type:RESPONSE,nonce:'n',payload:{error:'no_captions'}});
    assert.equal(win.sent.type,'yt-sponsor:transcript-cancel:v1');
});

test('untimed text runs preserve caption reading order and share the line duration',()=>{
    const parsed=parseJson3([{tStartMs:1000,dDurationMs:4000,segs:[{utf8:'hello friends '},{utf8:'welcome today'}]}],20);
    assert.deepEqual(parsed.words.map(w=>w.text),['hello','friends','welcome','today']);
    assert.deepEqual(parsed.words.map(w=>[w.start,w.end]),[[1,2],[2,3],[3,4],[4,5]]);assert.equal(parsed.timing,'estimated');
});
test('an untimed first ASR word still retains subsequent word offsets',()=>{
    const parsed=parseJson3([{tStartMs:1000,dDurationMs:3000,segs:[{utf8:'sponsored'},{utf8:'by',tOffsetMs:1000},{utf8:'example',tOffsetMs:2000}]}],20);
    assert.deepEqual(parsed.words.map(w=>[w.start,w.end]),[[1,2],[2,3],[3,4]]);
});

test('styled fragments within a word are concatenated without inventing whitespace',()=>{
    const parsed=parseJson3([{tStartMs:0,dDurationMs:2000,segs:[{utf8:'spon'},{utf8:'sor message'}]}],20);
    assert.deepEqual(parsed.words.map(w=>w.text),['sponsor','message']);assert.deepEqual(parsed.words.map(w=>[w.start,w.end]),[[0,1],[1,2]]);
});

test('whitespace-only text runs remain separators when estimating an untimed line',()=>{
    const parsed=parseJson3([{tStartMs:0,dDurationMs:2000,segs:[{utf8:'hello'},{utf8:' '},{utf8:'world'}]}],20);
    assert.deepEqual(parsed.words.map(w=>w.text),['hello','world']);
});
