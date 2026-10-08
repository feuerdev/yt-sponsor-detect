import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {lockTestExposure} from '../bench/test-exposure-lock.mjs';import {hash} from '../bench/lib.mjs';
const frozen={selectionHash:'new-selection',fixtureSetHash:'new-fixtures',models:{'ettin-int8/webgpu':{config:{threshold:.8}}}};
async function temporary(t){const dir=await mkdtemp(path.join(os.tmpdir(),'sponsor-exposure-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
const lock=(file,runId='gpu-run',config=frozen)=>lockTestExposure({file,runId,frozen:config,selectionHash:config.selectionHash,at:'2026-10-08T13:00:00Z'});
test('fresh exposure uses a separate ledger and leaves original history byte-identical',async t=>{
 const dir=await temporary(t),original=path.join(dir,'old.json'),fresh=path.join(dir,'fresh.json'),old='{"frozenHash":"old-lock","firstTestAt":"2026-10-07T00:00:00Z"}\n';await writeFile(original,old);
 await lock(fresh);assert.equal(await readFile(original,'utf8'),old);const ledger=JSON.parse(await readFile(fresh));assert.equal(ledger.frozenHash,hash(frozen));assert.equal(ledger.selectionHash,'new-selection');assert.equal(ledger.firstTestAt,'2026-10-08T13:00:00Z');assert.deepEqual(ledger.attempts,[{runId:'gpu-run',at:'2026-10-08T13:00:00Z',phase:'before-inference'}]);
});
test('subsequent backend attempts retain the first exposure and all earlier events',async t=>{
 const file=path.join(await temporary(t),'fresh.json');await lock(file);await lockTestExposure({file,runId:'cpu-run',frozen,selectionHash:'new-selection',at:'2026-10-08T14:00:00Z'});const l=JSON.parse(await readFile(file));assert.equal(l.firstTestAt,'2026-10-08T13:00:00Z');assert.deepEqual(l.attempts.map(a=>a.runId),['gpu-run','cpu-run']);
});
test('changed config or selection cannot erase an exposed ledger',async t=>{
 const file=path.join(await temporary(t),'fresh.json');await lock(file);const before=await readFile(file,'utf8');
 await assert.rejects(lock(file,'new-run',{...frozen,fixtureSetHash:'changed'}),/fresh holdout/i);
 await assert.rejects(lockTestExposure({file,runId:'new-run',frozen,selectionHash:'different-selection'}),/selection/i);assert.equal(await readFile(file,'utf8'),before);
});
test('corrupt existing history fails closed instead of treating it as a new cohort',async t=>{
 const file=path.join(await temporary(t),'fresh.json');await writeFile(file,'{broken');await assert.rejects(lock(file),/JSON|property|Unexpected/i);assert.equal(await readFile(file,'utf8'),'{broken');
});
test('legacy history and extra provenance survive compatible attempts',async t=>{
 const file=path.join(await temporary(t),'legacy.json');await writeFile(file,JSON.stringify({frozenHash:hash(frozen),selectionHash:'new-selection',firstTestAt:'2026-10-07T00:00:00Z',policy:'Original policy',reviewNote:'Keep this historical note'}));await lock(file);const l=JSON.parse(await readFile(file));assert.equal(l.firstTestAt,'2026-10-07T00:00:00Z');assert.equal(l.reviewNote,'Keep this historical note');assert.equal(l.policy,'Original policy');
});
test('invalid or reused run identities cannot append a misleading new exposure',async t=>{
 const file=path.join(await temporary(t),'fresh.json');await assert.rejects(lock(file,''),/run/i);await lock(file);const before=await readFile(file,'utf8');await assert.rejects(lock(file),/duplicate|already/i);assert.equal(await readFile(file,'utf8'),before);
});
