import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {args,root,save} from './lib.mjs';
import {createServer,staticResponse} from './serve.mjs';
import {launchChrome} from './chrome.mjs';
import {resources,requireHeadroom} from './resources.mjs';
const options=args();if(!options.chrome)throw new Error('--chrome required');
const before=await requireHeadroom(),record={before,peakAccountMiB:before.accountMiB,purpose:'Report rendering only; no model inference'};
const server=createServer(staticResponse);let browser;
try {
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await launchChrome({executable:options.chrome,profileParent:path.join(root,'bench/local'),url:`http://127.0.0.1:${server.address().port}/bench/results/report/index.html`,singleProcess:!!options['single-process'],readyExpression:'document.readyState === "complete"',onSample:async()=>{const r=await resources();record.peakAccountMiB=Math.max(record.peakAccountMiB,r.accountMiB);if(r.accountMiB>700||r.availableMiB<768)throw new Error('Conservative resource guard');}});
 record.browser=browser.version;record.flags=browser.flags;record.title=await browser.eval('document.title');
 await writeFile(path.join(root,'bench/results/report/report.png'),await browser.screenshot());record.status='captured';
}catch(e){record.status='unavailable';record.error=String(e.message).slice(0,1000);}
finally{if(browser)await browser.close();await new Promise(r=>server.close(r));await save('bench/results/report/screenshot-evidence.json',record);console.log(JSON.stringify(record,null,2));}
