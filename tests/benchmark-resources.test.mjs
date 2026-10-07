// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import * as resource from '../bench/resources.mjs';
import * as chrome from '../bench/chrome.mjs';
const vm='Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free: 100.\nPages inactive: 200.\nPages speculative: 20.\nPages purgeable: 50.\n';
test('macOS sampling uses native page units and same-UID RSS without double-counting purgeable pages',()=>{
 const r=resource.parseDarwinResources(vm,'501 123 1024\n-2 456 2048\n501 789 2048\n',501);
 assert.equal(r.availableMiB,5);assert.equal(r.accountMiB,3);assert.equal(r.processes,2);
 assert.match(r.method,/RSS/);assert.match(r.scope,/inactive/);
});
test('missing native measurements fail closed instead of passing guards',()=>{
 assert.throws(()=>resource.parseDarwinResources('unsupported format','501 123 1024',501));
 assert.throws(()=>resource.parseDarwinResources(vm,'',501));
 for(const sample of [{availableMiB:NaN,accountMiB:1},{availableMiB:5000,accountMiB:NaN}])assert.throws(()=>resource.assertHeadroom(sample,{maximumAccountMiB:700,minimumAvailableMiB:768}));
});
test('explicit larger-host policy preserves Linux defaults and rejects invalid budgets',()=>{
 assert.deepEqual(resource.resourcePolicy({}),{maximumAccountMiB:700,minimumAvailableMiB:768});
 const policy=resource.resourcePolicy({'memory-budget':'28672','minimum-available':'4096'});
 assert.doesNotThrow(()=>resource.assertHeadroom({accountMiB:23000,availableMiB:8000},policy));
 assert.throws(()=>resource.assertHeadroom({accountMiB:23000,availableMiB:4000},policy));
 assert.throws(()=>resource.resourcePolicy({'memory-budget':'NaN'}));
});
test('representative macOS launches preserve sandbox and normal multiprocess graphics defaults',()=>{
 const flags=chrome.chromeFlags({platform:'darwin',profile:'/private/tmp/test'});
 assert.ok(!flags.includes('--no-sandbox'));assert.ok(!flags.some(x=>x.startsWith('--renderer-process-limit')));
 assert.ok(!flags.includes('--single-process'));assert.ok(!flags.includes('--disable-gpu'));
 assert.ok(chrome.chromeFlags({platform:'linux',profile:'/tmp/test',cpuOnly:true}).includes('--disable-gpu'));
});
