# YouTube sponsor detection prototype

A Chromium Manifest V3 extension experimenting with local MobileBERT classification of YouTube captions. It observes caption requests, scores overlapping windows, caches estimated intervals and attempts to skip configured categories. The popup supports labels, thresholds, and an enable toggle.

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

`npm test` runs dependency-free syntax and configuration checks. It performs no model inference or download. `npm run setup` is a heavier step: it loads a Transformers pipeline to download/cache a model, then copies assets into `model/`. Run it on a suitable development machine, not a memory-constrained shared server.

Known model-setup gap: the setup script chooses the first cached `.onnx` file and renames it `model.onnx`, while the classifier asks for a full-precision artifact. The quantization/artifact contract is not verified. A successful webpack build alone cannot prove that inference loads the correct weights. Resolve this before claiming reproducible classifier results. The build requires real local model assets; model files and generated `dist/` are ignored by Git.

Load `dist/` through `chrome://extensions` → Developer mode → Load unpacked. Verify in a disposable browser profile. The current prototype relies on captions being requested by the player; videos without suitable captions may produce no result.

## Checks and experiments

```bash
npm test               # fast syntax/manifest/package checks; no ML
npm run evaluate       # existing exploratory classifier experiment; needs model
npm run debug -- "this video is sponsored by" "promotional content,neutral content"
npm run build          # webpack bundle, requires actual model files
```

The evaluation script tries labels/thresholds against `test_data.js`. It tunes and scores on the same sample sentences, prints results, and has no pass/fail accuracy assertion. It is an experiment, not a regression suite or independent accuracy benchmark. Model errors currently fall back to 0.5 scores, so output can be misleading when weights fail to load.

## Next milestone

Make model setup deterministic; add fixture-driven caption/window/interval checks; prove disable, cache and navigation behavior; then measure precision, boundary errors, latency and memory on held-out examples. Start with suggested intervals and reversible manual skipping. Store submission and automatic-skipping reliability claims come after those acceptance gates.
