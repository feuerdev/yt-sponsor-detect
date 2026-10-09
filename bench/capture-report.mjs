import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {args,root,save} from './lib.mjs';
import {createServer,staticResponse} from './serve.mjs';
import {launchChrome} from './chrome.mjs';
import {resources,requireHeadroom,resourcePolicy,assertHeadroom} from './resources.mjs';
const options=args();const policy=resourcePolicy(options);
function hasHeadroom(sample){try{assertHeadroom(sample,policy);return true;}catch{return false;}}
if(!options.chrome)throw new Error('--chrome required');
const before=await requireHeadroom(policy),record={policy,before,peakAccountMiB:before.accountMiB,purpose:'Report rendering only; no model inference'};
const server=createServer(staticResponse);let browser;
try {
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await launchChrome({executable:options.chrome,profileParent:path.join(root,'bench/local'),url:`http://127.0.0.1:${server.address().port}/bench/results/report/index.html`,singleProcess:!!options['single-process'],readyExpression:'document.readyState === "complete"',onSample:async()=>{const r=await resources();record.peakAccountMiB=Math.max(record.peakAccountMiB,r.accountMiB);if(!hasHeadroom(r))throw new Error('Conservative resource guard');}});
 record.browser=browser.version;record.flags=browser.flags;record.title=await browser.eval('document.title');
 record.styles=await browser.eval('({background:getComputedStyle(document.body).backgroundColor,font:getComputedStyle(document.body).fontFamily})');
 if(record.styles.background!=='rgb(12, 20, 32)')throw new Error('Report stylesheet did not load');
 let screenshot;
 if(options['full-page']){const layout=await browser.command('Page.getLayoutMetrics'),size=layout.cssContentSize??layout.contentSize;record.pageSize=size;const height=Math.min(size.height,8000);record.truncated=size.height>height;screenshot=Buffer.from((await browser.command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:1200,height,scale:1}})).data,'base64');}
 else screenshot=await browser.screenshot();
 await writeFile(path.join(root,'bench/results/report/report.png'),screenshot);record.status='captured';
}catch(e){record.status='unavailable';record.error=String(e.message).slice(0,1000);}
finally{if(browser)await browser.close();await new Promise(r=>server.close(r));await save('bench/results/report/screenshot-evidence.json',record);console.log(JSON.stringify(record,null,2));}
