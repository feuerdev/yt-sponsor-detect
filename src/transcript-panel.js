import {validateCaptions} from './caption-contract.js';

// Serialized by chrome.scripting into MAIN. Keep this function self-contained.
// Only reads the open public panel; never opens it, fetches, seeks or runs page text.
export function captureOpenTranscript(videoId) {
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
            if(rect.width<=0 || rect.height<=0)continue;
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
                if(incomplete || panel.querySelector('input[type="search"], input#search')?.value?.trim())return null;
                candidates.push({videoId,durationSeconds,rows});
            }
        }
        return candidates.length===1 ? candidates[0] : null;
    }catch{return null;}
}

export function panelCaptions(snapshot,videoId,language) {
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
    if(rows[0].start>60 || duration-rows.at(-1).start>120)unavailable();
    const languages=language?.languages;
    if(language?.isReliable!==true || !Array.isArray(languages)
        || !languages.some(item=>item.language==='en'&&Number.isFinite(item.percentage)&&item.percentage>=90)
        || languages.some(item=>!Number.isFinite(item.percentage)||item.percentage<0||item.percentage>100
            || (item.language!=='en'&&item.language!=='und'&&item.percentage>=10)))throw Error('unsupported_language');
    const captions=rows.map((row,i)=>({start:row.start,duration:(row.end??rows[i+1]?.start??duration)-row.start,text:row.text}));
    try{validateCaptions(captions);}catch{unavailable();}
    return {captions,provenance:{captionSource:'public-transcript-panel',captionTrackId:null,language:'en',
        languageVerification:'Chrome i18n.detectLanguage; reliable English >=90 percent',
        timingResolutionSeconds:coarse?1:.001,endBoundaryMethod:coarse?'next cue start; final cue ends at video duration':'native panel startMs/endMs'}};
}
