// SPDX-License-Identifier: GPL-3.0-or-later
// Fresh registered cohort only. Original frozen importers and exposed data are untouched.
import {panelCaptions} from '../src/transcript-panel.js';
import {validateFixture,validateManifest,CATEGORIES} from './contracts.mjs';
import {hash} from './lib.mjs';
export function freshCaptionFixture(raw,video,{registrationRaw,manifest,priorManifest,knownExcludedIds=[]}) {
 const plan=JSON.parse(registrationRaw);
 validateManifest(manifest);validateManifest(priorManifest);
 if(!priorManifest.selectionHash||manifest.originalPilotSelectionHash!==priorManifest.selectionHash)throw Error('Prior selection identity mismatch');
 if(plan.schemaVersion!==1||!Array.isArray(plan.channels)||manifest.registeredPlanHash!==hash(registrationRaw))throw Error('Fresh registration mismatch');
 const selection=manifest.videos.map(v=>({videoId:v.videoId,channelId:v.channelId,split:v.split}));
 if(manifest.selectionHash!==hash(JSON.stringify(selection))||!Number.isFinite(Date.parse(manifest.frozenAt)))throw Error('Fresh selection is not frozen');
 if(manifest.testExposure!=='none')throw Error('Fresh holdout already exposed; acquisition would change its fixture set');
 for(const v of manifest.videos) {
  if(priorManifest.videos.some(old=>old.videoId===v.videoId||old.channelId===v.channelId))throw Error('Previously exposed channel/video in fresh selection');
  if(knownExcludedIds.includes(v.videoId))throw Error('Excluded published example in fresh selection');
  if(!['tune','test'].includes(v.split)||!plan.channels.some(c=>c.channelId===v.channelId&&c.split===v.split))throw Error('Registered channel split mismatch');
 }
 if(!manifest.videos.some(v=>v.videoId===video.videoId&&v.channelId===video.channelId&&v.split===video.split))throw Error('Fresh selected identity/split mismatch');
 const source=JSON.parse(raw);
 if(source.schemaVersion!==1||source.source!=='YouTube public transcript panel'||source.videoId!==video.videoId||source.channelId!==video.channelId||source.complete!==true||source.language!=='en')throw Error('Fresh caption source identity/completeness mismatch');
 if(!['unknown','automatic','manual'].includes(source.captionType)||!Number.isFinite(Date.parse(source.acquiredAt)))throw Error('Invalid fresh caption provenance');
 if(!Number.isFinite(source.durationSeconds)||!Number.isFinite(source.panel?.durationSeconds)||Math.abs(source.durationSeconds-source.panel.durationSeconds)>1||video.durationSeconds&&Math.abs(video.durationSeconds-source.panel.durationSeconds)>1)throw Error('Fresh caption duration mismatch');
 const {captions,provenance}=panelCaptions(source.panel,video.videoId,source.languageVerification),duration=source.panel.durationSeconds;
 const refs=(video.crowdReferences??[]).filter(r=>CATEGORIES.includes(r.category)).map(r=>({start:r.segment[0],end:r.segment[1],category:r.category,status:'provisional',source:video.referenceSource??'SponsorBlock',votes:r.votes??null,locked:r.locked??null,uuid:r.UUID??null}));
 for(const a of refs)if(refs.some(b=>a!==b&&a.category!==b.category&&Math.max(a.start,b.start)<Math.min(a.end,b.end)))a.status='disputed';
 return validateFixture({videoId:video.videoId,channelId:video.channelId,durationSeconds:duration,language:'en',cues:captions.map(c=>({start:c.start,end:c.start+c.duration,text:c.text})),referenceSegments:refs,reviewedNegativeIntervals:[],annotationCompleteness:'partial',provenance:{...provenance,captionSource:source.source,captionType:source.captionType,captionTrackId:source.captionTrackId??null,acquiredAt:source.acquiredAt,rawHash:hash(raw),languageVerification:source.languageVerification,browser:source.browser??null,registeredSelectionHash:manifest.selectionHash,registeredPlanHash:manifest.registeredPlanHash,evaluationSplit:video.split,labelSource:video.referenceSource??'SponsorBlock',labelSnapshotAt:video.referenceSnapshotAt,labelLicense:'CC-BY-NC-SA-4.0',captionRights:'Private public-interface acquisition; no redistribution',referenceAdjudication:refs.some(r=>r.status==='disputed')?'Paid/self-promotion overlap marked disputed before inference':'No paid/self-promotion reference conflict',evaluationScope:'Fresh registered cohort; partial crowd references, no human-reviewed negative exposure; upstream training and campaign overlap remain unknown'}});
}
