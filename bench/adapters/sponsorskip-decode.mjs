// Derived from edde746/sponsorskip @ 01e53cbe8beb02f0ce125736b88df99396793595
// GPL-3.0-or-later. See ../reference/SPONSORSKIP-LICENSE and NOTICE.md.
const AD_IDS=[1,2,3,4]; const CAT_OF                      ={1:"sponsor",2:"sponsor",3:"selfpromo",4:"selfpromo"}; const MIN_LEN_S=1.0, MERGE_GAP_S=2.0, WORD_TAIL_S=0.4;
  export function decodeSponsorSkip(probs              , words        , thHi        , thLo        , meta     )            {
    const nLabels = meta.labels.length;
    const n = words.length;

    const pAd = new Float32Array(n);
    const argmax = new Int32Array(n);
    for (let w = 0; w < n; w++) {
      let p = 0;
      for (const c of AD_IDS) p += probs[w * nLabels + c];
      pAd[w] = p;

      let best = 0;
      let bestV = -Infinity;
      for (let c = 0; c < nLabels; c++) {
        const v = probs[w * nLabels + c];
        if (v > bestV) {
          bestV = v;
          best = c;
        }
      }
      argmax[w] = best;
    }

    const runs                          = [];
    for (let i = 0; i < n; ) {
      if (pAd[i] < thHi) {
        i++;
        continue;
      }
      // Extend the core while still confident.
      let j = i;
      while (j + 1 < n && pAd[j + 1] >= thHi) j++;
      // Then relax outward to find the true edges.
      let a = i;
      while (a - 1 >= 0 && pAd[a - 1] >= thLo) a--;
      let b = j;
      while (b + 1 < n && pAd[b + 1] >= thLo) b++;
      runs.push([a, b]);
      // Resume past the expanded end, so one core cannot be claimed twice.
      i = b + 1;
    }

    const segs            = runs.map(([a, b]) => {
      const tally = new Map                ();
      for (let w = a; w <= b; w++) {
        const c = argmax[w];
        if (c in CAT_OF) tally.set(c, (tally.get(c) ?? 0) + 1);
      }
      let brand           = "sponsor";
      let bestN = 0;
      for (const [c, n] of tally) {
        if (n > bestN) {
          bestN = n;
          brand = CAT_OF[c];
        }
      }
      let score = 0;
      for (let w = a; w <= b; w++) score += pAd[w];
      return {
        category: brand,
        start: words[a][1] / 1000,
        end: words[b][1] / 1000 + WORD_TAIL_S,
        score: score / (b - a + 1),
      };
    });

    const merged            = [];
    for (const s of segs.sort((x, y) => x.start - y.start)) {
      const last = merged[merged.length - 1];
      if (last && s.start - last.end <= MERGE_GAP_S && s.category === last.category) {
        // Weight the merged score by span length so a long confident run is not
        // dragged down by a short adjacent one.
        const lw = last.end - last.start;
        const sw = s.end - s.start;
        // Both sides always carry a score on this path; `?? 0` only satisfies
        // the optional type, which exists for the LLM engine.
        last.score =
          ((last.score ?? 0) * lw + (s.score ?? 0) * sw) / Math.max(lw + sw, 1e-6);
        last.end = Math.max(last.end, s.end);
      } else {
        merged.push({ ...s });
      }
    }
    return merged.filter((s) => s.end - s.start >= MIN_LEN_S);
  }

