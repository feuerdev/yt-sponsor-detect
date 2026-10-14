// SPDX-License-Identifier: GPL-3.0-or-later
import {validVideoId} from './transcript.js';
import {validSegments} from './cache.js';
// Require similar endpoints AND substantial agreement in both directions. A
// refreshed estimate spanning several unrelated blocks must remain eligible.
export function matchesCorrection(saved,estimate) {
    const overlap=Math.max(0,Math.min(saved.end,estimate.end)-Math.max(saved.start,estimate.start));
    return saved.category===estimate.category&&Math.abs(saved.start-estimate.start)<=3&&Math.abs(saved.end-estimate.end)<=3
        &&overlap/(saved.end-saved.start)>=.8&&overlap/(estimate.end-estimate.start)>=.8;
}
export class CorrectionStore {
    constructor(storage){this.storage=storage;this.tail=Promise.resolve();}
    key(videoId){if(!validVideoId(videoId))throw Error('invalid_video');return 'viewer-corrections:v1:'+videoId;}
    async get(videoId){const key=this.key(videoId),entry=(await this.storage.get(key))[key];
        if(entry?.schema!==1||!validSegments(entry.rejected)||entry.rejected.length>500)return [];
        return entry.rejected;
    }
    update(videoId,change){const operation=this.tail.then(async()=>{
        const rejected=change(await this.get(videoId));
        await this.storage.set({[this.key(videoId)]:{schema:1,rejected}});return rejected;
    });this.tail=operation.catch(()=>{});return operation;}
    reject(videoId,segment){if(!validSegments([segment]))return Promise.reject(Error('invalid_segment'));
        return this.update(videoId,items=>items.some(item=>matchesCorrection(item,segment))?items:[...items,{start:segment.start,end:segment.end,category:segment.category}].slice(-500));}
    reset(videoId){return this.update(videoId,()=>[]);}
}
