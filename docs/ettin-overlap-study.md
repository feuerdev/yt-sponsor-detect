# Guarded Ettin overlap study

This is a development decoding experiment, not a production model change or an
independent test. The shipped Flow decoder and 0.8 default are unchanged.

The candidate set was registered before this study scored any candidates:
three families (original per-window union, mean token-logit consensus and
context-weighted consensus), seven thresholds, fixed 24-character/1.5-second
merge gaps. It reuses hash-verified browser INT8 logits from tuning runs on both
WebGPU and WASM. Node performs pure decoding/scoring, never model inference.
The old frozen test set, ledger, registry, model bytes and original adapters are
unchanged and were not read by this study.

Consensus combines repeated-token evidence before the unchanged legal BILOU
decoder rather than accepting a positive span from either overlapping window.
Context weights increase with distance from a window edge, capped at the
existing 128-token overlap. No window size, trained weight or keyword prefilter
was tuned.

## Results

Five tuning transcripts cover four channels, but all four paid-sponsor
references come from one channel. Crowd references are provisional and partial,
with no reviewed negative exposure. Unknown time is not treated as ordinary
content. Agreement precision therefore is not established false-skip precision.

| Operating point | Paid reference matches | Segment agreement F1 | Sponsor seconds covered | Extra predicted seconds outside known references |
| --- | ---: | ---: | ---: | ---: |
| Shipped Flow / 0.8 | 3/4 | 0.857 | 82.23% | 0 |
| Best in-sample, context consensus / 0.7 | 4/4 | 1.000 | 93.86% | 8.056 |
| Channel-held-out selection, WebGPU | 3/4 | 0.750 | 82.23% | 0 |
| Channel-held-out selection, WASM | 3/4 | 0.857 | 82.23% | 0 |

The apparent perfect in-sample score does not transfer to the channel-held-out
procedure. When the only sponsor-positive channel is excluded, the remaining
channels provide no paid references to learn an operating point, so selection
correctly falls back to the shipped baseline. WebGPU's selected low-threshold
point on another excluded channel adds a paid-sponsor suggestion overlapping
a provisional self-promotion reference. Backend sensitivity near a threshold
is retained in the record rather than hidden.

No candidate is promoted. The predeclared gate requires at least three
sponsor-positive channels, twelve references, conservative out-of-fold
agreement, increased sponsor coverage and no extra unknown prediction seconds.
The current data fails those requirements. Independent fresh testing and
reviewed ordinary exposure remain necessary before automatic skipping.

The useful next action is acquisition across more sponsor-positive tuning
channels, followed by this same fixed study. Adjusting examples or publishing
100% as a general quality result would overfit the present sample. Upstream
model-training overlap remains unknown.

## Reproduction and checks

The [registered plan](../bench/experiments/ettin-overlap-v1.json) and
[complete caption-free numeric record](ettin-evidence/overlap-study.json) retain
all 21 operating points for each backend, channel splits/selected points,
bootstrap uncertainty, cache identities and promotion failures.

```bash
node bench/overlap-study.mjs --runs mac-20261007-v3-tune-ettin-int8-webgpu,mac-20261007-v3-tune-ettin-int8-wasm
```

This requires the original private tune caches and exact fixture hashes. Missing
or altered cache data is rejected. Results default to ignored bench/local.
Fixed Mac guards remain 28,672 MiB maximum same-UID RSS and 4,096 MiB minimum
available-memory proxy. Observed peak was 23,162.48 MiB, including unrelated
apps and shared-page duplication. No new model inference was needed.

Twelve new tests cover contradictory overlap evidence, context weighting,
identity/timing validation, preservation of single-window evidence, true
channel separation, rejection of exposed test inputs, invalid-output exclusion
missing sample-count rejection and conservative selection/promotion. Initial failures were recorded before
implementation. Original Flow parity behavior is preserved.

The full repository suite passed 111/111 tests with no skips and real Chrome
environment checks under the same fixed resource policy. Production source,
original Flow adapter, registry, pilot manifest and frozen config were verified
unchanged relative to the production-switch commit.

After this study, a preserved public transcript snapshot from a second
sponsor-positive tuning channel was recovered after agent inspection of its
complete English text, corroborated against the public UI. It belongs only to a
separate private development manifest and is not in the above scores. Its exact
selected caption-track ID remains unknown, all listed player tracks were ASR,
and its crowd labels remain provisional. Neither the original manifest nor
reviewed-negative exposure was changed.
