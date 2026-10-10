# Local YouTube sponsor viewer

An experimental desktop Chrome extension for English paid sponsors, using the pinned Ettin INT8 detector locally with WebGPU and CPU/WASM fallback. This viewer redesign enables automatic skipping by default, keeps playback running during analysis, and provides a compact Undo control. Undo returns to the estimated interval start and prevents repeated skipping for the visit. Estimates can include ordinary content.

Captions are acquired proactively with English-track fallback. If internal YouTube requests fail, the existing public transcript-panel recovery is retained; its panel may briefly open and is restored when safe. Partial panel transcripts show limited coverage and are not cached as complete results. Videos without usable English speech captions remain playable. Self-promotion is not currently supported by the retained model.

The popup focuses on the current video: enable, automatic skipping, pause, retry, estimated intervals and optional diagnostics. Viewing preferences apply without reloading. Classification phrases and numeric thresholds are hidden from normal settings.

## Build and install

Use desktop Chrome 116+ and Node.js 24.15+.

```sh
npm ci
npm test
npm run setup
npm run build
```

Setup streams and verifies the pinned assets from `src/model-spec.js`; builds require those real assets. Load `dist/` as an unpacked extension through `chrome://extensions`. No model binaries, raw captions, browser profiles or authentication state are committed.

## Evidence and limits

The previous benchmark branch's pinned Ettin/Flow pipeline, GPU failure recovery, caption-panel recovery and evaluation tooling are preserved. The new viewer uses provided word timestamps where available and estimated panel timing otherwise. That timing/preprocessing path needs its own evaluation; prior cue-based quality measurements do not establish viewer accuracy or an ordinary-content-loss bound.

[The implementation and evidence ledger](docs/viewer-experience.md) distinguishes source fixtures, rendered native-media checks, historical benchmark work and remaining installed-extension/live YouTube/model checks. Synthetic detector fixtures do not prove accuracy. No other device is currently available for new ordinary-device measurements, and neural workloads are not retried on the constrained VPS.

## Privacy and licensing

Inference uses bundled local assets and does not upload captions. YouTube requests and initial asset setup need network access. Settings use Chrome sync storage; complete estimated intervals stay in local storage for up to 48 hours. Full runtime network behavior still needs installed-browser verification.

The original project remains UNLICENSED. Ettin weights are CC BY-NC-SA 4.0; the retained Flow decoder is GPL-3.0-only. Viewer modules adapting SponsorSkip's design are GPL-3.0-or-later. See [third-party notices](licenses/NOTICE.md) and [viewer attribution](docs/viewer-attribution.md). No store release, commercial rights clearance, merge or deployment is part of this change.
