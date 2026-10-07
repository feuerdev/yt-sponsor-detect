import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {args,root,save} from './lib.mjs';
import {createServer,staticResponse} from './serve.mjs';
import {launchChrome} from './chrome.mjs';
import {requireHeadroom,resources} from './resources.mjs';
const options=args();if(!options.chrome)throw new Error('--chrome executable required');
const before=await requireHeadroom(),result={at:new Date().toISOString(),before,peakAccountMiB:before.accountMiB,status:'not_run',purpose:'WebGPU adapter capability only; no inference/weights'};
const server=createServer(staticResponse);let browser;
try {
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await launchChrome({executable:options.chrome,profileParent:path.join(root,'bench/local'),url:`http://127.0.0.1:${server.address().port}/bench/browser/gpu-probe.html`,singleProcess:!!options['single-process'],cpuOnly:false,onSample:async()=>{const m=await resources();result.peakAccountMiB=Math.max(result.peakAccountMiB,m.accountMiB);if(m.accountMiB>700||m.availableMiB<768){result.status='resource_deferred';throw new Error('Conservative resource guard');}}});
 result.flags=browser.flags;result.browser=browser.version;result.probe=await browser.eval('window.probeGPU()');result.status=result.probe.usableAdapter?'adapter_available_graph_untested':'unsupported_backend';
 await writeFile(path.join(root,'bench/local/gpu-probe.png'),await browser.screenshot());
}catch(e){if(result.status!=='resource_deferred')result.status='probe_failure';result.reason=String(e.message).slice(0,1000);}
finally{if(browser)await browser.close();await new Promise(r=>server.close(r));await save('bench/local/gpu-probe.json',result);console.log(JSON.stringify(result,null,2));}
