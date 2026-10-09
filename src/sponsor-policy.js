export const DEFAULT_THRESHOLD = 0.8;
export function sponsorLabels(labels) {
    if(labels==null)return [{name:'sponsor',threshold:DEFAULT_THRESHOLD,blocked:true}];
    if (!Array.isArray(labels)) return null;
    const legacy = labels.find(label => label?.name === 'contains sponsored content');
    if (legacy && typeof legacy.blocked === 'boolean')
        return [{name:'sponsor',threshold:DEFAULT_THRESHOLD,blocked:legacy.blocked}];
    if (labels.length !== 1) return null;
    const label = labels[0];
    if (label?.name !== 'sponsor' || !Number.isFinite(label.threshold) || label.threshold < 0
        || label.threshold > 1 || typeof label.blocked !== 'boolean') return null;
    return [{name:'sponsor',threshold:label.threshold,blocked:label.blocked}];
}
