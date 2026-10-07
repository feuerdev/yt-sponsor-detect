// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {launchChrome} from '../bench/chrome.mjs';
import {requireHeadroom,resourcePolicy} from '../bench/resources.mjs';
test('Chrome controller sends trusted clicks and removes its isolated profile after close',{skip:!process.env.BENCH_CHROME},async()=>{
 const policy=resourcePolicy({'memory-budget':process.env.BENCH_MEMORY_BUDGET??700,'minimum-available':process.env.BENCH_MIN_AVAILABLE??768});
 await requireHeadroom(policy);const dir=await mkdtemp(path.join(os.tmpdir(),'bench-chrome-test-'));
 const server=createServer((req,res)=>res.end('<button style="position:absolute;left:10px;top:10px;width:100px;height:50px" onclick="window.clicked=event.isTrusted">click</button>'));await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{browser=await launchChrome({executable:process.env.BENCH_CHROME,profileParent:dir,url:`http://127.0.0.1:${server.address().port}`,readyExpression:'document.readyState==="complete"',onSample:()=>requireHeadroom(policy)});await browser.clickAt(50,30);assert.equal(await browser.eval('window.clicked'),true);await browser.close();assert.deepEqual(await readdir(dir),[]);}
 finally{if(browser)await browser.close();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
test('a stalled CDP evaluation times out and leaves browser cleanup usable',{skip:!process.env.BENCH_CHROME},async()=>{
 const policy=resourcePolicy({'memory-budget':process.env.BENCH_MEMORY_BUDGET??700,'minimum-available':process.env.BENCH_MIN_AVAILABLE??768});await requireHeadroom(policy);
 const dir=await mkdtemp(path.join(os.tmpdir(),'bench-chrome-timeout-'));let browser;
 try {
  browser=await launchChrome({executable:process.env.BENCH_CHROME,profileParent:dir,url:'about:blank',readyExpression:'true',commandTimeoutMs:1000,onSample:()=>requireHeadroom(policy)});
  await assert.rejects(browser.eval('new Promise(()=>{})'),/CDP timeout/);
  assert.equal(await browser.eval('1+1'),2);
  await browser.close();assert.deepEqual(await readdir(dir),[]);
 }finally{if(browser)await browser.close();await rm(dir,{recursive:true,force:true});}
});
