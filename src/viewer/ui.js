// SPDX-License-Identifier: GPL-3.0-or-later
import {statusText} from './settings.js';
export function formatTime(seconds) {
    const value=Math.max(0,Math.floor(seconds)),hours=Math.floor(value/3600);
    return (hours?hours+':':'')+String(Math.floor(value/60)%60).padStart(2,'0')+':'+String(value%60).padStart(2,'0');
}
export function rangeText(segment){return formatTime(segment.start)+'–'+formatTime(segment.end);}
export function behaviorText(value){return value==='rejected'?'Rejected · will not skip automatically':value==='replay'?'Replay allowed · will not skip automatically':value==='automatic'?'Automatic skip':'Manual skip';}
export function coverageText(state) {
    const d=state?.diagnostics;if(!d?.coverage)return '';
    const start=d.coverageStart||0,end=d.coverageEnd??state.duration;
    return 'Checked '+formatTime(start)+'–'+formatTime(end)+(d.coverage==='partial'?'. Partial coverage; the rest was not checked.':'. Checked available English captions.')
        +(d.timing==='estimated'?' Segment boundaries are estimated from caption lines.':'');
}
// The timer counts only time when neither pointer nor keyboard owns the notice.
export class NoticeTimer {
    constructor(expire,{timers=globalThis,clock=Date.now,duration=8000}={}){Object.assign(this,{expire,timers,clock,remaining:duration});this.holds=new Set();this.resume();}
    resume(){if(this.timer!==undefined||this.holds.size)return;this.started=this.clock();this.timer=this.timers.setTimeout(()=>{this.timer=undefined;this.expire();},this.remaining);}
    hold(reason,value){if(value){this.holds.add(reason);if(this.timer!==undefined){this.timers.clearTimeout(this.timer);this.timer=undefined;this.remaining=Math.max(0,this.remaining-(this.clock()-this.started));}}else{this.holds.delete(reason);this.resume();}}
    cancel(){this.timers.clearTimeout(this.timer);this.timer=undefined;this.holds.add('cancelled');}
}
export class PlayerUI {
    constructor(doc,{retry=()=>{},pause=()=>{},mode=()=>{},watch=()=>false,reject=()=>{},undo=()=>false,behavior=()=> 'automatic',timers=globalThis}={}) {
        Object.assign(this,{doc,retry,pause,mode,watch,reject,undo,behavior,timers});this.player=null;this.root=null;
    }
    button(text,action){const button=this.doc.createElement('button');button.type='button';button.textContent=text;
        button.addEventListener('click',event=>{event.stopPropagation?.();action();});return button;}
    bind(player) {
        if(this.player===player&&this.root?.isConnected){this.bindControl();return;}
        this.destroy();this.player=player;if(!player)return;
        const root=this.doc.createElement('div');root.className='ss-viewer';root.id='ss-viewer';player.appendChild(root);this.root=root;
        const panel=this.doc.createElement('div');panel.className='ss-controls-panel';panel.id='ss-controls-panel';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Sponsor Skipper controls');
        const status=this.doc.createElement('div');status.className='ss-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
        const text=this.doc.createElement('span');status.appendChild(text);panel.appendChild(status);
        const select=this.doc.createElement('select');select.setAttribute('aria-label','Sponsor detection mode');
        for(const mode of ['off','manual','automatic']){const option=this.doc.createElement('option');option.value=mode;option.textContent=mode[0].toUpperCase()+mode.slice(1);select.appendChild(option);}
        select.addEventListener('change',()=>this.mode(select.value));panel.appendChild(select);
        const pause=this.button('Pause automatic skips for this visit',()=>this.pause(!this.lastState?.paused));panel.appendChild(pause);
        const retry=this.button('Recheck captions',()=>this.retry());panel.appendChild(retry);
        const coverage=this.doc.createElement('p');panel.appendChild(coverage);
        const intervals=this.doc.createElement('div');intervals.className='ss-intervals';panel.appendChild(intervals);
        const undo=this.button('Undo last skip',()=>{if(this.undo()){this.clearNotice();this.focusControl();}});panel.appendChild(undo);
        const error=this.doc.createElement('p');error.setAttribute('role','alert');panel.appendChild(error);
        root.appendChild(panel);
        const label=this.doc.createElement('div');label.className='ss-marker-label';label.hidden=true;root.appendChild(label);
        const key=event=>{if(event.key==='Escape'&&!panel.hidden){event.stopPropagation?.();panel.hidden=true;this.control?.setAttribute('aria-expanded','false');this.focusControl();}};
        panel.addEventListener('keydown',event=>{if(event.key!=='Escape')event.stopPropagation?.();});
        player.addEventListener('keydown',key);this.keyHandler=key;
        Object.assign(this,{panel,status,text,modeSelect:select,pauseButton:pause,retryButton:retry,coverage,intervals,undoButton:undo,error,label});this.bindControl();
    }
    bindControl() {
        const controls=this.player?.querySelector('.ytp-right-controls');
        if(!controls)return;
        if(this.control?.isConnected){
            const settings=controls.querySelector('.ytp-settings-button');
            // YouTube can insert its Settings button after the extension binds.
            // Anchor once per native button so its later updates keep ownership.
            if(settings&&controls.contains(settings)&&this.controlAnchor!==settings){
                const focused=this.doc.activeElement===this.control;this.controlAnchor=settings;
                settings.parentNode.insertBefore(this.control,settings.nextSibling);if(focused)this.control.focus?.();
            }
            return;
        }
        const button=this.button('',()=>{
            this.panel.hidden=!this.panel.hidden;button.setAttribute('aria-expanded',String(!this.panel.hidden));
            if(!this.panel.hidden)this.modeSelect.focus?.();
        });button.className='ytp-button ss-control';button.title='Sponsor Skipper controls';button.setAttribute('aria-label','Sponsor Skipper controls');button.setAttribute('aria-controls','ss-controls-panel');button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');
        const svg=this.doc.createElementNS('http://www.w3.org/2000/svg','svg');
        for(const [name,value] of Object.entries({viewBox:'0 0 24 24','aria-hidden':'true',focusable:'false',fill:'none',stroke:'currentColor','stroke-width':'1.8','stroke-linecap':'round','stroke-linejoin':'round'}))svg.setAttribute(name,value);
        // A shield with a skip chevron identifies sponsor filtering without
        // suggesting a mode switch. The button's name describes its action.
        for(const d of ['M12 3 4.5 6v5.2c0 4.2 2.6 7.2 7.5 9.8 4.9-2.6 7.5-5.6 7.5-9.8V6L12 3Z','m10 9 3.5 3-3.5 3M15 9v6']){
            const path=this.doc.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',d);svg.appendChild(path);
        }
        button.appendChild(svg);
        const settings=controls.querySelector('.ytp-settings-button');
        if(settings&&controls.contains(settings)){settings.parentNode.insertBefore(button,settings.nextSibling);this.controlAnchor=settings;}else controls.appendChild(button);
        this.control=button;
    }
    focusControl(){(this.control||this.player?.querySelector('.ytp-play-button'))?.focus?.();}
    state(state) {
        this.lastState=state;if(!this.root)return;
        const label=statusText({...state,status:state.status==='loading'&&state.stage==='recovering'?'recovering':state.status==='analyzing'&&state.stage==='initializing'?'initializing':state.status});
        if(this.text.textContent!==label)this.text.textContent=label;
        if(this.modeSelect.value!==state.mode)this.modeSelect.value=state.mode||'automatic';
        const pauseLabel=state.paused?'Resume automatic skips':'Pause automatic skips for this visit';
        if(this.pauseButton.textContent!==pauseLabel)this.pauseButton.textContent=pauseLabel;
        this.pauseButton.disabled=state.mode!=='automatic'||state.status==='disabled';this.retryButton.disabled=state.status==='disabled';
        const coverage=coverageText(state);if(this.coverage.textContent!==coverage)this.coverage.textContent=coverage;
        this.undoButton.hidden=!state.lastSkip;this.undoButton.disabled=!state.lastSkip?.available||state.lastSkip?.undone;
        this.renderIntervals(state.segments||[]);
    }
    renderIntervals(segments) {
        const signature=JSON.stringify(segments.map(s=>[s.start,s.end,s.category,this.behavior(s)]));if(this.intervalSignature===signature)return;this.intervalSignature=signature;
        const focused=this.intervals.contains?.(this.doc.activeElement);this.intervals.replaceChildren?.();
        for(const segment of segments){const row=this.doc.createElement('div');const label=this.doc.createElement('p');label.textContent='Estimated sponsor '+rangeText(segment)+' · '+behaviorText(this.behavior(segment));row.setAttribute('role','group');row.setAttribute('aria-label',label.textContent);row.appendChild(label);
            row.appendChild(this.button('Watch segment',()=>{if(!this.watch(segment))this.error.textContent='Playback is unavailable. Try after the ad or video loads.';}));
            const reject=this.button('Not a sponsor',()=>this.reject(segment));reject.disabled=this.behavior(segment)==='rejected';row.appendChild(reject);this.intervals.appendChild(row);}
        if(focused)this.focusControl();
    }
    skipped({seconds,undo}) {
        if(!this.root)return;this.clearNotice();
        const notice=this.doc.createElement('div');notice.className='ss-skip-notice';notice.setAttribute('role','status');
        const text=this.doc.createElement('span');text.textContent='Skipped possible sponsor · '+Math.max(1,Math.round(seconds))+'s';
        const button=this.button('Undo',()=>{if(undo()){this.clearNotice();this.focusControl();this.highlights(this.lastSegments||[],this.lastDuration);}else{text.textContent='Playback is unavailable. Try Undo after the ad or video loads.';}});
        notice.appendChild(text);notice.appendChild(button);this.root.appendChild(notice);
        const timer=new NoticeTimer(()=>this.clearNotice(),{timers:this.timers});this.noticeTimer=timer;
        notice.addEventListener('pointerenter',()=>timer.hold('hover',true));notice.addEventListener('pointerleave',()=>timer.hold('hover',false));
        notice.addEventListener('focusin',()=>timer.hold('focus',true));notice.addEventListener('focusout',event=>{if(!notice.contains?.(event.relatedTarget))timer.hold('focus',false);});
    }
    suggest(offer) {
        this.offer=offer;if(!this.root)return;
        const existing=this.root.querySelector('.ss-manual-offer');
        if(!offer){if(existing&&existing===this.doc.activeElement)this.focusControl();existing?.remove();return;}
        const duration=offer.segment?Math.max(1,Math.round(offer.segment.end-offer.segment.start))+'s':'';
        const label='Skip possible sponsor'+(duration?' · '+duration:'');
        if(existing){if(existing.textContent!==label)existing.textContent=label;return;}
        const button=this.button(label,()=>this.offer?.skip());button.className='ss-manual-offer';button.setAttribute('aria-label',label);this.root.appendChild(button);
    }
    clearNotice(){this.noticeTimer?.cancel();this.noticeTimer=null;const notice=this.root?.querySelector('.ss-skip-notice');if(notice?.contains?.(this.doc.activeElement))this.focusControl();notice?.remove();}
    highlights(segments,duration) {
        this.lastSegments=segments;this.lastDuration=duration;
        const bar=this.player?.querySelector('.ytp-progress-bar')||this.doc.querySelector('.ytp-progress-bar');
        const signature=JSON.stringify([duration,segments.map(s=>[s.start,s.end,this.behavior(s)])]);
        if(bar===this.bar&&signature===this.markerSignature)return;
        this.unbindBar();this.bar=bar;this.markerSignature=signature;if(!bar||!Number.isFinite(duration)||duration<=0)return;
        for(const segment of segments){const marker=this.doc.createElement('div');marker.className='ss-highlight'+(['rejected','replay'].includes(this.behavior(segment))?' ss-muted':'');marker.setAttribute('aria-hidden','true');
            marker.style.left=100*Math.min(segment.start,duration)/duration+'%';marker.style.width=100*(Math.min(segment.end,duration)-Math.min(segment.start,duration))/duration+'%';bar.appendChild(marker);}
        this.hoverHandler=event=>{const r=bar.getBoundingClientRect(),time=(event.clientX-r.left)/r.width*duration;
            const segment=segments.find(s=>s.start<=time&&time<=s.end);this.label.hidden=!segment;
            if(segment){const label='Estimated sponsor '+rangeText(segment)+' · '+behaviorText(this.behavior(segment));if(this.label.textContent!==label)this.label.textContent=label;}};
        this.leaveHandler=()=>{this.label.hidden=true;};bar.addEventListener('pointermove',this.hoverHandler);bar.addEventListener('pointerleave',this.leaveHandler);
    }
    unbindBar(){if(this.bar){this.bar.removeEventListener('pointermove',this.hoverHandler);this.bar.removeEventListener('pointerleave',this.leaveHandler);}
        this.doc.querySelectorAll('.ss-highlight').forEach(element=>element.remove());this.bar=null;if(this.label)this.label.hidden=true;}
    destroy(){this.clearNotice();this.unbindBar();this.player?.removeEventListener('keydown',this.keyHandler);this.control?.remove();this.control=null;this.controlAnchor=null;this.root?.remove();this.root=null;this.player=null;this.intervalSignature=null;this.markerSignature=null;}
}
