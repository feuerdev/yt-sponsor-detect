// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {launchChrome} from '../bench/chrome.mjs';
import {requireHeadroom,resourcePolicy} from '../bench/resources.mjs';

test('production player supports native Skip/Undo clicks, timeline hover, keyboard controls, narrow layout and fullscreen',{skip:!process.env.BENCH_CHROME},async()=>{
    const policy=resourcePolicy({'memory-budget':process.env.BENCH_MEMORY_BUDGET??700,'minimum-available':process.env.BENCH_MIN_AVAILABLE??768});
    await requireHeadroom(policy);
    const directory=await mkdtemp(path.join(os.tmpdir(),'viewer-ui-test-'));
    const html=`<!doctype html><html><head><link rel="stylesheet" href="/viewer.css"><style>
        #movie_player{position:relative;width:min(760px,100%);height:430px;background:#162a40}.ytp-progress-bar{position:absolute;bottom:35px;left:0;width:100%;height:8px;background:#f00}.ytp-right-controls{position:absolute;bottom:0;right:0;height:30px}.ytp-button{height:30px;min-width:35px}
        </style></head><body><div id="movie_player"><div class="ytp-progress-bar"></div><div class="ytp-right-controls"><button class="ytp-fullscreen-button">Fullscreen</button></div></div><script type="module">
        import {PlayerUI} from '/viewer/ui.js';
        window.skips=0;window.playerClicks=0;window.trustedClick=false;
        const player=document.querySelector('#movie_player');
        player.addEventListener('click',event=>{window.playerClicks++;window.trustedClick=event.isTrusted;},true);
        const ui=new PlayerUI(document);ui.bind(player);ui.state({status:'ready',segments:[{start:10,end:20,category:'sponsor'}]});
        ui.suggest({skip:()=>{window.skips++;}});window.ui=ui;ui.highlights([{start:10,end:20,category:'sponsor'}],120);
        document.querySelector('.ytp-fullscreen-button').onclick=()=>player.requestFullscreen();window.viewerReady=true;
        </script></body></html>`;
    const files=new Map(['/viewer.css','/viewer/ui.js','/viewer/settings.js'].map(name=>[name,new URL('../src'+name,import.meta.url)]));
    const server=createServer(async(req,res)=>{
        if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
        const file=files.get(req.url);if(!file){res.writeHead(404);res.end();return;}
        try{res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'text/javascript');res.end(await readFile(file));}
        catch{res.writeHead(500);res.end();}
    });
    let browser;
    try {
        await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
        browser=await launchChrome({executable:process.env.BENCH_CHROME,profileParent:directory,
            url:`http://127.0.0.1:${server.address().port}`,readyExpression:'window.viewerReady===true',onSample:()=>requireHeadroom(policy)});
        const point=await browser.eval(`(()=>{const r=document.querySelector('.ss-manual-offer').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
        await browser.clickAt(point.x,point.y);
        assert.equal(await browser.eval('window.trustedClick'),true,'The regression requires a real mouse click');
        assert.equal(await browser.eval('window.skips'),1,'The visible manual Skip button must receive the click');
        const click=async selector=>{const p=await browser.eval(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await browser.clickAt(p.x,p.y);};
        await browser.eval("ui.suggest(null);ui.state({status:'ready',mode:'automatic',segments:[]});true");
        assert.equal(await browser.eval("document.querySelector('.ss-status').getBoundingClientRect().width"),0,'Routine status stays inside closed panel');
        const hover=await browser.eval("(()=>{const r=document.querySelector('.ytp-progress-bar').getBoundingClientRect();return {x:r.x+r.width*15/120,y:r.y+r.height/2};})()");
        await browser.command('Input.dispatchMouseEvent',{type:'mouseMoved',...hover});
        assert.match(await browser.eval("document.querySelector('.ss-marker-label').textContent"),/00:10–00:20/);
        assert.equal(await browser.eval(`document.elementFromPoint(${hover.x},${hover.y}).className`),'ytp-progress-bar','Markers must not intercept native seeking');
        await click('.ss-control');assert.equal(await browser.eval("document.activeElement.getAttribute('aria-label')"),'Sponsor detection mode');
        await browser.command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
        assert.equal(await browser.eval("document.querySelector('.ss-controls-panel').hidden"),true);assert.equal(await browser.eval("document.activeElement.classList.contains('ss-control')"),true);
        await browser.eval("window.undos=0;ui.skipped({seconds:5,undo:()=>{window.undos++;return true;}});true");
        await click('.ss-skip-notice button');assert.equal(await browser.eval('window.undos'),1);assert.equal(await browser.eval("document.activeElement.classList.contains('ss-control')"),true);
        await browser.command('Emulation.setDeviceMetricsOverride',{width:390,height:700,deviceScaleFactor:1,mobile:false});await click('.ss-control');
        assert.equal(await browser.eval("(()=>{const r=document.querySelector('.ss-controls-panel').getBoundingClientRect();return r.x>=0&&r.right<=390;})()"),true,'Narrow panel stays inside viewport');
        await click('.ss-control');await click('.ytp-fullscreen-button');
        assert.equal(await browser.eval("document.fullscreenElement?.id"),'movie_player');await click('.ss-control');assert.equal(await browser.eval("document.querySelector('.ss-controls-panel').hidden"),false);
        await browser.command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
        assert.equal(await browser.eval("document.querySelector('.ss-controls-panel').hidden"),true);await browser.eval("document.exitFullscreen();true");
    } finally {
        if(browser)await browser.close();
        if(server.listening)await new Promise(resolve=>server.close(resolve));
        await rm(directory,{recursive:true,force:true});
    }
});
