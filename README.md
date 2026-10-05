# YouTube sponsor detection prototype

A Chromium Manifest V3 extension experimenting with local MobileBERT classification of YouTube captions. It observes caption requests, scores overlapping windows, caches estimated intervals and offers manual skip suggestions for configured categories. Automatic skipping is an experimental, explicit opt-in; every skip has Undo. The popup supports labels, thresholds, and an enable toggle.

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

The global enable toggle now also controls cached skipping in an already-open player. Playback changes wait for saved settings, and live toggles take precedence over an older settings read. Label changes and cross-tab cache invalidation still need integration checks.

## Current draft evidence and remaining gates

The default playback mode highlights suggestions and requires a click. Undo restores the prior playback position and suppresses another skip of the same segment. Disable, navigation and player replacement invalidate retained controls. Real-source fixtures cover these paths, explicit opt-in, failure messages, single model initialization and bounded streaming asset verification. All five test files pass; these are fixtures, not a live browser run.

A real model was downloaded from [the pinned upstream repository](https://huggingface.co/Xenova/mobilebert-uncased-mnli/tree/8b0ea66ab7b190bba77418ba03b67d69cfc9a1ee). Its model card/API has no license declaration. Code remains UNLICENSED; model redistribution and any store release stay blocked pending rights review. No model weights or bundle are committed or uploaded by this PR.

Still required: actual local inference/load evidence, browser/YouTube smoke checks, service-worker restart and settings/cache-policy correctness, caption/window/boundary checks, and independent held-out channel annotations/evaluation. Experimental opt-in auto-skip is draft functionality; it must not be marketed as reliable or shipped before the held-out accuracy and browser Undo gates pass.
