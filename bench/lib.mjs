import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export const root=fileURLToPath(new URL('../',import.meta.url));
export const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
export const readJson=async file=>JSON.parse(await readFile(path.resolve(root,file),'utf8'));
export async function save(file,value) {
 const full=path.resolve(root,file);await mkdir(path.dirname(full),{recursive:true});
 await writeFile(full+'.tmp',JSON.stringify(value,null,2)+'\n');await rename(full+'.tmp',full);
}
export function args(argv=process.argv.slice(2)) {
 const result={};for(let i=0;i<argv.length;i++) {if(!argv[i].startsWith('--')) throw new Error('Expected named argument');const key=argv[i].slice(2);result[key]=argv[i+1]&&!argv[i+1].startsWith('--')?argv[++i]:true;}return result;
}
export async function fixtureFor(v) {
 const bytes=await readFile(path.resolve(root,v.fixturePath));
 if(hash(bytes)!==v.fixtureHash) throw new Error('Frozen fixture hash mismatch: '+v.videoId);
 return JSON.parse(bytes);
}
