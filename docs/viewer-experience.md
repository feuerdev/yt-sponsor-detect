# Local sponsor viewer: implementation and evidence ledger

Target: normal desktop Chrome viewers, English paid sponsor blocks, automatic skipping enabled by default, local analysis, uninterrupted playback during analysis. Self-promotion is optional and initially off. Approximately ten seconds to a useful result and less than three seconds useful-content loss are tuning aspirations, not established guarantees.

## Current architecture

`viewer-page.js` runs in YouTube's MAIN world. It tries current-video player metadata and refreshes via the internal player endpoint, prefers English ASR word offsets, tries alternate English tracks, and returns validated words through a bounded same-window bridge. It never uploads captions. Creator line timings are interpolated and explicitly tagged `estimated`. Missing captions, unsupported language, failed retrieval, malformed timing and empty speech are distinct. Internal YouTube endpoints can change; a failed request is not evidence that the video has no captions.

`viewer-content.js` owns the current visit token, caption retrieval cancellation, player binding and user interface. `viewer-background.js` owns current-tab session coordination and a serialized, 30-video/48-hour complete-result cache bound to model revision/hash and preprocessing. Viewing preferences do not change detector policy or require reload. A worker restart can restore a valid completed result. Mid-analysis restart recovery still needs installed-Chrome evidence.

`viewer-offscreen.js` owns lazy local model initialization and a serialized replaceable detector queue. Current default is an explicitly experimental MobileBERT NLI comparison baseline with 80-word windows, 40-word stride and full final-tail handling. It is NOT selected from measured accuracy/performance. Partial validated intervals may arrive during analysis; only successful complete results are cached. Inference failures clear partial suggestions and preserve playback control. Candidate word-level models and decoder comparisons remain required before requirement 3 is complete.

`PlaybackController` uses playback events and one cancellable timer. It respects play/pause, buffering, playback rate, seeking, video/token identity and YouTube ad suspension. Late results skip only the remaining current sponsor; passed sponsors are never rewound. Undo returns to the estimated segment start and suppresses overlapping results for that visit. Intentional seeking into a sponsor is respected. Same-video player replacement preserves suppression. Disable invalidates retained seek controls. A manual mode remains available with a Skip button.

The popup shows current-video status, enable/automatic/self-promotion controls, pause-skipping/retry actions, interval timestamps and optional diagnostics. It uses explicit labels and focus styles; the player has a quiet status and compact Skip/Undo controls. Installation defaults do not depend on opening the popup. No label phrases or numeric thresholds are exposed in normal settings.

## Evidence scope

- Baseline before changes: 65 existing tests passed. Some run historical `src/content.js` / `src/background.js`; these files are no longer the production entrypoints. Their pass does not prove the new viewer pipeline.
- New source regressions: 44 tests passed across proactive caption retrieval/bridge/settings, actual content entrypoint, session/cache/detector coordinator, and automatic playback. They execute production JavaScript with controlled captions/classifiers/browser API doubles. They do not measure model quality, network compatibility or installed-Chrome behavior.
- Production build passed with actual pinned assets verified and three bundle-size warnings (artifacts/viewer-build.log).
- Rendered fixture passed in official HeadlessChrome 155.0.8059.39: actual compiled page/content/popup, controlled Chrome APIs/captions/detector, native HTMLVideoElement media seeking. Automatic skip reached 4.149s for a 1–4s interval; Undo restored 1s without another skip. Peak account PSS was 566.5MiB. Evidence: artifacts/viewer-render/evidence.json and skipped.png/restored.png; reproduce with `node scripts/capture-viewer.mjs <chrome-headless-shell>`. This does not verify installed MV3 APIs, YouTube requests, real model inference. Native popup interactions also verified automatic-mode changes, per-video pause and disabled status in the controlled fixture.
- Installed-extension/live YouTube acquisition, actual model loading, held-out quality and ordinary-device performance: pending.
- Prior 50-video benchmark had no acquired captions and no completed learned-model logits on this VPS. Its quality comparison remains unavailable. Do not report null metrics as zero errors or choose a model from synthetic fixtures.
- No other personal device is currently available. Previous VPS inference was resource-deferred/rejected; this implementation does not retry it.

## Completion requirements

1. Prove proactive acquisition/fallback/state distinctions in an installed browser against actual permitted YouTube videos, including captions display off, short tracks, creator/ASR tracks and English absence.
2. Capture actual popup/player states and verify installation without opening popup, live settings, keyboard interaction, retry and pause.
3. Obtain reviewed timed captions, run the pinned model/backend candidates on ordinary hardware, freeze tuning, evaluate held-out references, measure cold/warm latency and useful-content loss including tail failures, then select the production detector. This requirement remains open.
4. Verify actual playback seek/Undo, same-player navigation/replacement, YouTube ads, seeking, rate changes, buffering and service-worker restart. Source fixtures are useful evidence but do not substitute for an installed-browser check.
5. A separate PR must contain the local-audio proof of concept and evidence of local-only processing, audio continuity, resource cleanup, timestamps and latency. Live capture alone cannot supply unheard sponsor end boundaries; ahead-of-playback audio needs a separate feasibility assessment.

No merge, production deployment or distribution is part of this task.
