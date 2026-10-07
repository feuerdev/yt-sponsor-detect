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
