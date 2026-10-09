import{spawn}from'node:child_process';import{mkdtemp,rm,mkdir}from'node:fs/promises';import{fileURLToPath}from'node:url';
export async function nativeChrome(mode){
 const local=fileURLToPath(new URL('../../bench/local/',import.meta.url));await mkdir(local,{recursive:true});
 const profile=await mkdtemp(local+'extension-');
 const flags=['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-sync','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--no-startup-window','--enable-automation','--enable-unsafe-extension-debugging','--window-size=1280,900','--user-data-dir='+profile];
 if(mode==='cpu')flags.push('--disable-gpu','--disable-software-rasterizer');
 const proc=spawn(process.env.BENCH_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',flags,{stdio:['ignore','ignore','pipe']});
 const close=async()=>{proc.kill('SIGTERM');await Promise.race([new Promise(r=>proc.once('exit',r)),new Promise(r=>setTimeout(r,3000))]);if(proc.exitCode===null&&proc.signalCode===null)proc.kill('SIGKILL');await rm(profile,{recursive:true,force:true});};
 try{const endpoint=await new Promise((resolve,reject)=>{let logs='';const timer=setTimeout(()=>reject(Error('Native Chrome startup timeout')),20000);proc.stderr.on('data',data=>{logs=(logs+data).slice(-16000);const match=logs.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});proc.once('error',reject);});return{endpoint,flags,close};}
 catch(e){await close();throw e;}
}
