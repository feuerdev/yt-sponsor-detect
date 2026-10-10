export function validateCaptions(captions) {
    if (!Array.isArray(captions) || captions.length === 0 || captions.length > 100000) throw Error('invalid_captions');
    let previous=-1,characters=0,end=0;
    for (const cue of captions) {
        const start=Number(cue.start),duration=Number(cue.duration);
        if (!Number.isFinite(start) || start<0 || start<previous || !Number.isFinite(duration) || duration<=0
            || typeof cue.text !== 'string' || !cue.text.trim()) throw Error('invalid_captions');
        previous=start;end=Math.max(end,start+duration);characters+=cue.text.length;
    }
    if (characters>2000000) throw Error('invalid_captions');
    return end;
}
export function validateSegments(segments,captions) {
    const end=validateCaptions(captions);
    if (!Array.isArray(segments) || segments.length>1000 || segments.some(s=>
        s?.category!=='sponsor' || !Number.isFinite(s.start) || !Number.isFinite(s.end)
        || s.start<0 || s.end<=s.start || s.end>end+1e-6 || !Number.isFinite(s.score) || s.score<0 || s.score>1))
        throw Error('invalid_output');
    return segments;
}
