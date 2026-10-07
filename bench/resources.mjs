// SPDX-License-Identifier: GPL-3.0-or-later
import {readdir,readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export function resourcePolicy(options={}) {
 const policy={maximumAccountMiB:Number(options['memory-budget']??700),minimumAvailableMiB:Number(options['minimum-available']??768)};
 if(Object.values(policy).some(v=>!Number.isFinite(v)||v<=0))throw new Error('Resource limits must be finite positive MiB');
 return policy;
}
export function assertHeadroom(r,policy=resourcePolicy()) {
 if(!Number.isFinite(r.availableMiB)||!Number.isFinite(r.accountMiB)||r.accountMiB<=0||r.availableMiB<policy.minimumAvailableMiB||r.accountMiB>policy.maximumAccountMiB)throw new Error(`Insufficient or unavailable headroom: ${JSON.stringify({sample:r,policy})}`);
 return r;
}
export function parseDarwinResources(memory,processTable,uid) {
 const pageSize=Number(memory.match(/page size of (\d+) bytes/)?.[1]);
 const pages=['free','inactive','speculative'].map(name=>Number(memory.match(new RegExp(`^Pages ${name}:\\s+(\\d+)\\.`, 'm'))?.[1]));
 let kib=0,processes=0;
 for(const line of processTable.trim().split('\n')) {
  const match=line.match(/^\s*(-?\d+)\s+(\d+)\s+(\d+)\s*$/);
  if(!match)throw new Error('Invalid ps memory sample');
  if(Number(match[1])===uid){kib+=Number(match[3]);processes++;}
 }
 if(!Number.isFinite(pageSize)||pageSize<=0||pages.some(v=>!Number.isFinite(v))||!processes||kib<=0)throw new Error('Native macOS resource measurement unavailable');
 return {availableMiB:pages.reduce((a,b)=>a+b,0)*pageSize/2**20,accountMiB:kib/1024,processes,method:'RSS sum (ps KiB); vm_stat native pages',scope:'same-UID process RSS including unrelated apps and shared-page duplication; host availability proxy = free + inactive + speculative pages, not guaranteed allocatable memory; purgeable pages not added twice',platform:'darwin'};
}
export async function resources() {
 if(process.platform==='darwin') {
  const [memory,table]=await Promise.all([exec('/usr/bin/vm_stat',[],{timeout:5000}),exec('/bin/ps',['-axo','uid=,pid=,rss='],{timeout:5000,maxBuffer:4*1024*1024})]);
  return parseDarwinResources(memory.stdout,table.stdout,process.getuid());
 }
 if(process.platform!=='linux')throw new Error(`Native resource monitoring unsupported on ${process.platform}`);
 const memory=await readFile('/proc/meminfo','utf8');const available=Number(memory.match(/^MemAvailable:\s+(\d+)/m)?.[1])/1024;
 let kib=0,processes=0,method='PSS';
 for(const pid of (await readdir('/proc')).filter(x=>/^\d+$/.test(x))) {
  try {
   const status=await readFile(`/proc/${pid}/status`,'utf8');if(Number(status.match(/^Uid:\s+(\d+)/m)?.[1])!==process.getuid())continue;
   let value;
   try{value=Number((await readFile(`/proc/${pid}/smaps_rollup`,'utf8')).match(/^Pss:\s+(\d+)/m)?.[1]);}catch{value=Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1])||0;method='PSS with RSS fallback';}
   kib+=value;processes++;
  }catch{/* Process ended between samples. */}
 }
 return {availableMiB:available,accountMiB:kib/1024,processes,method,scope:'same-UID processes visible in current /proc namespace; host watchdog may observe additional processes',platform:'linux'};
}
export async function requireHeadroom(policy=resourcePolicy()) {
 // Preserve the earlier numeric-budget interface for external callers.
 return assertHeadroom(await resources(),typeof policy==='number'?resourcePolicy({'memory-budget':policy}):policy);
}
