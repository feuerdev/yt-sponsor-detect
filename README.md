# YouTube sponsor detection prototype

The Chrome 116+ extension now uses **Ettin INT8** for paid-sponsor suggestions.
Automatic skipping stays disabled; every Skip requires a click and has Undo.
The benchmark is provisional: 14/50 pilot captions, nine acquired test videos,
and only one paid-sponsor holdout reference. See [integration and rights](docs/ettin-integration.md)
and [benchmark evidence](docs/benchmark-evidence.md).

The extension observes English caption requests, processes the complete transcript
in overlapping token windows, caches estimated intervals and offers manual
suggestions. Self-promotion and custom categories are unsupported. The popup
controls enable, paid-sponsor suggestions and minimum confidence. Legacy
zero-shot labels migrate to a sponsor-only policy; automatic opt-ins are ignored.

Suggestions can be wrong or miss sponsors. When YouTube caption requests fail, open the public transcript panel, clear any
transcript search and click **Analyze open transcript** in the popup. The fallback
verifies English with Chrome language detection and reads the open panel only.
Modern panel timestamps are approximate. Sparse, partial, ambiguous, live and
non-English transcripts can remain unavailable. Inference uses bundled local assets; setup and YouTube
need network access. No caption upload or remote model loading is implemented.
A formal privacy/network review and independent accuracy evidence remain release
gates. The project is UNLICENSED pending an owner decision; model weights and
GPL-derived code have separate obligations before any distribution.

## Build from source

```bash
git clone https://github.com/feuerdev/yt-sponsor-detect.git
cd yt-sponsor-detect
npm ci
npm test
npm run setup
npm run build
```

Setup streams four exact assets from the immutable revision in `src/model-spec.js`,
checks sizes/SHA-256, and publishes a complete directory. Damaged existing assets
are diagnosed, not overwritten. Setup/tests do not run model inference. Build
verifies real model assets first; never build with placeholder weights.

The graph is `sponsor_detector_combined.int8.onnx` at revision
`d4939256c49e92d158429a55fcf39477d003dd58`, about 32 MiB including tokenizer/config.
ORT 1.29.0's local GPU/CPU loaders and WASM are bundled separately, so the total
extension is larger. An offscreen document owns a dedicated inference worker.
Native WebGPU is preferred; unavailable GPU or GPU graph initialization failure
selects WASM. A GPU inference failure retries the full track once on CPU after
releasing the GPU session. Invalid outputs remain failures. The idle worker
releases its model after 60 seconds.

Load `dist/` using `chrome://extensions` → Developer mode → Load unpacked in a
disposable profile. Model files and generated `dist/` remain ignored. Reload a
video after changing detection settings or clearing suggestions, or analyze its
open transcript from the popup.

## Checks and experiments

```bash
npm test               # source/configuration, decoder and lifecycle checks; no model inference
npm run verify:model   # verify existing production assets
npm run build          # local extension bundle; requires verified real assets
```

The old `evaluate`/`debug` sentence-label experiments are retired. Ettin emits
timed token intervals and supports paid sponsorships only. Use the Chrome
benchmark runner with the documented resource policy for real model experiments;
see [bench/README.md](bench/README.md).

The [guarded overlap study](docs/ettin-overlap-study.md) explores decoding improvements
without using the exposed test set. Its promising in-sample result did not pass
channel-held-out checks, so production remains on the shipped decoder and threshold.

## Reliability and evidence

Cache keys bind the model revision/graph, pipeline version, decoder gaps and
threshold/category policy. Old MobileBERT, expired, incomplete and malformed
entries are rejected. Completed-cache read/evict/write is serialized, with 30
videos retained for 48 hours. Disable, settings changes, navigation, closed tabs
and player replacement invalidate obsolete results and playback controls.
Failures clear partial suggestions and allow caption-request retries. Whitespace
JSON3 separators are filtered before speech-boundary validation.

The prior [PR #1 synthetic browser evidence](docs/review-evidence/README.md),
[isolated browser benchmark](docs/benchmark-evidence.md) and
[current integration evidence](docs/ettin-integration.md) describe distinct
checks. Passing fixtures or a synthetic installed-browser smoke does not prove
live YouTube reliability, worker suspension, general detection accuracy or safe
automatic skipping. Common human-reviewed references/negative exposure, more
captions, campaign/training-overlap review and numeric release gates remain open.
