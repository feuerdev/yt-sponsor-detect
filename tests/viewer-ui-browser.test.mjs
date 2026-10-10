// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {launchChrome} from '../bench/chrome.mjs';
import {requireHeadroom,resourcePolicy} from '../bench/resources.mjs';

test('manual Skip receives a native mouse click with production player CSS',{skip:!process.env.BENCH_CHROME},async()=>{
    const policy=resourcePolicy({'memory-budget':process.env.BENCH_MEMORY_BUDGET??700,'minimum-available':process.env.BENCH_MIN_AVAILABLE??768});
    await requireHeadroom(policy);
    const directory=await mkdtemp(path.join(os.tmpdir(),'viewer-ui-test-'));
    const html=`<!doctype html><html><head><link rel="stylesheet" href="/viewer.css"><style>
        #movie_player{position:relative;width:760px;height:430px;background:#162a40}
        </style></head><body><div id="movie_player"></div><script type="module">
        import {PlayerUI} from '/viewer/ui.js';
        window.skips=0;window.playerClicks=0;window.trustedClick=false;
        const player=document.querySelector('#movie_player');
        player.addEventListener('click',event=>{window.playerClicks++;window.trustedClick=event.isTrusted;});
        const ui=new PlayerUI(document);ui.bind(player);ui.state({status:'ready',segments:[{start:10,end:20,category:'sponsor'}]});
        ui.suggest({skip:()=>{window.skips++;}});window.viewerReady=true;
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
    } finally {
        if(browser)await browser.close();
        if(server.listening)await new Promise(resolve=>server.close(resolve));
        await rm(directory,{recursive:true,force:true});
    }
});
