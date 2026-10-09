// SPDX-License-Identifier: GPL-3.0-or-later
import {statusText} from './settings.js';
export function formatTime(seconds) {
    const value=Math.max(0,Math.floor(seconds));const hours=Math.floor(value/3600);
    return (hours?hours+':':'')+String(Math.floor(value/60)%60).padStart(2,'0')+':'+String(value%60).padStart(2,'0');
}
export class PlayerUI {
    constructor(doc,{retry=()=>{}}={}) {this.doc=doc;this.retry=retry;this.player=null;this.root=null;this.bar=null;}
    bind(player) {
        if(this.player===player&&this.root?.isConnected)return;
        this.destroy();this.player=player;if(!player)return;
        const root=this.doc.createElement('div');root.className='ss-viewer';root.id='ss-viewer';
        const status=this.doc.createElement('div');status.className='ss-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
        const text=this.doc.createElement('span');status.appendChild(text);
        const retry=this.doc.createElement('button');retry.textContent='Retry';retry.type='button';retry.hidden=true;retry.addEventListener('click',()=>this.retry());status.appendChild(retry);
        root.appendChild(status);player.appendChild(root);Object.assign(this,{root,status,text,retryButton:retry});
    }
    state(state) {
        if(!this.root)return;
        const status=state.paused&&!['disabled','ad'].includes(state.status)?'paused':state.status;
        const label=statusText({...state,status});
        // Raw progress is available in diagnostics; do not repeatedly announce it.
        if(this.text.textContent!==label)this.text.textContent=label;
        this.status.dataset.ready=status==='ready'?'true':'false';
        this.status.title=label;this.retryButton.hidden=!['fetch_failed','invalid_captions','model_unavailable','inference_failed'].includes(status);
    }
    skipped({seconds,undo}) {
        if(!this.root)return;
        this.root.querySelector('.ss-skip-notice')?.remove();
        const notice=this.doc.createElement('div');notice.className='ss-skip-notice';notice.setAttribute('role','status');
        const text=this.doc.createElement('span');text.textContent='Skipped sponsor · '+Math.max(1,Math.round(seconds))+'s';
        const button=this.doc.createElement('button');button.textContent='Undo';button.type='button';
        button.addEventListener('click',()=>{if(undo()){notice.remove();this.highlights(this.lastSegments||[],this.lastDuration);}});
        notice.appendChild(text);notice.appendChild(button);this.root.appendChild(notice);
    }
    suggest(offer) {
        this.offer=offer;if(!this.root)return;
        const existing=this.root.querySelector('.ss-manual-offer');
        if(!offer){existing?.remove();return;}
        if(existing)return;
        const button=this.doc.createElement('button');button.type='button';button.className='ss-manual-offer';button.textContent='Skip sponsor';
        button.addEventListener('click',()=>this.offer?.skip());this.root.appendChild(button);
    }
    clearNotice(){this.root?.querySelector('.ss-skip-notice')?.remove();}
    highlights(segments,duration) {
        this.lastSegments=segments;this.lastDuration=duration;
        this.doc.querySelectorAll('.ss-highlight').forEach(element=>element.remove());
        const bar=this.doc.querySelector('.ytp-progress-bar');if(!bar||!Number.isFinite(duration)||duration<=0)return;
        for(const segment of segments) {
            const marker=this.doc.createElement('div');marker.className='ss-highlight';marker.setAttribute('aria-hidden','true');
            marker.style.left=100*Math.min(segment.start,duration)/duration+'%';
            marker.style.width=100*(Math.min(segment.end,duration)-Math.min(segment.start,duration))/duration+'%';bar.appendChild(marker);
        }
    }
    destroy(){this.root?.remove();this.root=null;this.player=null;this.doc.querySelectorAll('.ss-highlight').forEach(element=>element.remove());}
}
