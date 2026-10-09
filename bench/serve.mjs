import http from 'node:http';
import {createReadStream} from 'node:fs';
import {stat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {root} from './lib.mjs';
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.css':'text/css','.wasm':'application/wasm','.onnx':'application/octet-stream'};
export async function staticResponse(req,res) {
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;
 let filename=path.resolve(root,'.'+decodeURIComponent(pathname==='/'?'/bench/browser/index.html':pathname));
 const permitted=[path.join(root,'bench'),path.join(root,'model')];
 try {
  filename=await realpath(filename);if(!permitted.some(p=>filename.startsWith(p+path.sep)))throw new Error('Forbidden');
  const info=await stat(filename);if(!info.isFile())throw new Error('Not a file');
  res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream','Content-Length':info.size,'Cache-Control':'no-store',
   'Content-Security-Policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:"});
  const stream=createReadStream(filename);res.on('close',()=>stream.destroy());stream.on('error',()=>res.destroy());stream.pipe(res);
 }catch{res.writeHead(404);res.end('Not found');}
}
export const createServer=handler=>http.createServer((req,res)=>Promise.resolve(handler(req,res)).catch(()=>{res.writeHead(500);res.end('Local benchmark error');}));
if(process.argv[1]===new URL(import.meta.url).pathname) {
 const server=createServer(staticResponse);server.listen(8765,'127.0.0.1',()=>console.log('Report/runner server: http://127.0.0.1:8765'));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());
}
