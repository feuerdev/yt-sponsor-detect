// SPDX-License-Identifier: GPL-3.0-or-later
import {loadSettings} from './settings.js';
import {validVideoId,validateTranscript} from './transcript.js';
import {validSegments} from './cache.js';
const MODEL_ERRORS=new Set(['model_unavailable','inference_failed','invalid_output']);
export class SessionCoordinator {
    constructor({settings,cache,detect,cancel=()=>{},notify=()=>{},modelKey}) {
        Object.assign(this,{settings,cache,detect,cancel,notify,modelKey}); this.sessions=new Map();
    }
    current(tabId,session) { return this.sessions.get(tabId)===session; }
    snapshot(session) {
        if (!session) return null;
        const {videoId,token,status,segments,duration,progress,diagnostics,paused}=session;
        return {videoId,token,status,segments,duration,progress,diagnostics,paused:!!paused};
    }
    publish(tabId,session) {
        if (this.current(tabId,session)) Promise.resolve(this.notify(tabId,this.snapshot(session))).catch(()=>{});
    }
    clear(tabId) {
        const old=this.sessions.get(tabId); this.sessions.delete(tabId);
        if (old) this.cancel(old.jobId);
    }
    async begin(tabId,videoId,token,{retry=false}={}) {
        if (!validVideoId(videoId) || typeof token!=='string' || !token || token.length>100) throw new Error('invalid_session');
        const existing=this.sessions.get(tabId);
        if (!retry && existing?.videoId===videoId && existing.token===token) return this.snapshot(existing);
        this.clear(tabId);
        const session={videoId,token,status:'loading',segments:[],jobId:tabId+':'+token,paused:existing?.videoId===videoId&&existing.paused===true};
        this.sessions.set(tabId,session);
        const settings=await loadSettings(this.settings); if (!this.current(tabId,session)) return null;
        if (!settings.isEnabled) { session.status='disabled'; return this.snapshot(session); }
        if (retry) await this.cache.remove(videoId);
        let cached;
        try { cached=retry?null:await this.cache.get(videoId,this.modelKey); } catch { cached=null; }
        if (!this.current(tabId,session)) return null;
        if (cached) Object.assign(session,{status:'ready',segments:cached.segments,duration:cached.duration,diagnostics:cached.diagnostics});
        this.publish(tabId,session); return this.snapshot(session);
    }
    progress(jobId,progress) {
        for(const [tabId,session] of this.sessions)if(session.jobId===jobId&&session.status==='analyzing'
            &&Number.isFinite(progress?.processed)&&Number.isFinite(progress?.total)&&progress.processed>=0
            &&progress.total>0&&progress.processed<=progress.total&&validSegments(progress.segments,session.coverageEnd||session.duration)&&progress.segments.every(s=>s.start>=(session.coverageStart||0))) {
            session.progress={processed:progress.processed,total:progress.total};session.segments=progress.segments;this.publish(tabId,session);
        }
    }
    unavailable(tabId,token,reason) {
        const session=this.sessions.get(tabId);
        if (!session || session.token!==token || !['no_captions','unsupported_language','fetch_failed','invalid_captions','insufficient_text'].includes(reason)) return null;
        session.status=reason; session.segments=[]; this.publish(tabId,session); return this.snapshot(session);
    }
    async submit(tabId,token,transcript) {
        const session=this.sessions.get(tabId);
        if (!session || session.token!==token) return null;
        if (session.work) return session.work;
        if (!validateTranscript(transcript,session.videoId)) return this.unavailable(tabId,token,'invalid_captions');
        const settings=await loadSettings(this.settings);
        if (!this.current(tabId,session)) return null;
        if (!settings.isEnabled) { session.status='disabled'; this.publish(tabId,session); return this.snapshot(session); }
        if (session.work) return session.work;
        session.status='analyzing'; session.duration=transcript.duration;session.coverageEnd=transcript.coverage==='partial'?transcript.coverageEnd:transcript.duration;session.coverageStart=transcript.coverage==='partial'?transcript.coverageStart:0; this.publish(tabId,session);
        session.work=(async()=>{
            try {
                const result=await this.detect(transcript,{jobId:session.jobId,onProgress:progress=>{
                    if (this.current(tabId,session)) { session.progress=progress; this.publish(tabId,session); }
                }});
                if (!this.current(tabId,session)) return null;
                if (!result || !validSegments(result.segments,session.coverageEnd)||!result.segments.every(s=>s.start>=session.coverageStart)) throw Object.assign(new Error('invalid_output'),{code:'invalid_output'});
                session.status='ready'; session.segments=result.segments;
                session.diagnostics={...result.diagnostics,track:transcript.track,timing:transcript.timing,language:transcript.language,coverage:transcript.coverage||'full',coverageStart:transcript.coverageStart,coverageEnd:transcript.coverageEnd};
                this.publish(tabId,session);
                // Storage failure does not turn valid detection into a playback failure.
                if(transcript.coverage!=='partial')await this.cache.put(session.videoId,this.modelKey,session,()=>this.current(tabId,session)).catch(()=>{});
                return this.current(tabId,session)?this.snapshot(session):null;
            } catch(error) {
                if (!this.current(tabId,session)) return null;
                session.status=MODEL_ERRORS.has(error.code)?error.code:'inference_failed';session.segments=[];
                this.publish(tabId,session);return this.snapshot(session);
            } finally { session.work=null; }
        })();
        return session.work;
    }
    pause(tabId,value) {
        const session=this.sessions.get(tabId);if(!session)return null;
        session.paused=value===true;this.publish(tabId,session);return this.snapshot(session);
    }
    disabled() {
        for (const [tabId,session] of this.sessions) {
            this.cancel(session.jobId);this.sessions.delete(tabId);
            Promise.resolve(this.notify(tabId,{...this.snapshot(session),status:'disabled',segments:[]})).catch(()=>{});
        }
    }
}
