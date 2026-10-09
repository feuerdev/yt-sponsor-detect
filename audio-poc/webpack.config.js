// SPDX-License-Identifier: GPL-3.0-or-later
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import CopyPlugin from 'copy-webpack-plugin';
const root=fileURLToPath(new URL('../',import.meta.url));
export default {
    mode:'production',devtool:false,optimization:{minimize:false},
    entry:Object.fromEntries(['background','popup','offscreen','worklet'].map(name=>[name,path.join(root,'audio-poc',name+'.js')])),
    output:{path:path.join(root,'audio-poc-dist'),filename:'[name].js',clean:true},
    plugins:[new CopyPlugin({patterns:[
        ...['manifest.json','popup.html','offscreen.html','worker.js','experiment.js'].map(name=>({from:path.join(root,'audio-poc',name),to:name})),
        {from:path.join(root,'node_modules/@xenova/transformers/dist/transformers.min.js'),to:'vendor/transformers.min.js'},
        {from:path.join(root,'audio-poc/model/whisper-tiny.en'),to:'model/whisper-tiny.en'},
        {from:'*.wasm',context:path.join(root,'node_modules/@xenova/transformers/dist'),to:'ort'},
        {from:path.join(root,'src/viewer/LICENSE'),to:'licenses/EXPERIMENT-GPL-3.0.txt'},
        {from:path.join(root,'node_modules/@xenova/transformers/LICENSE'),to:'licenses/TRANSFORMERS-APACHE-2.0.txt'},
        {from:path.join(root,'bench/reference/ONNX-RUNTIME-LICENSE'),to:'licenses/ONNX-RUNTIME-MIT.txt'},
        {from:path.join(root,'audio-poc/NOTICE.md'),to:'licenses/NOTICE.md'},
    ]})],
};
