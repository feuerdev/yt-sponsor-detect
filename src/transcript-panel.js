import {validateCaptions} from './caption-contract.js';

// Serialized by chrome.scripting into MAIN. Keep this function self-contained.
// Automatic acquisition uses YouTube's own transcript control without changing CC or playback.
export function captureOpenTranscript(videoId, automatic=false, requestId=videoId) {
    let capturedPanel=null;
    function read() {
    try {
        const url=new URL(location.href),player=document.querySelector('#movie_player');
        if(url.protocol!=='https:' || url.hostname!=='www.youtube.com' || url.pathname!=='/watch'
            || url.searchParams.get('v')!==videoId || !player) return null;
        const info=player.getVideoData(),durationSeconds=player.getDuration();
        if(info.video_id!==videoId || info.isLive || !Number.isFinite(durationSeconds)
            || durationSeconds<=0 || durationSeconds>43200) return null;
        const candidates=[];
        for(const panel of document.querySelectorAll('ytd-engagement-panel-section-list-renderer')) {
            const rect=panel.getBoundingClientRect();
            if(rect.width<=0 || rect.height<=0 || panel.getAttribute?.('visibility')==='ENGAGEMENT_PANEL_VISIBILITY_HIDDEN')continue;
            const rows=[],seen=new WeakSet();let visited=0,characters=0,incomplete=false;
            function collect(value,depth=0) {
                if(!value || typeof value!=='object')return;
                if(depth>32 || ++visited>50000 || seen.has(value))throw Error();
                seen.add(value);
                for(const [key,item] of Object.entries(value)) {
                    if(key==='continuationItemRenderer')incomplete=true;
                    else if(key==='transcriptSegmentViewModel') {
                        if(!/^\d+(?::[0-5]\d){1,2}$/.test(item?.timestamp) || typeof item.simpleText!=='string')throw Error();
                        rows.push({start:item.timestamp.split(':').reduce((n,v)=>n*60+Number(v),0),text:item.simpleText});
                        characters+=item.simpleText.length;
                    } else if(key==='transcriptSegmentRenderer') {
                        const text=(item.snippet?.runs??[]).map(run=>{if(typeof run.text!=='string')throw Error();return run.text;}).join('');
                        rows.push({start:Number(item.startMs)/1000,end:Number(item.endMs)/1000,text});characters+=text.length;
                    } else collect(item,depth+1);
                    if(rows.length>10000 || characters>2000000)throw Error();
                }
            }
            collect(panel.data);
            if(rows.length) {
                if((incomplete&&!automatic) || panel.querySelector('input[type="search"], input#search')?.value?.trim())return null;
                candidates.push({panel,snapshot:{videoId,durationSeconds,rows,...(incomplete?{incomplete:true}:{})}});
            }
        }
        if(candidates.length!==1)return null;
        capturedPanel=candidates[0].panel;return candidates[0].snapshot;
    }catch{return null;}
    }
    if(!automatic)return read();
    return (async()=>{
        // MAIN-world ownership is shared by capture and the cancellation helper.
        if(window.__ssTranscriptCancelled?.has(requestId))return {error:'fetch_failed',recovery:{restored:true,reason:'cancelled'}};
        const previous=window.__ssTranscriptRecovery;
        if(previous){previous.abort();await previous.done;}
        let finish,cancelled=window.__ssTranscriptCancelled?.has(requestId)===true,navigated=false,wake;
        const operation={videoId,requestId,abort(){cancelled=true;wake?.();},done:new Promise(resolve=>{finish=resolve;})};
        window.__ssTranscriptRecovery=operation;
        const sameVideo=()=>{try{const url=new URL(location.href);return url.origin==='https://www.youtube.com'&&url.pathname==='/watch'&&url.searchParams.get('v')===videoId;}catch{return false;}};
        const current=()=>!cancelled&&!navigated&&window.__ssTranscriptRecovery===operation&&sameVideo();
        const panels=()=>Array.from(document.querySelectorAll('ytd-engagement-panel-section-list-renderer'));
        const visible=panel=>{const r=panel.getBoundingClientRect();return r.width>0&&r.height>0&&panel.getAttribute?.('visibility')!=='ENGAGEMENT_PANEL_VISIBILITY_HIDDEN';};
        const transcriptPanel=panel=>!!panel.querySelector('ytd-transcript-renderer, transcript-view-model, transcript-segment-view-model, ytd-transcript-segment-renderer');
        const navigation=()=>{navigated=true;operation.abort();};
        window.addEventListener?.('yt-navigate-start',navigation);window.addEventListener?.('popstate',navigation);
        const initialPanels=panels().filter(visible),alreadyOpen=initialPanels.some(transcriptPanel);
        const initialFocus=document.activeElement,initialScroll={x:window.scrollX||0,y:window.scrollY||0};
        let opened=false,taken=false,layoutTaken=false,scrollTaken=false,focusTaken=false,result=null,restoreIssue=null;
        const belongsToTranscript=target=>panels().some(p=>transcriptPanel(p)&&p.contains?.(target));
        const interaction=event=>{
            if(!event.isTrusted)return;
            if(belongsToTranscript(event.target))taken=true;
            const panel=event.target?.closest?.('ytd-engagement-panel-section-list-renderer');
            if(panel&&!transcriptPanel(panel))layoutTaken=true;
            if(event.target?.closest?.('ytd-video-description-transcript-section-renderer'))taken=true;
            if(event.type==='pointerdown'||event.type==='keydown')focusTaken=true;
            if(event.type==='pointerdown'&&Number.isFinite(window.innerWidth)&&event.clientX>=window.innerWidth-20)scrollTaken=true;
            // Player keyboard shortcuts are unrelated to transcript ownership.
            if(event.type==='keydown'&&!event.target?.closest?.('#movie_player')&&['PageDown','PageUp','Home','End','ArrowDown','ArrowUp',' '].includes(event.key))scrollTaken=true;
        };
        const scrolling=event=>{if(event.isTrusted)scrollTaken=true;};
        const types=['pointerdown','keydown','input'];
        for(const type of types)document.addEventListener(type,interaction,true);
        document.addEventListener('wheel',scrolling,true);document.addEventListener('touchmove',scrolling,true);
        // Keep native opening commands for any panel displaced by recovery.
        const openerFor=panel=>{
            const identifier=panel.getAttribute?.('target-id')||panel.id;if(!identifier)return null;
            return Array.from(document.querySelectorAll('button, ytd-button-renderer, ytd-menu-service-item-renderer')).find(element=>{
                if(panel.contains?.(element))return false;
                const data=element.data;
                return element.getAttribute?.('aria-controls')===identifier||data?.serviceEndpoint?.showEngagementPanelEndpoint?.panelIdentifier===identifier
                    ||data?.command?.showEngagementPanelEndpoint?.panelIdentifier===identifier||data?.buttonRenderer?.command?.showEngagementPanelEndpoint?.panelIdentifier===identifier;
            });
        };
        const displaced=initialPanels.filter(p=>!transcriptPanel(p)).map(panel=>({panel,opener:openerFor(panel)}));
        try {
            const deadline=Date.now()+15000;
            while(current()&&Date.now()<deadline) {
                result=read();if(result)break;
                if(panels().some(p=>visible(p)&&transcriptPanel(p)&&p.querySelector('input[type="search"], input#search')?.value?.trim())){restoreIssue='searched_transcript';break;}
                if(!opened&&!alreadyOpen) {
                    const button=document.querySelector('ytd-video-description-transcript-section-renderer button');
                    if(button&&current()){opened=true;button.click();continue;}
                }
                await new Promise(resolve=>{wake=resolve;setTimeout(resolve,200);});wake=null;
            }
            if(!result&&!restoreIssue)restoreIssue=cancelled?'cancelled':sameVideo()?'transcript_unavailable':'navigated';
        } catch {restoreIssue='transcript_unavailable';}
        finally {
            for(const type of types)document.removeEventListener(type,interaction,true);
            window.removeEventListener?.('yt-navigate-start',navigation);window.removeEventListener?.('popstate',navigation);
            document.removeEventListener('wheel',scrolling,true);document.removeEventListener('touchmove',scrolling,true);
            // Cancellation still owns cleanup. Navigation never does.
            try {
            if(window.__ssTranscriptRecovery===operation&&!navigated&&sameVideo()&&opened&&!taken&&!layoutTaken) {
                for(const panel of panels())if(sameVideo()&&visible(panel)&&(panel===capturedPanel||transcriptPanel(panel))) {
                    const close=panel.querySelector('#visibility-button button');
                    if(close)close.click();else restoreIssue='close_control_unavailable';
                }
                for(const {panel,opener} of displaced)if(sameVideo()&&!visible(panel)) {
                    const newerPanel=panels().some(p=>visible(p)&&!initialPanels.includes(p)&&!transcriptPanel(p));
                    if(newerPanel)continue;
                    if(opener?.isConnected&&sameVideo())opener.click();else restoreIssue='panel_restore_unavailable';
                }
                if(!focusTaken&&sameVideo()&&initialFocus?.isConnected){
                    const focused=document.activeElement;
                    if(!focused||focused===document.body||belongsToTranscript(focused))initialFocus.focus?.({preventScroll:true});
                }
                if(!scrollTaken&&sameVideo())window.scrollTo?.(initialScroll.x,initialScroll.y);
            }
            } catch {restoreIssue='cleanup_failed';}
            finally {if(window.__ssTranscriptRecovery===operation)delete window.__ssTranscriptRecovery;finish();}
        }
        const recovery={restored:!['close_control_unavailable','panel_restore_unavailable','cleanup_failed'].includes(restoreIssue),userOwned:taken||layoutTaken,reason:restoreIssue};
        return result?{...result,recovery}:{error:'fetch_failed',recovery};
    })();
}

export async function cancelTranscriptRecovery(videoId,requestId) {
    window.__ssTranscriptCancelled ||= new Set();window.__ssTranscriptCancelled.add(requestId);
    if(window.__ssTranscriptCancelled.size>100)window.__ssTranscriptCancelled.delete(window.__ssTranscriptCancelled.values().next().value);
    const operation=window.__ssTranscriptRecovery;
    if(operation?.videoId!==videoId||operation.requestId!==requestId)return;
    operation.abort();await operation.done;
}

export function panelCaptions(snapshot,videoId,language,{allowPartial=false}={}) {
    const unavailable=()=>{throw Error('captions_unavailable');};
    if(!snapshot || snapshot.videoId!==videoId || !Number.isFinite(snapshot.durationSeconds)
        || snapshot.durationSeconds<=0 || snapshot.durationSeconds>43200 || !Array.isArray(snapshot.rows)
        || !snapshot.rows.length || snapshot.rows.length>10000)unavailable();
    const duration=snapshot.durationSeconds,rows=[];let characters=0;
    const coarse=snapshot.rows.some(row=>row?.end===undefined);
    for(const row of snapshot.rows) {
        if(!Number.isFinite(row?.start) || row.start<0 || row.start>=duration || typeof row.text!=='string'
            || !row.text.trim() || (row.end!==undefined&&(!Number.isFinite(row.end)||row.end<=row.start||row.end>duration)))unavailable();
        characters+=row.text.length;if(characters>2000000)unavailable();
        const last=rows.at(-1);
        if(last && row.start<last.start)unavailable();
        if(last && row.start===last.start && coarse)last.text+=' '+row.text.trim();
        else rows.push({...row,text:row.text.trim()});
    }
    // A visibly clipped/search result must not look like a completed full transcript.
    // Sparse tracks and long silent endings can safely remain unavailable.
    const partial=snapshot.incomplete===true || rows[0].start>60 || duration-(rows.at(-1).end??rows.at(-1).start)>120;
    if(partial&&!allowPartial)unavailable();
    // A final coarse cue has no defensible endpoint when the remaining track is unknown.
    if(partial && rows.at(-1).end===undefined)rows.pop();
    if(!rows.length)unavailable();
    const languages=language?.languages;
    if(language?.isReliable!==true || !Array.isArray(languages)
        || !languages.some(item=>item.language==='en'&&Number.isFinite(item.percentage)&&item.percentage>=90)
        || languages.some(item=>!Number.isFinite(item.percentage)||item.percentage<0||item.percentage>100
            || (item.language!=='en'&&item.language!=='und'&&item.percentage>=10)))throw Error('unsupported_language');
    const captions=rows.map((row,i)=>({start:row.start,duration:(row.end??rows[i+1]?.start??(partial?snapshot.rows.at(-1).start:duration))-row.start,text:row.text}));
    try{validateCaptions(captions);}catch{unavailable();}
    return {captions,provenance:{captionSource:'public-transcript-panel',captionTrackId:null,language:'en',
        languageVerification:'Chrome i18n.detectLanguage; reliable English >=90 percent',
        coverage:partial?'partial':'full',coverageStart:captions[0].start,coverageEnd:Math.max(...captions.map(c=>c.start+c.duration)),
        timingResolutionSeconds:coarse?1:.001,endBoundaryMethod:coarse?(partial?'next known cue start; unknown final cue omitted':'next cue start; final cue ends at video duration'):'native panel startMs/endMs'}};
}
