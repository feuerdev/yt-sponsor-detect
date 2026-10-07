import path from 'node:path';
import {fileURLToPath} from 'node:url';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import CopyPlugin from 'copy-webpack-plugin';
import {MODEL_SPEC} from './src/model-spec.js';
const root=path.dirname(fileURLToPath(import.meta.url));
export default {
 mode:'development',devtool:'source-map',
 entry:{background:'./src/background.js',popup:'./src/popup.js',content:'./src/content.js',offscreen:'./src/offscreen.js','inference-worker':'./src/inference-worker.js'},
 output:{path:path.join(root,'dist'),filename:'[name].js',clean:true},
 plugins:[new HtmlWebpackPlugin({template:'./src/popup.html',filename:'popup.html',chunks:['popup']}),new CopyPlugin({patterns:[
  {from:`model/${MODEL_SPEC.directory}`,to:`model/${MODEL_SPEC.directory}`},
  {from:'src/manifest.json',to:'manifest.json'},{from:'src/offscreen.html',to:'offscreen.html'},
  ...['ort.webgpu.bundle.min.mjs','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm','ort-wasm-simd-threaded.jsep.mjs','ort-wasm-simd-threaded.jsep.wasm','ort-wasm-simd-threaded.asyncify.mjs','ort-wasm-simd-threaded.asyncify.wasm','ort-wasm-simd-threaded.jspi.mjs','ort-wasm-simd-threaded.jspi.wasm'].map(file=>({from:'node_modules/bench-ort/dist/'+file,to:'ort/'+file})),
  {from:'bench/reference/FLOW-LICENSE',to:'licenses/FLOW-GPL-3.0.txt'},
  {from:'bench/reference/ONNX-RUNTIME-LICENSE',to:'licenses/ONNX-RUNTIME-MIT.txt'},
  {from:'node_modules/@huggingface/tokenizers/LICENSE',to:'licenses/TOKENIZERS-APACHE-2.0.txt'},
  {from:'docs/ettin-integration.md',to:'licenses/NOTICE.md'},
 ]})],
};
