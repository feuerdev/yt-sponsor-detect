// SPDX-License-Identifier: GPL-3.0-or-later
// Event-based scheduling inspired by SponsorSkip; no polling/busy loop.
import {validSegments} from './cache.js';
const EVENTS=['play','playing','pause','seeking','seeked','ratechange','waiting','durationchange','timeupdate'];
export class PlaybackController {
    constructor({videoId,onSkip=()=>{},onOffer=()=>{},isAd=()=>false,timers=globalThis}={}) {
        this.getVideoId=videoId;this.onSkip=onSkip;this.onOffer=onOffer;this.isAd=isAd;this.timers=timers;
        this.video=null;this.token=null;this.segments=[];this.suppressed=[];this.acted=[];this.enabled=false;this.autoSkip=true;
        this.handler=event=>this.event(event.type);this.timer=null;this.ownSeek=false;
    }
    attach(video,id,token) {
        if(this.video===video&&this.id===id&&this.token===token&&this.source===(video.currentSrc||video.src||''))return;
        const same=this.id===id&&this.token===token;
        this.detach();this.video=video;this.source=video.currentSrc||video.src||'';this.id=id;this.token=token;this.segments=[];
        if(!same){this.suppressed=[];this.acted=[];this.pausedForVideo=false;}
        for(const name of EVENTS)video.addEventListener(name,this.handler);
        this.schedule();
    }
    detach() {
        this.cancel();if(this.video)for(const name of EVENTS)this.video.removeEventListener(name,this.handler);
        this.video=null;this.ownSeek=false;this.buffering=false;
    }
    cancel() {if(this.timer!==null)this.timers.clearTimeout(this.timer);this.timer=null;}
    configure(settings) {this.enabled=settings.isEnabled===true;this.autoSkip=settings.autoSkip!==false;this.selfPromotion=settings.selfPromotion===true;this.schedule();}
    pause(value) {this.pausedForVideo=value===true;this.schedule();}
    setSegments(segments,id,token) {
        if(id!==this.id||token!==this.token||!validSegments(segments))return;
        this.segments=segments.slice().sort((a,b)=>a.start-b.start);this.schedule();
    }
    matches(interval,segment) {return interval.start<segment.end&&segment.start<interval.end;}
    allowed(segment) {
        return (segment.category==='sponsor'||this.selfPromotion)&&!this.suppressed.some(s=>this.matches(s,segment))
            &&!this.acted.some(s=>s.start<=segment.start+0.05&&s.end>=segment.end-0.05);
    }
    current() {return this.video&&this.getVideoId()===this.id&&this.source===(this.video.currentSrc||this.video.src||'');}
    event(type) {
        if(type==='waiting')this.buffering=true;
        if(type==='playing'||type==='play')this.buffering=false;
        if(type==='seeking'){this.cancel();return;}
        if(type==='seeked') {
            if(!this.ownSeek){const at=this.video.currentTime;for(const segment of this.segments)if(at>=segment.start&&at<segment.end)this.suppressed.push({...segment});}
            this.ownSeek=false;
        }
        this.schedule();
    }
    schedule() {
        this.cancel();const video=this.video;
        if(!this.current()||!this.enabled||this.pausedForVideo||this.isAd()||this.buffering||video.seeking
            ||video.readyState<2||!Number.isFinite(video.duration)||video.duration<=0||!Number.isFinite(video.currentTime)
            ||!Number.isFinite(video.playbackRate)||video.playbackRate<=0){this.onOffer(null);return;}
        const now=video.currentTime;
        const segment=this.segments.find(s=>this.allowed(s)&&s.end>now+0.2&&s.start<video.duration&&s.end<=video.duration+1);
        if(!segment){this.onOffer(null);return;}
        if(!this.autoSkip){this.onOffer(now>=segment.start?{segment,skip:()=>this.skip(segment)}:null);return;}
        this.onOffer(null);if(video.paused)return;
        if(now>=segment.start){this.skip(segment);return;}
        const delay=Math.min(60000,Math.max(25,(segment.start-now)/video.playbackRate*1000));
        const token=this.token,identity=video;
        this.timer=this.timers.setTimeout(()=>{this.timer=null;if(this.token===token&&this.video===identity)this.schedule();},delay);
    }
    skip(segment) {
        const video=this.video;
        if(!this.current()||!this.enabled||this.pausedForVideo||this.isAd()||!this.segments.includes(segment)
            ||!Number.isFinite(video.duration)||!Number.isFinite(video.currentTime)||video.currentTime<segment.start
            ||video.currentTime>=segment.end-0.2)return false;
        const end=Math.min(segment.end,video.duration);
        if(end<=video.currentTime)return false;
        const token=this.token,id=this.id,identity=video,previousTime=video.currentTime;
        this.cancel();this.acted.push({...segment});this.ownSeek=true;video.currentTime=end;
        this.onSkip({segment,seconds:end-previousTime,undo:()=>{
            if(!this.enabled||this.token!==token||this.video!==identity||this.id!==id||!this.current()||this.isAd())return false;
            this.suppressed.push({...segment});this.cancel();this.ownSeek=true;
            video.currentTime=Math.max(0,segment.start);return true;
        }});
        // Seeked will re-arm; tests and paused/manual seeks need no extra polling.
        return true;
    }
}
