// SPDX-License-Identifier: GPL-3.0-or-later
// Separate development-only conversion. The frozen pilot importer stays unchanged.
import {panelCaptions} from '../src/transcript-panel.js';
import {validateFixture,CATEGORIES} from './contracts.mjs';
import {hash} from './lib.mjs';

export function developmentCaptionFixture(raw,video) {
    if(video?.split!=='tune')throw Error('Development captions require the tune split');
    const source=JSON.parse(raw);
    if(source.schemaVersion!==1 || source.source!=='YouTube public transcript panel'
        || source.videoId!==video.videoId || source.channelId!==video.channelId
        || source.complete!==true || source.language!=='en')throw Error('Invalid development caption source/identity/completeness');
    if(!['unknown','automatic','manual'].includes(source.captionType)
        || !Number.isFinite(Date.parse(source.acquiredAt)))throw Error('Invalid development caption provenance');
    if(!source.panel || !Number.isFinite(source.panel.durationSeconds)
        || video.durationSeconds && Math.abs(source.panel.durationSeconds-video.durationSeconds)>1)throw Error('Caption duration mismatch');
    const {captions,provenance}=panelCaptions(source.panel,video.videoId,source.languageVerification);
    const duration=source.panel.durationSeconds;
    const referenceSegments=(video.crowdReferences??[]).filter(r=>CATEGORIES.includes(r.category)).map(r=>({
        start:r.segment[0],end:r.segment[1],category:r.category,status:'provisional',source:video.referenceSource??'SponsorBlock',
        votes:r.votes??null,locked:r.locked??null,uuid:r.UUID??null,
    }));
    // Do not infer a commercial/self-promotion winner from conflicting crowd labels.
    for(const a of referenceSegments)if(referenceSegments.some(b=>a!==b&&a.category!==b.category
        && Math.max(a.start,b.start)<Math.min(a.end,b.end)))a.status='disputed';
    return validateFixture({videoId:video.videoId,channelId:video.channelId,durationSeconds:duration,language:'en',
        cues:captions.map(c=>({start:c.start,end:c.start+c.duration,text:c.text})),referenceSegments,
        reviewedNegativeIntervals:[],annotationCompleteness:'partial',provenance:{
            ...provenance,captionSource:source.source,captionType:source.captionType,captionTrackId:source.captionTrackId??null,
            trackSelectionMethod:source.trackSelectionMethod??'exact selected track ID unavailable; reliable English content verified',
            acquiredAt:source.acquiredAt,rawHash:hash(raw),languageVerification:source.languageVerification,browser:source.browser??null,
            sourceRecovery:source.sourceRecovery??null,labelSource:video.referenceSource??'SponsorBlock',labelSnapshotAt:video.referenceSnapshotAt,
            labelLicense:'CC-BY-NC-SA-4.0',captionRights:'Private public-interface acquisition; no redistribution',
            referenceAdjudication:referenceSegments.some(r=>r.status==='disputed')?'Paid/self-promotion overlap marked disputed before inference':'No paid/self-promotion reference conflict',
            evaluationScope:'Development tune only; partial crowd labels, no reviewed negatives or independent release claim',
        }});
}
