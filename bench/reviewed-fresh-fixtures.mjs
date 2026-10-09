// SPDX-License-Identifier: GPL-3.0-or-later
import {hash} from './lib.mjs';
import {validateFixture,validateManifest,CATEGORIES,interval} from './contracts.mjs';
const requireValue=(condition,message)=>{if(!condition)throw Error(message);};
const text=value=>typeof value==='string'&&value.trim().length>0;
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function reviewedFreshFixtures(manifest,review,fixtureBytes,{policy,policyHash,at=new Date().toISOString(),exposureLedger=null,reviewerKind='human'}={}) {
 requireValue(['human','llm'].includes(reviewerKind),'Invalid review kind');
 const llm=reviewerKind==='llm',referenceStatus=llm?'llm-reviewed':'human-reviewed',referenceSource=llm?'LLM transcript review':'Human review';
 validateManifest(manifest);
 requireValue(manifest.testExposure==='none'&&exposureLedger===null,'Fresh test exposure prevents reference import; preserve the exposed cohort');
 requireValue(sha(manifest.registeredPlanHash)&&sha(manifest.selectionHash),'Missing fresh selection/registration identity');
 requireValue(manifest.selectionHash===hash(manifest.videos.map(v=>({videoId:v.videoId,channelId:v.channelId,split:v.split}))),'Fresh selected population mismatch');
 requireValue(review?.schemaVersion===1&&review.status===referenceStatus,'Pending review or different review kind cannot supply '+referenceStatus+' references');
 if(llm)requireValue(review.reviewMethod==='transcript-only','LLM review must declare transcript-only method');
 requireValue(review.candidatePredictionsVisible===false,'Blind human review must explicitly exclude candidate predictions');
 requireValue(text(review.referenceSetVersion)&&/^[A-Za-z0-9._-]{1,100}$/.test(review.referenceSetVersion),'Invalid common review version');
 requireValue(policy&&sha(policyHash)&&review.policyHash===policyHash&&review.policyVersion===policy.version,'Review category policy mismatch');
 requireValue(review.selectionHash===manifest.selectionHash&&review.registeredPlanHash===manifest.registeredPlanHash,'Review selection/registration mismatch');
 requireValue(Number.isFinite(Date.parse(at)),'Invalid review import time');
 requireValue(Array.isArray(review.videos)&&review.videos.length===manifest.videos.length,'Review must retain the entire selected population');
 const records=new Map();for(const r of review.videos){requireValue(r&&typeof r.videoId==='string'&&!records.has(r.videoId),'Invalid/duplicate selected review identity');records.set(r.videoId,r);}
 requireValue(manifest.videos.every(v=>records.has(v.videoId)),'Review contains missing or added selected identities');
 requireValue(fixtureBytes instanceof Map&&fixtureBytes.size===manifest.videos.filter(v=>v.captionAvailability==='ok').length,'Source fixture population mismatch');
 const result=structuredClone(manifest),fixtures=new Map(),reviewHash=hash(review);
 for(const v of result.videos){
  const r=records.get(v.videoId);
  requireValue(r.channelId===v.channelId&&r.split===v.split,'Reviewed source identity/split mismatch');
  if(v.captionAvailability!=='ok'){
   requireValue(r.originalFixtureHash===null&&!r.reviewerAttestation&&!r.llmReviewerAttestation&&[r.reviewedSegments,r.reviewedNegativeIntervals,r.uncertainIntervals].every(a=>Array.isArray(a)&&a.length===0),'Unavailable source cannot supply reviewed fixture intervals');
   continue;
  }
  const bytes=fixtureBytes.get(v.videoId);
  requireValue((typeof bytes==='string'||Buffer.isBuffer(bytes))&&sha(v.fixtureHash)&&hash(bytes)===v.fixtureHash&&r.originalFixtureHash===v.fixtureHash,'Reviewed source fixture hash mismatch');
  const f=validateFixture(JSON.parse(bytes));
  requireValue(f.videoId===v.videoId&&f.channelId===v.channelId&&(!v.durationSeconds||v.durationSeconds===f.durationSeconds),'Source fixture identity/duration mismatch');
  requireValue(text(r.reviewer),'Reviewer identity required');
  if(llm)requireValue(r.reviewerAttestation===false&&r.llmReviewerAttestation===true&&r.reviewMethod==='transcript-only','LLM transcript attestation required; human attestation prohibited');
  else requireValue(r.reviewerAttestation===true&&!r.llmReviewerAttestation,'Human reviewer identity and explicit attestation required');
  const reviewedAt=Date.parse(r.reviewedAt);
  requireValue(Number.isFinite(reviewedAt)&&reviewedAt<=Date.parse(at)&&(!f.provenance?.acquiredAt||reviewedAt>=Date.parse(f.provenance.acquiredAt)),'Invalid reviewer time or source chronology');
  requireValue(['partial','complete'].includes(r.annotationCompleteness),'Invalid reviewed annotation completeness');
  requireValue([r.reviewedSegments,r.reviewedNegativeIntervals,r.uncertainIntervals].every(Array.isArray),'Missing reviewed interval arrays');
  requireValue(r.campaignGroup===null||text(r.campaignGroup),'Campaign review must declare an identity or remain unknown');
  const campaignGroup=r.campaignGroup??v.campaignGroup??null;
  const references=(values,status)=>values.map(s=>{
   interval(s,f.durationSeconds,'reviewed reference');
   requireValue(CATEGORIES.includes(s.category)&&(s.status===undefined||s.status===status),'Invalid reviewed reference category/status');
   return {...s,status,source:referenceSource};
  });
  const referenceSegments=[...references(r.reviewedSegments,'reviewed'),...references(r.uncertainIntervals,'uncertain')];
  const negatives=r.reviewedNegativeIntervals.map(s=>{
   interval(s,f.durationSeconds,'reviewed negative');requireValue(s.status===undefined||s.status==='reviewed','Invalid reviewed negative status');return {...s,status:'reviewed'};
  });
  const converted=validateFixture({...f,referenceSegments,reviewedNegativeIntervals:negatives,annotationCompleteness:r.annotationCompleteness,reviewVersion:review.referenceSetVersion,provenance:{...f.provenance,priorFixtureHash:v.fixtureHash,provisionalReferenceSegments:structuredClone(f.referenceSegments),review:{referenceSetVersion:review.referenceSetVersion,reviewHash,policyVersion:policy.version,policyHash,reviewer:r.reviewer.trim(),reviewerKind,reviewerAttestation:!llm,...(llm?{llmReviewerAttestation:true,reviewMethod:'transcript-only',crowdReferencesVisible:review.crowdReferencesVisible??null}:{}),reviewedAt:r.reviewedAt,candidatePredictionsVisible:false,campaignGroup,importedAt:at},evaluationScope:llm?'User-authorized LLM transcript review; not human audiovisual ground truth; unreviewed time, visuals and campaign/training overlap remain unknown':'Versioned human-supplied review; unreviewed time remains unknown; campaign and upstream training overlap may remain unknown'}});
  fixtures.set(v.videoId,converted);
  v.sourceFixtureHash=v.fixtureHash;v.sourceFixturePath=v.fixturePath;delete v.fixturePath;
  v.fixtureHash=hash(JSON.stringify(converted,null,2)+'\n');v.referenceStatus=referenceStatus;v.referenceSetVersion=review.referenceSetVersion;v.campaignGroup=campaignGroup;
 }
 result.referenceReviewerKind=reviewerKind;result.referenceSetVersion=review.referenceSetVersion;result.reviewHash=reviewHash;result.reviewImportedAt=at;
 validateManifest(result);return {manifest:result,fixtures};
}
