import {readdir,readFile} from 'node:fs/promises';
export async function resources() {
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
 return {availableMiB:available,accountMiB:kib/1024,processes,method,scope:'same-UID processes visible in current /proc namespace; host watchdog may observe additional processes'};
}
export async function requireHeadroom(budget=700) {
 const r=await resources();if(r.availableMiB<768||r.accountMiB>budget)throw new Error(`Insufficient headroom: ${JSON.stringify(r)}`);return r;
}
