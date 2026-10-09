import {readdir,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,readJson} from './lib.mjs';
import {validateFixture,validateManifest} from './contracts.mjs';
async function walk(dir) {
 const entries=await readdir(dir,{withFileTypes:true});let files=[];
 for(const entry of entries) {
  if(['assets','local','results','vendor'].includes(entry.name))continue;
  const file=path.join(dir,entry.name);if(entry.isDirectory())files.push(...await walk(file));else if(/\.(m?js)$/.test(entry.name))files.push(file);
 }
 return files;
}
for(const file of await walk(path.join(root,'bench'))) {
 const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
}
for(const file of ['bench/datasets/pilot.json','bench/datasets/synthetic.json','bench/datasets/published-smoke.json','bench/datasets/long-smoke.json'])validateManifest(await readJson(file));
for(const name of await readdir(path.join(root,'bench/fixtures')))validateFixture(await readJson('bench/fixtures/'+name));
const registry=await readJson('bench/models.json');
assert.equal(new Set(registry.models.map(m=>m.id)).size,registry.models.length);
for(const model of registry.models) {
 if(model.files.length)assert.match(model.revision,/^[a-f0-9]{40}$/);
 for(const file of model.files){assert.match(file.sha256,/^[a-f0-9]{64}$/);assert.ok(file.size>0);assert.ok(!file.path.includes('..'));}
}
console.log('Benchmark sources, contracts, manifests and artifact pins validated. No inference.');
