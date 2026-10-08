// SPDX-License-Identifier: GPL-3.0-or-later
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {args,root,hash} from './lib.mjs';
import {reviewedFreshFixtures} from './reviewed-fresh-fixtures.mjs';
try {
 const options=args(),required=['manifest','review','output','exposure-ledger'],allowed=[...required,'review-kind'];
 const reviewerKind=options['review-kind']||'human';
 if(!['human','llm'].includes(reviewerKind))throw Error('Invalid review kind');
 if(Object.keys(options).some(key=>!allowed.includes(key))||required.some(key=>typeof options[key]!=='string'||!options[key]))throw Error('Require --manifest, --review, --output and --exposure-ledger paths');
 const manifestFile=path.resolve(root,options.manifest),reviewFile=path.resolve(root,options.review),output=path.resolve(root,options.output),ledgerFile=path.resolve(root,options['exposure-ledger']);
 let exposureLedger=null;
 try {const raw=await readFile(ledgerFile,'utf8');try{exposureLedger=JSON.parse(raw);if(!exposureLedger)throw Error();}catch{throw Error('Corrupt existing exposure ledger');}}
 catch(e){if(e.code!=='ENOENT')throw e;}
 const [manifestRaw,reviewRaw,policyRaw]=await Promise.all([readFile(manifestFile,'utf8'),readFile(reviewFile,'utf8'),readFile(path.join(root,'bench/datasets/category-policy.json'),'utf8')]);
 const manifest=JSON.parse(manifestRaw),review=JSON.parse(reviewRaw),policy=JSON.parse(policyRaw),fixtureBytes=new Map();
 if(!Array.isArray(manifest.videos))throw Error('Invalid source manifest');
 for(const v of manifest.videos.filter(v=>v.captionAvailability==='ok'))fixtureBytes.set(v.videoId,await readFile(path.resolve(root,v.fixturePath),'utf8'));
 const result=reviewedFreshFixtures(manifest,review,fixtureBytes,{policy,policyHash:hash(policyRaw),exposureLedger,reviewerKind});
 result.manifest.reviewExposureLedgerPath=ledgerFile;
 result.manifest.reviewInputHash=hash(reviewRaw);
 await mkdir(output,{recursive:false});
 await mkdir(path.join(output,'fixtures'),{recursive:false});
 for(const v of result.manifest.videos.filter(v=>v.captionAvailability==='ok')){
  v.fixturePath=path.join(output,'fixtures',v.videoId+'.json');
  const bytes=JSON.stringify(result.fixtures.get(v.videoId),null,2)+'\n';
  if(hash(bytes)!==v.fixtureHash)throw Error('Reviewed fixture serialization mismatch');
  await writeFile(v.fixturePath,bytes,{flag:'wx'});
 }
 await writeFile(path.join(output,reviewerKind+'-review.json'),reviewRaw,{flag:'wx'});
 await writeFile(path.join(output,'manifest.json'),JSON.stringify(result.manifest,null,2)+'\n',{flag:'wx'});
 const evidence={schemaVersion:1,referenceSetVersion:review.referenceSetVersion,selectionHash:manifest.selectionHash,sourceManifestHash:hash(manifestRaw),reviewInputHash:hash(reviewRaw),reviewHash:result.manifest.reviewHash,reviewExposureLedgerPath:ledgerFile,importedAt:result.manifest.reviewImportedAt,fixtureHashes:result.manifest.videos.map(v=>({videoId:v.videoId,sourceFixtureHash:v.sourceFixtureHash??null,fixtureHash:v.fixtureHash??null,availability:v.captionAvailability})),modelInference:false,reviewerKind,claims:reviewerKind==='llm'?'User-authorized assistant transcript references; not human audiovisual ground truth. Original sources and all exposure checks preserved.':'Validates review data and attestation. Cannot establish the truth of a human assertion or remove the need for independent quality evaluation.'};
 await writeFile(path.join(output,'import-evidence.json'),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({output,referenceSetVersion:review.referenceSetVersion,selectedVideos:manifest.videos.length,reviewedFixtures:result.fixtures.size,reviewedPositiveSegments:[...result.fixtures.values()].reduce((n,f)=>n+f.referenceSegments.filter(r=>r.status==='reviewed').length,0),explicitNegativeIntervals:[...result.fixtures.values()].reduce((n,f)=>n+f.reviewedNegativeIntervals.length,0)}));
 console.log('No model inference. Original dataset and provisional references preserved. Freeze this new snapshot before test predictions.');
} catch(e) {console.error('Review import failed: '+e.message);process.exitCode=1;}
