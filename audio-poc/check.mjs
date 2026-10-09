// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const directory=fileURLToPath(new URL('./',import.meta.url));
for(const name of readdirSync(directory).filter(name=>/\.(m?js)$/.test(name))){const result=spawnSync(process.execPath,['--check',path.join(directory,name)],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);}
const manifest=JSON.parse(readFileSync(path.join(directory,'manifest.json'),'utf8'));
assert.equal(manifest.minimum_chrome_version,'116');assert.deepEqual(manifest.permissions,['activeTab','tabCapture','offscreen']);assert.equal(manifest.host_permissions,undefined);
assert.ok(manifest.content_security_policy.extension_pages.includes("connect-src 'self'"));
const lock=JSON.parse(readFileSync(new URL('../package-lock.json',import.meta.url),'utf8'));
assert.equal(lock.packages['node_modules/@xenova/transformers'].version,'2.17.2');
const spec=JSON.parse(readFileSync(path.join(directory,'model-spec.json'),'utf8'));
assert.equal(spec.quantized,true);assert.equal(spec.files.length,7);assert.match(spec.revision,/^[a-f0-9]{40}$/);
for(const file of spec.files){assert.match(file.sha256,/^[a-f0-9]{64}$/);assert.ok(file.size>0&&file.size<32*1024**2);}
console.log('Audio experiment source, permissions and artifact contract checked. No model inference.');
