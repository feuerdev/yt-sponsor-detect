// SPDX-License-Identifier: GPL-3.0-or-later
export function observedFixture(meta,video) {
 const recorded=meta.fixtureHashes?.find(([id])=>id===video.videoId);
 if(!recorded||recorded[1]&&recorded[1]!==video.fixtureHash)throw new Error('Report fixture identity mismatch: '+video.videoId);
 return recorded[1]!=null;
}
export function qualityCostFrontier(runs) {
 const candidates=runs.filter(r=>r.metadata.split==='test'&&r.metadata.status==='complete'&&r.metadata.spec.id!=='keyword'&&r.summary.sponsor?.scored>0&&r.summary.sponsor.scored===r.metadata.fixtureHashes.filter(([,hash])=>hash).length).map(r=>({run:r,values:[r.summary.sponsor.metrics[.5].precision,r.summary.sponsor.metrics[.5].recall,-r.performance.coldLoadMs,-r.performance.inferenceMedianMs]})).filter(c=>c.run.performance.coldLoadMs!=null&&c.run.performance.inferenceMedianMs!=null&&c.values.every(Number.isFinite));
 const identity=c=>JSON.stringify([c.run.metadata.selectionHash,c.run.metadata.fixtureHashes]);
 if(new Set(candidates.map(identity)).size>1)throw new Error('Pareto comparison requires a common frozen selection and fixture set');
 return candidates.filter(a=>!candidates.some(b=>b!==a&&b.values.every((v,i)=>v>=a.values[i])&&b.values.some((v,i)=>v>a.values[i]))).map(c=>c.run.runId);
}
export function recommendation({available,selected,hasTestScores}) {
 const coverage=`${available}/${selected} frozen pilot caption tracks acquired.`;
 return hasTestScores?`${coverage} Compare measured quality/cost tradeoffs as agreement with provisional references. No reviewed negatives or agreed production safety gates: keep automatic skipping disabled.`:`${coverage} No scored holdout comparison is available yet. Synthetic smoke proves runtime execution only. Keep automatic skipping disabled; finish channel-isolated tuning and frozen evaluation, then review common references and negative exposure.`;
}
