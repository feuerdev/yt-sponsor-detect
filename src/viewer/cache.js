// SPDX-License-Identifier: GPL-3.0-or-later
export function validSegments(segments, duration = 86400) {
    return Array.isArray(segments) && segments.length <= 1000 && segments.every(s =>
        s && Number.isFinite(s.start) && Number.isFinite(s.end) && s.start >= 0 && s.end > s.start && s.end <= duration
        && ['sponsor','selfpromo'].includes(s.category) && (s.score === undefined || Number.isFinite(s.score) && s.score >= 0 && s.score <= 1));
}
export class ResultCache {
    constructor(storage, {clock=Date.now, maxEntries=30, ttl=48*3600000}={}) {
        this.storage=storage; this.clock=clock; this.maxEntries=maxEntries; this.ttl=ttl; this.queue=Promise.resolve();
    }
    async get(videoId,modelKey) {
        const entry=(await this.storage.get('viewer-cache:'+videoId))['viewer-cache:'+videoId];
        if (!modelKey || !entry || entry.modelKey!==modelKey || entry.complete!==true || !Number.isFinite(entry.createdAt)
            || this.clock()<entry.createdAt || this.clock()-entry.createdAt>this.ttl || !Number.isFinite(entry.duration)
            || entry.duration<=0 || !validSegments(entry.segments,entry.duration)) return null;
        return entry;
    }
    put(videoId,modelKey,result,current=()=>true) {
        const write=this.queue.then(async()=>{
            if (!current() || !modelKey || !Number.isFinite(result.duration) || result.duration<=0 || !validSegments(result.segments,result.duration)) return;
            const all=await this.storage.get(null); if (!current()) return;
            const key='viewer-cache:'+videoId;
            const others=Object.entries(all).filter(([name])=>name.startsWith('viewer-cache:') && name!==key)
                .sort((a,b)=>(a[1]?.createdAt||0)-(b[1]?.createdAt||0));
            if (others.length>=this.maxEntries) await this.storage.remove(others.slice(0,others.length-this.maxEntries+1).map(([name])=>name));
            if (!current()) return;
            await this.storage.set({[key]:{modelKey,complete:true,createdAt:this.clock(),duration:result.duration,
                segments:result.segments.map(segment=>({...segment})),diagnostics:result.diagnostics}});
        });
        this.queue=write.catch(()=>{}); return write;
    }
    async remove(videoId) { await this.storage.remove('viewer-cache:'+videoId); }
}
