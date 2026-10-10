// SPDX-License-Identifier: GPL-3.0-or-later
import {readFile,statfs} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {installAssets,verifyAssets} from '../scripts/model-assets.mjs';
const spec=JSON.parse(await readFile(new URL('./model-spec.json',import.meta.url),'utf8'));
const parent=fileURLToPath(new URL('./model/',import.meta.url));
try {
    if(process.argv.includes('--verify'))await verifyAssets(parent+spec.directory,spec);
    else {
        const disk=await statfs(fileURLToPath(new URL('../',import.meta.url)));
        if(disk.bavail*disk.bsize<256*1024**2+spec.files.reduce((sum,file)=>sum+file.size,0)*2)throw Error('Insufficient disk headroom for bounded audio assets');
        await installAssets(parent,spec);
    }
    console.log('Verified local Whisper tiny.en artifacts at '+spec.revision+'. No inference executed.');
}catch(error){console.error(error.message);process.exitCode=1;}
