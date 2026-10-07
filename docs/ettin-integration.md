# Ettin extension integration

The extension now uses the same pinned Ettin INT8 graph as the browser benchmark:
CuriousDragon/ettin-17m-sponsor-combined-android, revision d4939256c49e92d158429a55fcf39477d003dd58.
Automatic skipping remains disabled; suggestions require a click and support Undo.

## Classification and selection

Before this switch, MobileBERT classified arbitrary label hypotheses on windows of
20 caption cues, advanced by five cues, ignoring text shorter than 50 characters.
It marked an entire positive window and coalesced overlapping windows. Tracks
shorter than 20 cues and a final partial window could be omitted.

Only explicitly English caption requests are analyzed; other or unidentified languages report unavailable.
Ettin analyzes every nonempty, valid speech cue in the acquired transcript. It
normalizes text, maps tokens to cue times, processes 766 content tokens plus two
special tokens with 128-token overlap, including the final partial window, and
uses the verified Flow BILOU decoder/stitching to return narrower paid-sponsor
intervals. No ad-likelihood prefilter selects candidate passages. It does not
support self-promotion, subscribe reminders, reviews or arbitrary custom labels.

The default span confidence threshold is 0.8 from the frozen provisional tuning
configuration. This is not a calibrated correctness probability or release gate.
Legacy zero-shot category names/thresholds migrate to the sponsor-only setting;
existing global enable and known sponsor-category disabled state are preserved.
Model/pipeline/configuration changes invalidate old cached suggestions. Cache
limits, stale-tab/settings cancellation, failure/retry and manual Undo remain.

## Browser runtime

Chrome 116+; the service worker creates one offscreen document (WORKERS reason),
which owns a dedicated inference worker. Native WebGPU is preferred; GPU graph
initialization failure or absent GPU selects WASM explicitly. ORT 1.29.0 and
Tokenizers 0.1.3 are bundled locally. No CDN imports, remote model loading or
caption upload. Concurrent jobs are serialized; the idle worker terminates after
60 seconds, releasing its model. A 180-second request timeout terminates a stuck
worker and reports unavailable. No inference executes in setup or Node tests.

## Rights and attribution

Model weights/configuration: CuriousDragon, [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
Pinned [model card](https://huggingface.co/CuriousDragon/ettin-17m-sponsor-combined-android/blob/d4939256c49e92d158429a55fcf39477d003dd58/README.md).
Base encoder: jhu-clsp/ettin-encoder-17m, MIT. SponsorBlock-derived labels have
separate non-commercial/share-alike obligations. The benchmarked INT8 weights
are unchanged; their format/precision is the upstream quantized export.

The Flow preprocessing/decoder/window-stitching port is GPL-3.0-only;
original author/project seshuthota/Flow, pinned origin
[ d3d628dfc15025b725d311c38c5891e9e2549948 ](https://github.com/seshuthota/Flow/tree/d3d628dfc15025b725d311c38c5891e9e2549948/ml/sponsor_detection).
See bench/reference/ettin-parity.md and FLOW-LICENSE. The integration modules
ettin-engine.js and inference-worker.js carry GPL-3.0-only notices.
ONNX Runtime Web is MIT; Tokenizers is Apache-2.0. Build copies notices/full
runtime, tokenizer and Flow license texts into dist/licenses.

This is a private non-commercial prototype build, not a store/distribution
approval. The original project remains UNLICENSED pending the owner's project
license decision. Distributing combined covered code requires GPL-compatible
licensing and corresponding source; distributing/adapting weights requires their
own attribution, non-commercial and share-alike compliance. No commercial rights
or model-training-data rights clearance is established here.

## Evidence limits

The original frozen benchmark records and exposure ledger are preserved. This
new extension integration is an engineering change after that benchmark; its
browser smoke tests do not create another independent quality evaluation.
Only one paid reference existed in the acquired holdout. Human-reviewed negatives,
remaining captions and agreed numeric release gates are still pending.

## Installed-extension checks (8 October 2026, Berlin)

99/99 tests passed with no skips, including real Chrome environment guards,
caption/cache races, explicit GPU-load failure fallback, window tails, decoder
intervals, settings migration, worker errors/lifetime and manual playback controls.
A production build verified the real pinned model bytes and bundled every local
runtime dependency. Webpack reported asset-size warnings for the model/runtime.

The actual unpacked MV3 bundle was installed in disposable Chrome 155.0.8059.40
profiles on an Apple M1 Pro. Inference ran in the extension worker on both native
Apple Metal WebGPU (non-fallback adapter) and explicit WASM with GPU disabled.
Both completed the offscreen/messaging/cache path. At the shipped 0.8 threshold
the short synthetic fixture abstained. A diagnostic 0.7 setting generated a
suggestion to exercise the real manual controls, and changed the cache policy
key. This is not threshold tuning or accuracy evidence. The shipped default
remains 0.8. On both paths manual Skip moved 1.5 → 8 seconds and Undo restored
1.5 seconds. Nothing sought automatically.

Opening the actual popup at 390px migrated legacy categories/0.98 to sponsor/0.8,
preserved global and sponsor-disabled settings, and forced automatic skipping
off. Its document width equalled the viewport, with no horizontal overflow.
Both runs recorded no browser runtime errors or external model requests in the
attached page/background/offscreen/worker network scope. YouTube responses were
fulfilled with our own synthetic captions/player in these profiles. This does
not verify live YouTube caption acquisition, network privacy beyond that scope,
Chrome 116 compatibility, sustained performance or extension worker suspension.

Fixed resource guards remained at 28,672 MiB maximum same-UID RSS and 4,096 MiB
minimum available-memory proxy. GPU and CPU peaks were below the cap. These
include unrelated apps/shared-page duplication, not model-memory measurements.
All owned browsers/profiles were closed/removed after each run.

- [GPU installed-extension result](ettin-evidence/ettin-extension-gpu.json) and [suggestion screenshot](ettin-evidence/ettin-extension-gpu.png).
- [CPU installed-extension result](ettin-evidence/ettin-extension-cpu.json) and [suggestion screenshot](ettin-evidence/ettin-extension-cpu.png).
- [Actual popup after migration](ettin-evidence/ettin-popup-cpu.png).

To reproduce this installed-extension smoke on the same macOS/native Apple GPU
profile, first build verified real assets. Node only orchestrates Chrome/CDP,
network fixtures and resource checks. It never loads a model. Prerequisites:
Node 24+, Chrome supporting CDP Extensions.loadUnpacked, agent-browser and
FFmpeg. The separate existing unit suite does not require this manual script.

```bash
mkdir -p bench/local
ffmpeg -f lavfi -i color=c=0x243b53:s=800x450:r=10 -t 45 -c:v libx264 -pix_fmt yuv420p -movflags +faststart -an bench/local/ettin-fixture.mp4
node tests/browser/ettin-smoke.mjs gpu
node tests/browser/ettin-smoke.mjs cpu
```

BENCH_CHROME, ETTIN_SMOKE_MEDIA and ETTIN_SMOKE_OUTPUT may override the Chrome
executable, local synthetic MP4 and ignored evidence directory respectively.
The GPU check requires a native Apple adapter. No software-GPU enable flag is
used. CPU explicitly disables GPU and software rasterization. Both keep the
same fixed Mac resource guards. The checked-in reusable script was also run
successfully on CPU after extracting it from the original smoke harness.
