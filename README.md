# Local YouTube sponsor viewer

The viewer redesign on this branch targets English paid sponsorships with automatic skipping on by default. Captions are acquired proactively and analyzed on-device while playback continues. A compact Undo control replays an estimated skipped interval; estimates can include regular content. Self-promotion is optional and initially off.

**Implementation status:** the new viewing flow, transcript adapter and playback controls have source-level regression evidence. Production uses an experimental MobileBERT comparison baseline; model accuracy, ordinary-device performance and live YouTube integration are not established. Requirements and the exact evidence ledger are in [docs/viewer-experience.md](docs/viewer-experience.md). [Source attribution and separate model terms](docs/viewer-attribution.md) apply. No model binaries or raw captions are committed.

```sh
npm ci
npm test
npm run setup
npm run build
```

Setup streams and SHA-256-verifies the exact production assets from `src/model-spec.js`; build requires those real assets. Load `dist/` as an unpacked extension in desktop Chrome 116+. The default controls work without opening the popup. Use the popup to pause skipping for the current video, toggle automatic skipping, retry retrieval, inspect estimated intervals or see local model diagnostics. Viewing preferences apply without reload.

The MAIN-world script uses YouTube's internal player/caption endpoints, not the official caption-download API or a proxy. Retrieval failures and unavailable/unsupported captions produce visible states. English caption text is required; local audio transcription is a separate proof of concept. Caption fetching and initial asset setup need network access; inference never uploads transcript text and remote model loading is disabled. Internal endpoint compatibility and complete privacy/network behavior still require browser verification.

`npm test` is sequential, dependency-free for lifecycle checks, and does not run inference or download models. It includes legacy-source regressions and separate tests of the new production viewer modules/entrypoints. Those fixtures do not prove detector accuracy. The isolated pinned benchmark in `bench/` compares NLI and word-level candidate decoding; its previous 50-video attempt could not obtain captions or complete learned-model loads within VPS limits. [Benchmark evidence](docs/benchmark-evidence.md) preserves those limitations.

## Historical prototype documentation

The material below describes earlier manual-first prototype work and evidence; it does not override the new viewer behavior or establish current production accuracy.

# YouTube sponsor detection prototype

> Current direction (7 October 2026): the isolated full-track benchmark in `bench/` takes precedence over historical sentence threshold tuning and automatic-skipping plans. See `bench/README.md` and `docs/benchmark-evidence.md`. The 50-video pilot was attempted but captions and learned-model runtime evidence are blocked; automatic skipping stays disabled.

A Chromium Manifest V3 extension experimenting with local MobileBERT classification of YouTube captions. It observes caption requests, scores overlapping windows, caches estimated intervals and offers manual skip suggestions for configured categories. Every manual skip has Undo. Automatic skipping is unavailable until independent reliability evidence supports it; legacy opt-in settings are ignored. The popup supports labels, thresholds, and an enable toggle.

**Prototype status:** segment boundaries, caption acquisition, navigation/session handling and settings/cache behavior need verification. Detection accuracy has not been established on a held-out dataset. Do not assume that every sponsor is detected or that an estimated interval contains only sponsored content.

Inference is configured to use local model files and disallow remote model loading. Model setup downloads files, and captions come from YouTube; the complete extension is not an offline video-analysis tool. No transcript upload is implemented, but a formal privacy/network review is still a release requirement.

See [the continuation plan and technical specification](docs/project-readiness.md). The repository is currently marked `UNLICENSED`; model/data rights and code licensing must be decided before distribution.

## Build from source

```bash
git clone https://github.com/feuerdev/yt-sponsor-detect.git
cd yt-sponsor-detect
npm ci
npm test
npm run setup
npm run build
```

`npm test` runs dependency-free syntax/configuration checks and real-source lifecycle regression fixtures with one test worker. It performs no model inference or download. `npm run setup` streams four exact assets from the revision in `src/model-spec.js`, checks their sizes and SHA-256 hashes, then publishes the complete directory. It never initializes inference. Existing damaged/incomplete assets are diagnosed rather than overwritten. `npm run verify:model` checks existing assets; the build runs it first.

The setup and runtime contract specifies the full-precision `onnx/model.onnx` artifact at revision `8b0ea66ab7b190bba77418ba03b67d69cfc9a1ee`. A real download and hash verification, followed by the production webpack build, passed on Node 24.15.0 with a 192 MiB heap limit. The bundle includes roughly 95 MiB of model assets and 37 MiB of WASM; size warnings remain. A successful build does not establish inference loading or browser compatibility. The build requires real local model assets; model files and generated `dist/` are ignored by Git.

Load `dist/` through `chrome://extensions` → Developer mode → Load unpacked. Verify in a disposable browser profile. The current prototype relies on captions being requested by the player; videos without suitable captions may produce no result.

## Checks and experiments

```bash
npm test               # syntax/configuration + lifecycle regressions; no ML
npm run evaluate       # existing exploratory classifier experiment; needs model
npm run debug -- "this video is sponsored by" "promotional content,neutral content"
npm run build          # webpack bundle, requires actual model files
```

The evaluation script tries labels/thresholds against `test_data.js`. It tunes and scores on the same sample sentences, prints results, and has no pass/fail accuracy assertion. It is an experiment, not a regression suite or independent accuracy benchmark. Model initialization/inference/malformed output now fails explicitly with sanitized errors. Partial segments are cleared and the player shows an unavailable status; playback remains unchanged. Concurrent calls share one initialization, and a failed initialization can be retried.

## Next milestone

Make model setup deterministic; add fixture-driven caption/window/interval checks; prove disable, cache and navigation behavior; then measure precision, boundary errors, latency and memory on held-out examples. Start with suggested intervals and reversible manual skipping. Store submission and automatic-skipping reliability claims come after those acceptance gates.

## Verified lifecycle fixes

Real-source Node fixtures cover player replacement, same-player navigation, late cached responses, rapid return to a video, player/progress-bar removal and background state cancellation. The content script releases detached listeners and rejects obsolete cache callbacks; background analysis stops emitting results or restoring cache after its state is cleared/replaced. These fixtures do not establish browser integration, YouTube compatibility or classifier accuracy.

The global enable toggle now also controls cached skipping in an already-open player. Playback changes wait for saved settings, and live toggles take precedence over an older settings read. Label and enable changes cancel in-flight work and invalidate current suggestions. Completed caches bind the model revision/hash and label names, thresholds and blocked status; legacy, expired, incomplete or malformed entries are ignored. Caches retain at most 30 videos for 48 hours. After category changes or clearing suggestions, reload the video to request captions again.

## Current draft evidence and remaining gates

The default playback mode highlights suggestions and requires a click. Undo restores the prior playback position and suppresses another skip of the same segment. Disable, navigation and player replacement invalidate retained controls. Real-source fixtures cover these paths, legacy opt-in rejection, failure messages, single model initialization and bounded streaming asset verification. All six test files pass; these are fixtures, not a live browser run.

A real model was downloaded from [the pinned upstream repository](https://huggingface.co/Xenova/mobilebert-uncased-mnli/tree/8b0ea66ab7b190bba77418ba03b67d69cfc9a1ee). Its model card/API has no license declaration. Code remains UNLICENSED; model redistribution and any store release stay blocked pending rights review. No model weights or bundle are committed or uploaded by this PR.

Still required: actual local inference/load evidence, browser/YouTube smoke checks, real browser service-worker restart and settings/cache-policy checks, representative caption/boundary checks, and independent held-out channel annotations/evaluation. Automatic skipping remains unavailable before the held-out accuracy and browser Undo gates pass. Node fixtures simulate worker restart with shared persisted storage, settings changes during inference, repeated caption requests, invalid intervals and bounded cache eviction; they do not substitute for browser or held-out detection evidence.
