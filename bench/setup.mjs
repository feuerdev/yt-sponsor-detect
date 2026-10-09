import {readFile,writeFile,mkdir,copyFile,stat} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {args,root,readJson,save,hash} from './lib.mjs';
import {installAssets,verifyAssets} from '../scripts/model-assets.mjs';
const options=args(),registry=await readJson('bench/models.json');
const selected=(options.models||'mobilebert-fp32,mobilebert-int8,ettin-int8,ettin-fp32,sponsorskip-base').split(',');
const vendor=path.join(root,'bench/browser/vendor');await mkdir(vendor,{recursive:true});
// Runtime stays local, including both WASM generations. No CDN code.
const source=path.join(root,'node_modules/@xenova/transformers/dist');
await mkdir(path.join(vendor,'xenova'),{recursive:true});
for(const file of ['transformers.min.js','ort-wasm-simd.wasm','ort-wasm.wasm'])await copyFile(path.join(source,file),path.join(vendor,'xenova',file));
const ort=path.join(root,'node_modules/bench-ort/dist');
await mkdir(path.join(vendor,'ort'),{recursive:true});
for(const file of ['ort.webgpu.bundle.min.mjs','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm','ort-wasm-simd-threaded.jsep.mjs','ort-wasm-simd-threaded.jsep.wasm','ort-wasm-simd-threaded.asyncify.mjs','ort-wasm-simd-threaded.asyncify.wasm','ort-wasm-simd-threaded.jspi.mjs','ort-wasm-simd-threaded.jspi.wasm'])await copyFile(path.join(ort,file),path.join(vendor,'ort',file));
await copyFile(path.join(root,'node_modules/@xenova/transformers/LICENSE'),path.join(vendor,'xenova/LICENSE'));
// The ORT npm tarball omits LICENSE; preserve Microsoft's verified MIT text in reference/.
await copyFile(path.join(root,'bench/reference/ONNX-RUNTIME-LICENSE'),path.join(vendor,'ort/LICENSE'));
const tok=JSON.parse(await readFile(path.join(root,'node_modules/@huggingface/tokenizers/package.json'),'utf8'));
await copyFile(path.join(root,'node_modules/@huggingface/tokenizers',tok.module||'dist/tokenizers.mjs'),path.join(vendor,'tokenizers.mjs'));
await copyFile(path.join(root,'node_modules/@huggingface/tokenizers/LICENSE'),path.join(vendor,'TOKENIZERS-LICENSE'));
let ss=await readFile(path.join(root,'bench/reference/sponsorskip-detector.ts'),'utf8');
if(hash(ss)!=='c19db9de15b928f1d93010bbc4e493939dfa412bb224b8845f0588371af0dea1')throw new Error('Upstream SponsorSkip source hash changed');
ss=ss.replace('"onnxruntime-web/webgpu"','"./ort/ort.webgpu.bundle.min.mjs"').replace('"@huggingface/tokenizers"','"./tokenizers.mjs"').replace('"./modelStore"','"../sponsorskip-store.mjs"').replaceAll('chrome.runtime.getURL("ort/")','new URL("./ort/",import.meta.url).href').replaceAll('chrome.runtime.getURL("models")','new URL("../../assets/sponsorskip-base",import.meta.url).href');
await writeFile(path.join(vendor,'sponsorskip.mjs'),stripTypeScriptTypes(ss,{mode:'strip'}));
const metadata={at:new Date().toISOString(),registryHash:hash(registry),runtime:{xenova:JSON.parse(await readFile(path.join(root,'node_modules/@xenova/transformers/package.json'),'utf8')).version,ort:JSON.parse(await readFile(path.join(root,'node_modules/bench-ort/package.json'),'utf8')).version,tokenizers:tok.version},models:[]};
for(const id of selected) {
 const spec=registry.models.find(m=>m.id===id);if(!spec)throw new Error('Unknown model '+id);
 if(!spec.files.length)continue;
 // Reuse existing verified production FP32 weights via hardlinks; no duplicate graph.
 if(id==='mobilebert-fp32') {
  const existing=path.join(root,'model',spec.directory);
  try {await verifyAssets(existing,spec);const {link}=await import('node:fs/promises');const target=path.join(root,'bench/assets',spec.directory);await mkdir(target,{recursive:true});
   for(const file of spec.files){const out=path.join(target,file.path);await mkdir(path.dirname(out),{recursive:true});try{await link(path.join(existing,file.path),out);}catch(e){if(e.code!=='EEXIST')throw e;}}}catch(e){if(e.code!=='ENOENT')throw e;}
 }
 console.log('Verify/download',id);
 await installAssets(path.join(root,'bench/assets'),spec);
 metadata.models.push({id,revision:spec.revision,bytes:spec.files.reduce((n,f)=>n+f.size,0),files:spec.files});
 await save('bench/local/setup.json',metadata);
}
console.log('Pinned local assets ready. Inference has not run.');
