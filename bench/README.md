# Sponsor detection browser benchmark

An isolated English, full-caption-track benchmark. Production `src/` behavior is unchanged and automatic skipping stays disabled. See `docs/benchmark-evidence.md` for the actual attempted pilot and limitations; this harness does not authorize a release.

## Reproduce from a clean checkout

Use Node 24.15+ and Python 3.8+. Install Chrome/Chromium or `agent-browser` and its browser. On a small VPS, use one browser/page and one test/build worker, sequentially; honor the host rules. The runner defaults to a 700 MiB account PSS margin and 768 MiB available host RAM, closes its browser in `finally`, and keeps failed runs. Linux `/proc` memory sampling is required in this version. Do not raise the margin to make a failing workload pass.

```sh
npm ci --ignore-scripts
npm run bench:setup -- --models mobilebert-fp32,mobilebert-int8,ettin-int8,ettin-fp32
npm test
npm run bench:run -- --split smoke --model mobilebert-int8 --backend wasm --chrome /absolute/path/to/chrome
npm run bench:run -- --split smoke --model ettin-int8 --backend wasm --chrome /absolute/path/to/chrome
npm run bench:run -- --split smoke --model sponsorskip-base --backend webgpu --chrome /absolute/path/to/chrome
```

A no-weight capability check is available with `node bench/gpu-probe.mjs --chrome /absolute/path/to/chrome`; it does not initialize a GPU device or graph. `node bench/defer.mjs --reason '<specific limitation>'` records explicitly unexecuted paths without manufacturing timing/compatibility evidence.

Without `--chrome`, the runner uses a named `agent-browser` session and closes it. This controller has substantial overhead on the tested VPS. `--chrome` uses a small Node CDP controller and one page. CPU runs in this controller disable GPU/rasterizer by default; `--browser-gpu-policy default` retains the browser defaults when comparing their measured footprint; every flag and browser version is recorded. These are constrained headless measurements, not proof of ordinary installed-extension performance or broad compatibility. `--single-process` optionally reduces subprocess overhead for local synthetic checks; disclose it as a nonrepresentative mode. No software WebGPU flag is enabled. GPU runs request a real browser adapter and preserve unavailability; there is no silent WASM/GPU substitution. SponsorSkip requires WebGPU and is probed before fetching its graph. If a usable GPU is present, install its pinned assets explicitly:

```sh
npm run bench:setup -- --models sponsorskip-base
```

Setup streams pinned files sequentially and verifies SHA-256/size. Existing production FP32 assets may be hardlinked after verification. Runtime JavaScript/WASM is copied from pinned npm packages, including licenses; no CDN executable code is used. Inference only occurs inside Chrome. Node performs acquisition, hashing, interval evaluation and cached decoding.

## Pilot acquisition and splits

`bench/datasets/pilot.json` contains the frozen 50-video/18-channel pilot. It has 25 paid, 15 challenging and 10 ordinary sampling strata; those strata are not verified negative labels. RSS and SponsorBlock snapshots/provenance, initial discovery failures and caption attempts remain visible. Public examples and the 39 Ettin canary videos are excluded. Whole-channel SHA-256 ordering creates approximately 60/40 tuning/test groups. Campaign duplication and training-channel overlap remain unknown; human review must address them before independent claims.

```sh
npm run bench:dataset -- --manifest bench/datasets/pilot.json
```

Existing successful fixture hashes are checked, not silently replaced. Failed acquisitions stay failed unless `--retry-failures` is explicit. The observed empty timedtext responses must be investigated before another 50-request retry. Raw captions and normalized fixtures stay in ignored `bench/local/`; no captions or weights are committed. A clean checkout must acquire permitted caption data before scoring. To create a new pilot, pass a *new* manifest path; do not overwrite the selection that informed tuning. Discovery uses 18 English-oriented public channel feeds and records substitutions if requested strata are unavailable. Channel grouping outranks exact split stratification. Upload dates are recorded but do not prove independence from model training.

Category policy is frozen in `datasets/category-policy.json`: paid sponsor and self-promotion separately; ordinary reviews/like-subscribe requests neutral; unclear affiliate/gifted-product cases uncertain. SponsorBlock references are provisional and partial. No submissions and empty reviewed-negative lists mean unknown. Caption acquisition failures count in coverage and are not replaced silently. Reference annotations retain UUID/votes/locked metadata and snapshot times; source attribution is SponsorBlock, CC BY-NC-SA 4.0.

## Run, cache, tune and lock

```sh
npm run bench:run -- --split tune --model mobilebert-int8 --backend wasm --chrome /absolute/path/to/chrome
npm run bench:run -- --split tune --model ettin-int8 --backend wasm --chrome /absolute/path/to/chrome
npm run bench:run -- --split tune --model ettin-fp32 --backend wasm --chrome /absolute/path/to/chrome
npm run bench:run -- --split tune --model sponsorskip-base --backend webgpu --chrome /absolute/path/to/chrome
npm run bench:tune -- --split tune
npm run bench:run -- --split test --model mobilebert-int8 --backend wasm --config bench/frozen-config.json --chrome /absolute/path/to/chrome
npm run bench:report
npm run bench:serve
```

Run supported candidate/backend combinations sequentially. Registry compatibility is a requested matrix, not a promise an ONNX graph will load. The exact configuration unit includes weights/precision, tokenizer, normalization, labels, windows, decoder and provider. `bench/results/<run-id>` stores metadata, one prediction per video, raw-score caches and a screenshot. Metadata captures model revision/hashes/bytes, runtime versions, repository commit plus dirty/untracked source hashes, fixture/registry/config/inference hashes, browser/hardware, actual selected provider, timing methodology and sampled account memory. Initialization failures, unsupported provider, missing captions, invalid output, abstention and resource deferral are preserved.

`bench:tune -- --runs <comma-separated-tune-run-ids>` reuses raw browser probabilities; no inference runs during threshold sweeps. Cached fixture/inference/hash identity must match. Seven fixed decoder operating points are available per learned candidate; label wording and windowing are held fixed. Keyword is frozen, diagnostic only. The initial conservative operating point maximizes recall among points with observed ≥95% provisional segment agreement precision and at least one match; if none qualifies or there are no scored fixtures, defaults are frozen and no model selection is claimed. This is a diagnostic rule, not a statistically supported release gate. A zero-detection candidate cannot win by undefined precision.

Test requires a frozen config matching registry, channel selection and fixture set. `bench/local/test-ledger.json` prevents changing the frozen config after test exposure. Test errors make the test set development data; create a fresh holdout before further independent claims. `--warm-repeat` explicitly repeats inference once for warm timing on a smoke fixture; it does not tune thresholds. `--limit` is allowed only for smoke, never for selection scoring.

## Metrics and inspection

`contracts.mjs` is the runtime fixture/prediction contract, with synthetic examples in `fixtures/`. The evaluator rejects non-finite, reversed, negative or out-of-duration intervals; categories and annotation statuses are explicit. Complete annotation claims require reviewed coverage of the whole duration.

Category-matched temporal IoU 0.3/0.5/0.7 uses deterministic maximum-cardinality one-to-one bipartite matching, exploring highest-IoU edges first and augmenting to avoid greedy undercounts. IoU 0.5 is the primary diagnostic. It is not maximum-total-IoU assignment. Interval unions avoid duplicate exposure. Reports include matched/unmatched spans, uncovered reference seconds, temporal recall, signed/median/p95 boundary errors, unknown predicted time, wholly false skips and removed ordinary seconds in explicit reviewed negative regions only. Errors intersecting negative time are reported even if not wholly false. No reviewed negatives means false-skips/hour **unavailable**. Provisional agreement is not real-world correctness. Failures are excluded from quality and included in acquisition/runtime coverage.

Paired run comparisons use identical fixture hashes and resample shared channels together. Bootstrap replicates do not bound unseen rare failures. Channel cluster bootstrap provides percentile intervals using a fixed seed and 500 samples; fewer than two channels is unavailable. Few channels give limited precision. Reports separate category/backend/precision, performance and status coverage. `index.html` includes per-video references vs predictions, caption cues, cached score traces and a balanced review queue including no-detection and challenging cases. JSON/CSV provide machine-readable evidence. Reports do not rank synthetic smoke as quality.

Fresh load uses a new browser process but OS disk cache is unspecified. Browser `performance.now()` records initialization, inference, decoding, first usable complete-track result from the start of the sequential run and explicit warm repeats. Responsiveness uses 50 ms event-loop lag, with coarse JS heap when available. Peak account PSS includes the controller/browser/account processes visible in `/proc`, is sampled rather than guaranteed peak, and is **not model RAM**. GPU memory is unavailable. No timing or compatibility is manufactured for untested devices.

## Model reproduction and rights

- MobileBERT: pinned existing FP32 and separately pinned `model_int8.onnx`, Transformers.js 2.17.2/WASM. Benchmark label wording is fixed in models.json; historical `npm run evaluate` is a 23-sentence exploratory tuner, not interval accuracy evidence.
- Ettin: pinned FP32/INT8 exports, ONNX Runtime Web 1.29.0, BILOU classes and 768-token windows/128 overlap. Cue-character mapping validates reversible tokenizer bytes. Published normalization and merging are reconstructed, but exact Flow normalization literals/confidence/overlap parity remain **unverified**. Do not call this a faithful published-quality reproduction until parity is checked.
- SponsorSkip: unchanged pinned reference detector, first-subtoken pooling, pruned special/pad token remapping, fixed masked windows, overlap averaging and hysteresis decoding. Cached pure decoder derives from the same GPL source. Word timestamps are interpolated within available cues, with a 0.4 s tail as upstream; out-of-duration results are rejected, not silently clamped.
- Keyword: four frozen explicit phrases at native cue times; diagnostic, no automatic-skip recommendation.

Weights and labels have separate rights from code. See `reference/NOTICE.md`, included GPL license and model registry. Non-commercial eligibility does not eliminate attribution/share-alike, existing unverified MobileBERT redistribution rights or the project's UNLICENSED code status. No store package or model distribution is approved here.
