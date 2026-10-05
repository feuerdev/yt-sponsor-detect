# Sponsor detection: measured, reversible local ML demo

Status: proposed implementation spec, 5 October 2026. Primary endpoint: portfolio demonstration of on-device classification, measured errors and browser lifecycle design. Commercial launch is deferred until differentiation, accuracy and licensing are established.

## Existing system and cleanup

Manifest V3 extension with a background service worker, caption-request observation/refetch, 20-caption windows stepped by five, local MobileBERT classification, interval coalescing/cache and video seeking. Popup already supports categories and per-label thresholds. Model setup and YouTube captions need network access; inference is configured to disallow remote models. This does not make the complete product offline.

Cleanup corrects clone/setup instructions and prototype claims, separates ML experimentation from dependency-free validation, and documents the setup/runtime model mismatch. It does not claim classifier accuracy or repair segment/navigation/settings behavior. Model inference is deliberately not run on the shared VPS. Build verification depends on actual bundled model assets, never placeholder production weights.

## User and scope

A viewer wants to see a suggested sponsor interval in a captioned English YouTube video, understand that it is an estimate, and choose to skip or undo. Initial demo supports desktop Chromium and one language. Missing/unsupported captions or model failure should leave playback untouched with a visible status.

Non-goals: claiming all sponsors detected, silently skipping by default, paid subscription, Firefox/mobile support, remote transcript analysis, crowdsourced uploads, whole-video transcription and training a large model on this VPS.

## Required design

| Area | Contract | Acceptance |
| --- | --- | --- |
| Model artifact | One explicit model revision/file/quantization; hash, license, tokenizer metadata and download size; setup does not select the first arbitrary .onnx | Clean setup and runtime load exactly the same documented artifact; corrupted/missing model produces explicit failure |
| Session identity | `tabId + videoId + generation` on work/messages; cancel/invalidate on navigation/disable/tab close | Old async results never change a different video; revisiting same ID uses only compatible cache |
| Caption ingestion | Parse normalized time/text events, sort/dedupe repeated requests, reject malformed/missing durations | Replayed caption response creates no duplicate inference; unsupported format gives status rather than seeking |
| Inference | Single-flight initialization and bounded sequential queue, one inference job at a time; explicit error state | Model failure yields no sponsor interval; multiple initialization requests share one load; disable stops future work |
| Boundaries | Coarse candidate windows then fine boundary pass; merge only contiguous evidence; clamp to finite duration | Never emit negative/reversed/out-of-video spans; neutral gaps not joined into one long skip |
| Settings/cache | Cache keyed by video/model/labels/threshold/preprocessing version; bounded storage and explicit expiry; disabled means no seeking, even cached | Toggle-off immediately prevents existing/cached skips; threshold/category change recomputes or invalidates cache |
| UI | Default highlight/manual skip; opt-in automatic skip with visible Undo; accessible popup and status | Error/missing-caption/analysis/ready states distinct; Undo plays skipped content without a seek loop |
| Permissions/privacy | YouTube-only resources where possible; review unused scripting/global resource exposure and CSP; no transcript logging/upload | Network capture shows only expected caption retrieval; no model/CDN access during inference after setup |
| Worker lifetime | Document browser worker shutdown behavior; reconstruct bounded state and never assume background memory persists | Worker restart mid-analysis does not mix sessions or repeat skips; playback continues normally |

Extract pure caption/window/interval/cache-key functions from Chrome APIs and test them without model weights. A session coordinator owns cancellation; Chrome adapter owns messages/storage; the worker owns bounded model loading. Replace the classifier's ambiguous 0.5 error fallback with a typed failure before any confidence tuning. Do not equate softmax scores with calibrated probabilities.

## Evaluation specification

Create a rights-cleared fixture set of at least 30 captioned videos/segments from at least 10 channels; reserve entire channels for holdout to reduce leakage. Two annotators identify sponsor boundaries; record disagreements and an adjudication rule. Include ordinary product discussion, self-promotion, missing captions and hard negatives. Split tuning and holdout before selecting thresholds. No personal watch-history collection.

Report segment precision/recall, interval overlap, start/end boundary error, false skips per hour, unskipped sponsor seconds, cold model load, warm inference latency, peak memory and bundle size on named devices/browser versions. Compare to a simple keyword baseline; compare SponsorBlock coverage only where permitted/licensed. Report unsupported-language and missing-caption rate separately from accuracy. `test_classifier.js` currently tunes on its own sample data, so its best score is not generalization evidence.

Proposed manual-demo gate: segment precision >=95% on holdout and median boundary error <=3 seconds; any miss is shown in the case study. Proposed auto-skip gate is stricter: no false skip in at least 10 hours of independent ordinary-content playback, an uncertainty/failure state and reliable Undo. Passing a finite sample is still not a guarantee. If gates fail, ship a manual suggestion demo and publish failure analysis.

## Ordered work packages

1. **S1 — setup and deterministic harness (1–2 days).** Align model download/runtime artifact, validate hashes/licenses, split evaluation from fast tests, add parsing/interval fixtures. Done when fresh build loads the real bundled artifact on a suitable machine.
2. **S2 — lifecycle/settings safety (2–3 days).** Add session generation, cancel/invalidate, fail-open model errors, bounded cache and disable/undo behavior. Done when fake-Chrome tests cover navigation, cache, disable and worker restart plus one real extension scenario.
3. **S3 — held-out evaluation (1–3 days + annotation time).** Freeze labels/thresholds, annotate/split, record baselines and errors; one job at a time on an appropriate machine. Done when metrics and failure examples can be reproduced.
4. **S4 — portfolio packaging (1 day).** Actual popup/player recording, architecture, benchmark artifact and honest README. Public extension/store distribution only after a separate explicit instruction and required review.

Estimate: 5–9 focused days plus annotation/device access. The current model setup calls a pipeline to download and chooses an arbitrary ONNX filename; runtime asks for unquantized `model.onnx`. Resolve this before trusting any local score or advertising offline inference.

## Commercial decision and licensing

[SponsorBlock](https://github.com/ajayyy/SponsorBlock) is established crowd-sourced skipping; [sponsorblock-ml](https://github.com/xenova/sponsorblock-ml) already explores automatic detection and identifies noncommercial training data. A new local classifier is not automatically a saleable moat. Repository metadata currently says UNLICENSED; do not choose an open-source or paid redistribution license for the owner. Document rights for code, model, tokenizer, evaluation captions and any training data before distribution. Continue commercially only if a distinct underserved workflow emerges from five target-user interviews and at least two accept a paid pilot. Otherwise finish the portfolio research artifact.

## Verification and rollout

Fast checks: `npm test` performs syntax/manifest/package validation and real-source lifecycle fixtures with one test worker, without dependencies or ML; `npm run evaluate` is the existing exploratory model script and must run on suitable resources after setup. `npm run build` requires actual model files. Real extension checks must cover YouTube SPA navigation, repeated timedtext requests, disable with cached segments, missing captions, startup/error states, Undo and service-worker restart. Never publish a bundle containing test/stub weights. No merge, store submission or production release in this task.

## Low-risk implementation progress

Player/source/video identity and cache generations now prevent stale cache results on navigation and release detached video/progress-bar listeners. Background analysis checks captured state identity after classification and cache reads, preventing stale progress/completion or cache restoration after clear/replacement. Fifteen dependency-free Node fixtures cover these races plus the unchanged-player and successful-analysis paths; the original regressions failed before the fixes. Browser integration, label/cache invalidation, caption-fetch navigation races, model accuracy and restart durability remain acceptance gates. A bounded non-minified webpack source check generated the code but failed copying the absent real model directory; no successful complete bundle is claimed.

The content script now reads the saved enable toggle before changing playback and follows live synchronized-setting changes. A late startup settings read cannot overwrite a newer toggle event. Four regressions reproduced cached skipping while disabled; all15 lifecycle/settings fixtures pass. The final content script also compiles with a focused non-minified webpack check. This does not replace the complete model-dependent bundle or browser validation.
