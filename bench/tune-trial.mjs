// SPDX-License-Identifier: GPL-3.0-or-later
import {evaluateVideo,summarize,bootstrap} from './evaluate.mjs';
import {decode} from './decode.mjs';
export function evaluateTrial(cached,config) {
 const failures=[];
 const rows=cached.map(({f,p,raw})=>{
  try{return evaluateVideo(f,{...p,segments:decode(raw,config)},'sponsor');}
  catch(e){failures.push({videoId:f.videoId,reason:String(e.message).slice(0,500)});return evaluateVideo(f,{...p,status:'invalid_output',segments:[]},'sponsor');}
 });
 return {status:failures.length?'invalid_output':'valid',failures,summary:summarize(rows),uncertainty:bootstrap(rows)};
}
