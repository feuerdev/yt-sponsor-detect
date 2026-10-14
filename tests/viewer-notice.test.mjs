import test from 'node:test';import assert from 'node:assert/strict';import {NoticeTimer} from '../src/viewer/ui.js';
function fixture(){let time=0,serial=0,expired=0;const tasks=new Map();const timers={setTimeout:(fn,delay)=>{tasks.set(++serial,{fn,at:time+delay});return serial;},clearTimeout:id=>tasks.delete(id)};
 const timer=new NoticeTimer(()=>expired++,{timers,clock:()=>time});return {timer,tasks,get expired(){return expired;},advance(ms){time+=ms;for(const [id,task] of [...tasks])if(task.at<=time){tasks.delete(id);task.fn();}}};}
test('Undo notice expires after eight unpaused seconds, with independent hover and focus holds',()=>{
 const f=fixture();f.advance(3000);f.timer.hold('hover',true);f.advance(10000);assert.equal(f.expired,0);
 f.timer.hold('focus',true);f.timer.hold('hover',false);f.advance(10000);assert.equal(f.expired,0);
 f.timer.hold('focus',false);f.advance(4999);assert.equal(f.expired,0);f.advance(1);assert.equal(f.expired,1);
});
test('replacing or cancelling a notice releases its expiry timer',()=>{const f=fixture();f.timer.cancel();f.advance(9000);assert.equal(f.expired,0);assert.equal(f.tasks.size,0);});
