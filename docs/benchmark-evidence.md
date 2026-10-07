# Sponsor browser benchmark — macOS continuation, 7 October 2026

> Subsequent change, 8 October: the extension now integrates Ettin INT8; see [integration evidence](ettin-integration.md). The measurements below describe the original isolated benchmark snapshot, before that integration. Its frozen configuration and exposure ledger are preserved.

The browser benchmark completed the supported learned matrix on the available pilot tracks, with a configuration frozen before test inference. This is an **incomplete, provisional pilot comparison**: only 14 of 50 captions were acquired, and no human-reviewed negatives exist. No reliable model winner or automatic-skipping release is established. Production classifier/playback source remains unchanged. Draft PR #2 remains open and draft.

## Current acquisition and evaluation

- Frozen selection remains 50 videos / 18 channels, 25 paid / 15 challenging / 10 ordinary, selection hash `013b92e97f22267616fe70f665b5d719f7f1ead983718fbd1147d948884f6f66`. No substitute videos were introduced.
- Available captions: 14/50 on 6/18 channels; tune: 5/30 videos, 4/11 channels; test: 9/20 videos, 2/7 channels. Missing acquisitions remain counted and their earlier ledger entries remain intact.
- Acquired coverage by stratum: paid 3/25, challenging 6/15, ordinary 5/10.
- The acquired tune tracks contain four paid reference spans (148.706 s); test tracks contain **one paid reference span (62.428 s) on only two represented channels**. Sampling strata and missing crowd submissions do not establish negatives. Campaign/training overlap remains unknown.
- Public transcript UI provides whole-second cue starts and inferred ends. Matching player/video/channel/duration, selected English track, raw snapshot/fixture hashes, source/type/time and original crowd references are retained. Ambiguous multilingual panels, empty timedtext and stalled panels remain failures.
- Both separate published smoke tracks were acquired and completed Ettin INT8 WASM and SponsorSkip WebGPU inference; they did not inform thresholds. The public CC diagnostic for pg7fntKLNak returned HTTP 200 with zero English ASR JSON3 bytes. No signed-URL replay, personal account or alternate-client bypass was used.
- Eight tuning configurations (seven learned paths plus keyword) scored all five available tune fixtures. Seven fixed decoder operating points were swept from verified browser caches, then locked. Test configuration was frozen at 2026-10-07T20:46:04.991Z; first test exposure was 2026-10-07T20:47:28.366Z. The ignored test ledger is preserved. No model, inference or decoder adaptation followed test exposure.

## Provisional held-out reference agreement

IoU 0.5 is the primary diagnostic; 0.3/0.7, channel bootstrap and paired differences are in the private JSON report. Precision below is agreement with partial SponsorBlock references, not confirmed correctness. Boundary results are limited by caption resolution. Ettin supports paid sponsor only. Null precision is abstention/zero predictions, not perfect precision.

| Candidate | Backend | Category | Scored / selected | Precision | Recall | Time recall | Missed s | Boundary p95 start / end s |
|---|---|---|---:|---:|---:|---:|---:|---:|
| mobilebert-fp32 | wasm | sponsor | 9/20 | unavailable | 0.00 | 0.00 | 62.43 | unavailable / unavailable |
| mobilebert-fp32 | wasm | selfpromo | 9/20 | 0.00 | 0.00 | 0.00 | 117.43 | unavailable / unavailable |
| mobilebert-int8 | wasm | sponsor | 9/20 | unavailable | 0.00 | 0.00 | 62.43 | unavailable / unavailable |
| mobilebert-int8 | wasm | selfpromo | 9/20 | unavailable | 0.00 | 0.00 | 117.43 | unavailable / unavailable |
| ettin-fp32 | wasm | sponsor | 9/20 | 0.20 | 1.00 | 0.99 | 0.43 | 0.43 / 1.79 |
| ettin-int8 | wasm | sponsor | 9/20 | 0.25 | 1.00 | 0.99 | 0.43 | 0.43 / 1.79 |
| ettin-fp32 | webgpu | sponsor | 9/20 | 0.33 | 1.00 | 0.99 | 0.43 | 0.43 / 1.79 |
| ettin-int8 | webgpu | sponsor | 9/20 | 0.25 | 1.00 | 0.99 | 0.43 | 0.43 / 1.79 |
| sponsorskip-base | webgpu | sponsor | 9/20 | unavailable | 0.00 | 0.00 | 62.43 | unavailable / unavailable |
| sponsorskip-base | webgpu | selfpromo | 9/20 | 1.00 | 0.25 | 0.48 | 60.66 | 0.28 / 2.74 |
| keyword | javascript | sponsor | 9/20 | unavailable | 0.00 | 0.00 | 62.43 | unavailable / unavailable |

## Browser runtime and measured costs

One arm64 macOS personal machine with 32 GiB RAM, ten exposed logical processors, Chrome 155.0.8059.40. Native Apple Metal-3 WebGPU adapter, fallback=false, shader-f16 available. Models ran sequentially in fresh multiprocess headless Chrome with the sandbox and normal graphics defaults; no software WebGPU was enabled. The page uses an MV3-like CSP, but this is not installed-extension evidence. WASM and GPU were measured independently.

| Candidate | Backend | Fresh load ms | Full-track median ms | p95 ms | Approx. max main-thread lag ms | Peak user RSS MiB |
|---|---|---:|---:|---:|---:|---:|
| mobilebert-fp32 | wasm | 513.8 | 49750.1 | 155647.5 | 158460.4 | 22563.9 |
| mobilebert-int8 | wasm | 444.7 | 52311.0 | 164043.7 | 167233.1 | 22162.6 |
| ettin-fp32 | wasm | 555.8 | 1745.1 | 5384.0 | 5485.0 | 22828.4 |
| ettin-int8 | wasm | 532.8 | 1768.6 | 5358.2 | 5424.8 | 22695.7 |
| ettin-fp32 | webgpu | 619.3 | 296.8 | 1104.8 | 86.1 | 23063.0 |
| ettin-int8 | webgpu | 524.2 | 319.4 | 1086.2 | 72.0 | 22632.5 |
| sponsorskip-base | webgpu | 1118.9 | 1584.8 | 6118.8 | 19.6 | 23829.2 |
| keyword | javascript | 3.9 | 0.1 | 0.7 | 1.2 | 22093.5 |

The Mac policy was explicitly 28672 MiB same-UID RSS and 4096 MiB minimum free+inactive+speculative-page availability proxy. Baseline was roughly 22 GiB RSS. RSS includes unrelated apps and duplicated shared pages; it is not model RAM, and the available-memory proxy is not guaranteed allocatable RAM. Memory is sampled, GPU memory unavailable, OS disk cache unspecified. The VPS's default 700/768 MiB guards remain intact. An initial acquisition batch crossed the Mac RSS guard; task browsers were closed and one proven task-owned orphan was terminated. Per-video isolation and bounded CDP requests limit page accumulation and stalled command waits, with real cleanup regressions.

## Recommendation and remaining gates

Measured sponsor quality/cost Pareto set on this device: **ettin-fp32 / webgpu, ettin-int8 / webgpu**. This describes finite provisional segment precision/recall versus fresh load and full-track median cost, with common available test coverage. Unrelated-account RSS, keyword and synthetic quality are excluded from the Pareto comparison. With one paid test reference, the set cannot establish rare-error safety or a deployable winner. Ettin has a measured CPU fallback and native GPU paths, but paid-only output and limited reference evidence constrain its use.

Keep automatic skipping disabled. Human review must version one common reference set, review uncertain affiliate/gifted cases and no-detection regions, identify campaign/training overlap, and explicitly mark ordinary intervals. **False skips/hour and removed ordinary seconds remain unavailable** until reviewed negative exposure exists. Resolve the 36 unavailable pilot tracks before a full-population claim. Source/decoder tuning after the exposed holdout requires a fresh holdout; never delete the test ledger. Installed MV3 extension behavior and agreed numeric release gates are still pending.

## Corrections and validation

- Ettin now uses pinned Flow normalization/literals, Unicode/codepoint timing, constrained Viterbi BILOU, geometric confidence and per-window overlap stitching. 150 numerical differential cases and six Unicode/normalization/offset cases pass; the oracle regenerated byte-identically from pinned upstream source. Complex unverified NFC mappings are rejected and zero-duration proposals omitted explicitly. This does not reproduce unpublished model-card quality. Original Flow GPLv3 provenance/full license is recorded.
- Real tune tracks exposed MobileBERT tokenizer metadata's 1e30 length sentinel. The graph's verified 512-position bound is now enforced at the actual pair tokenizer; long synthetic browser regression passes FP32 and INT8. Earlier v2 failed runs remain preserved as development evidence. Registry/runtime/weights pins were otherwise retained.
- Full local suite: **88/88 pass, zero skips**, including real Chrome trusted-click, command-timeout and empty-network-body cleanup checks; source/contracts/manifests/pins and diff whitespace checks pass. Production source is unchanged. The earlier verified production build passed on the VPS; it was not rerun because these changes are benchmark-only. There is no hosted CI result for these new changes unless separately recorded.
- Raw captions, model weights, browser profiles and full generated reports are private/ignored. Only implementation, immutable synthetic oracles, hashes/provenance, frozen config and caption-free evidence are committed. Model/base/runtime/label rights remain separate; MobileBERT redistribution rights remain unresolved. No store package, merge or deployment is authorized.

Reproduction and exact pins: [bench/README.md](../bench/README.md), [Ettin differential evidence](../bench/reference/ettin-parity.md), [source notices](../bench/reference/NOTICE.md). Actual run IDs and frozen tuning trials are recorded in the private report and bench/frozen-config.json. Caption-free standalone exports retain numeric traces and hashes; browser HTML limits score previews to 16000 characters to keep rendering bounded.

Caption-free aggregate results and provenance: [measurements.json](benchmark-evidence/measurements.json).

Browser evidence: [report](benchmark-evidence/benchmark-report.png), [MobileBERT long-input WASM smoke](benchmark-evidence/mobilebert-long-browser-smoke.png), [Ettin WebGPU graph smoke](benchmark-evidence/ettin-webgpu-browser-smoke.png), [native adapter probe](benchmark-evidence/webgpu-capability.png). The adapter probe alone contains no graph inference; the separate Ettin smoke does. The styled report capture succeeded without truncation (1200 by 6203 pixels) after an earlier full-trace HTML capture timed out. All task browsers/previews were closed.

---

## Historical VPS attempt — superseded current status

The following preserves the earlier host evidence. Its unavailable/untested statements describe that VPS attempt, not the Mac results above.

# Sponsor detection benchmark: attempted pilot, 7 October 2026

The benchmark harness and acquisition ledger are implemented. The plan's model-quality comparison is **not complete**: all 50 selection caption acquisitions failed, and learned-model browser loads could not complete within the VPS resource margin. There is no evidence-based model winner and no automatic-skipping release recommendation. Production classifier/playback source is unchanged.

## Completed evidence

- Started from current `origin/main`, commit `98144c6979c9500cf07dd25321fb1f924c748387`, on `feat/sponsor-browser-benchmark`.
- Pinned assets, runtime versions, label/preprocessing/decoder registry, timed contracts, interval evaluator, score caches, tuning/freeze tooling, browser runner, report and balanced review queue.
- Frozen 50 distinct videos across 18 channels: 25 paid / 15 challenging / 10 ordinary sampling strata. Whole-channel split: 30 tuning videos on 11 channels; 20 test videos on 7 channels. No video/channel crosses splits. Campaign duplication and training-channel overlap remain unknown because captions/training manifests are unavailable.
- SponsorBlock snapshot contains 36 paid-sponsor and 35 self-promotion spans, with category/votes/locked/UUID provenance. These are partial, provisional crowd references, not human-reviewed truth. No reviewed negative hours exist.
- Public timedtext caption acquisition attempted for all 50 videos: HTTP 200 with empty bodies for every track. A diagnostic sample also returned empty JSON3/SRV3/VTT bodies; its public transcript panel returned HTTP 400. Both published SponsorSkip reproduction examples were attempted separately and also returned empty captions. Initial discovery format/Python failures remain in the ledger.
- Four compact weight variants downloaded and SHA-256/size verified. SponsorSkip's larger graph was not downloaded because the tested browser has no usable WebGPU adapter.
- Real browser keyword smoke completed, with an actual runner screenshot. This is JavaScript keyword inference, **not neural-model evidence** and not accuracy evidence.
- `npm test`: 65 tests passed, including lifecycle/model integrity, interval matching/unknown-region accounting, channel/campaign leakage, byte offsets, BILOU, hysteresis and paired channel bootstrap. Benchmark source/schema/manifests checked.
- `NODE_OPTIONS='--max-old-space-size=160' npm run build`: production build passed with verified real pinned production weights; only webpack asset-size warnings. No browser ran concurrently.

## Browser and resource results

One Linux x64 VPS, AMD EPYC 7401P, one exposed logical processor, Chrome for Testing/headless shell 155.0.8059.39. CPU is capped at 50% of one core. The account includes the controller and tools; PSS is sampled, not exact model RAM. GPU memory is unavailable.

The runner closes at a conservative 700 MiB account margin or below 768 MiB host available RAM. The external host controls remain unchanged. All own browser sessions are closed; there was no host memory-stop incident or quarantine.

| Check | Observed result | Peak sampled account MiB |
|---|---|---:|
| Keyword, agent-browser/full Chrome | Ran synthetic keyword inference, then resource-deferred | 991.0 |
| Keyword, direct full Chrome | Ran synthetic keyword inference, then resource-deferred | 919.2 |
| Keyword, multiprocess headless shell | Ran synthetic keyword inference, then resource-deferred | 747.0 |
| Keyword, single-process headless shell | Completed synthetic run and screenshot | 678.6 |
| MobileBERT INT8, WASM | Loading resource-deferred before usable initialization/logits | 703.5 |
| Ettin INT8, WASM, initial setup | Missing asyncify loader revealed a harness packaging bug, subsequently fixed; resource-deferred | 707.5 |
| Ettin INT8, corrected runtime/default graphics policy | Loading resource-deferred before usable initialization/logits | 736.1 |
| No-weight WebGPU capability probe | API present, `requestAdapter()` returned no usable adapter; graph untested | 615.8 |

CPU diagnostic runs used headless/single-process/no-zygote and sometimes GPU/rasterizer disabling flags, all recorded per run. These are constrained smoke results, not ordinary extension startup/performance or broad hardware compatibility evidence. The GPU capability probe did not enable software WebGPU and did not create a device or load weights.

MobileBERT FP32 and Ettin FP32 remain untested because their larger allocation requirements were not justified after compact loads exceeded the margin. SponsorSkip and Ettin WebGPU graphs remain untested because no usable adapter was available. Do not describe resource deferral as proof a model is incompatible with Chrome in general. A further MobileBERT attempt was rejected by automatic approval review because earlier loads exceeded the memory margin; it was not executed.

## Quality and recommendation

Selection inference and test evaluation were **not executed**. `bench/frozen-config.json` records default/published decoder configurations with `status: unavailable`; no thresholds were learned from missing data. Missing-caption prediction records are explicit deferral/coverage ledgers, not browser timing results. Synthetic smoke is separated from selection reporting.

Segment precision/recall, missed sponsor time, boundary accuracy, ordinary-content loss and real false-skips/hour cannot be established from this attempted pilot. Null/unavailable metrics must not be reported as zero error. The keyword baseline cannot justify a production choice. No FP32/INT8 quality tradeoff or working CPU fallback was established.

Next required experiments:

1. Obtain permitted complete caption tracks for the frozen IDs, or document same-stratum replacements and freeze a new manifest before tuning. Keep acquisition/label provenance distinct. Resolve campaign duplication and channel contamination uncertainty.
2. Run actual learned-model inference on a personal machine with enough memory, including a representative WASM path and a physical WebGPU device. Keep graphs/providers separate and collect failures and actual timing/memory evidence. Preserve the VPS limits.
3. Verify Ettin's exact Flow normalization literals, confidence aggregation and overlap decoding against the upstream implementation. The current reconstructed adapter is experimental. SponsorSkip's decoder is derived from pinned reference GPL source; its word-time mapping still needs caption-boundary evaluation.
4. Tune only on tuning channels, freeze configuration, evaluate the locked test once, inspect all candidates on the same versioned reviewed reference set, and review negative exposure and worst boundaries. Agree numeric automatic-skipping acceptance gates after observed tradeoffs; none has been adopted.

The report provides per-video inspection, score traces where available, acquisition failures, supported categories/backends, and a balanced review queue. Reproduce using [bench/README.md](../bench/README.md). Local generated report: `bench/results/report/index.html`, JSON/CSV/recommendation and screenshots. Generated captions, binaries and reports are ignored; only acquisition manifests, small synthetic fixtures, implementation and evidence summary are committed.

## Rights and sources

Benchmark source includes a separately attributed GPL-3.0-or-later SponsorSkip decoder; weights and label data are separately CC BY-NC-SA 4.0. MobileBERT redistribution rights remain unverified. Production code retains its existing UNLICENSED status. No raw captions or model binaries are published in this change. See [reference notices](../bench/reference/NOTICE.md).

Primary pinned sources: [MobileBERT artifacts](https://huggingface.co/Xenova/mobilebert-uncased-mnli/tree/8b0ea66ab7b190bba77418ba03b67d69cfc9a1ee), [Ettin release](https://huggingface.co/CuriousDragon/ettin-17m-sponsor-combined/tree/4c5d62ea8e70e2cd8c45d707a404e3692c0434bf), [Ettin exports](https://huggingface.co/CuriousDragon/ettin-17m-sponsor-combined-android/tree/d4939256c49e92d158429a55fcf39477d003dd58), [SponsorSkip graph](https://huggingface.co/edde746/sponsorskip-modernbert/tree/3468d080e70e4be8272d979ce5fd10bcea7cf9f5), [SponsorSkip decoder source](https://github.com/edde746/sponsorskip/blob/01e53cbe8beb02f0ce125736b88df99396793595/src/offscreen/detector.ts), [SponsorBlock data license](https://github.com/ajayyy/SponsorBlock/wiki/Database-and-API-License).
