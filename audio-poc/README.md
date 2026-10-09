# Explicit local-audio transcription experiment

This is a separate development extension, not an automatic fallback in the sponsor viewer. It records at most 20 seconds from the current YouTube tab after an explicit popup action, routes captured audio to the output so listening can continue, and stops capture before starting local Whisper tiny.en INT8 inference in a dedicated worker. It displays English text, recording-relative phrase timestamps and measured load/inference time. It never seeks the video.

```sh
npm run audio:setup
npm run audio:build
```

Load `audio-poc-dist/` as an unpacked extension in desktop Chrome 116+. Keep the main sponsor detector disabled while measuring this experiment. Open a YouTube watch page, click this extension's action, then **Capture next 20 seconds**. Keep playback running. **Finish recording** shortens capture; **Stop and clear** cancels pending capture/inference, terminates the worker, closes audio resources/offscreen document and clears in-memory results. Tab closure or navigation to another video also clears the experiment. Reopen the popup to see progress after closing it.

Setup streams seven pinned assets (about 42 MiB), checks exact sizes/hashes and atomically publishes a verified directory. Build requires those actual assets. Inference disables remote model loading and browser caching; extension CSP permits only local assets. Audio and transcripts are held in memory, not stored or uploaded. Capture and transcription have separate duration bounds; inference times out after two minutes. No neural inference is run on this VPS.

Chrome requires extension invocation for [tab capture](https://developer.chrome.com/docs/extensions/reference/api/tabCapture). Starting in Chrome116, a worker-issued stream ID can be consumed by an offscreen document. Capture suppresses original tab audio; this experiment explicitly routes the stream to an AudioContext destination. The [official capture guide](https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture) describes that architecture. Actual installed API behavior and uninterrupted audible output require a target-device check.

The worklet averages channels and applies bounded box-filter downsampling to 16kHz mono with 4096-sample transfers. A final partial transfer can lose up to 256ms of recorded audio; resampling fidelity has not been evaluated. Phrase times are relative to the captured audio, not YouTube timestamps. Pauses, playback-rate changes, seeks and YouTube ads therefore do not produce usable sponsor-video boundaries. An unresolved final Whisper timestamp remains null. Live capture cannot predict unheard sponsor end boundaries; ahead-of-playback audio retrieval is a separate feasibility problem.

Evidence: focused tests exercise audible-path wiring with doubles, sample/time bounds, cancellation including delayed stream replies, inference cleanup/failure/timeout, language-result timing validation, resampling counts, sender restrictions and navigation. Model-loading/speech accuracy/latency, native tabCapture, actual audio hardware continuity and privacy network behavior remain unverified. See artifacts/audio-poc-tests.log locally. A native WebAudio rendering fixture, when available, uses a synthetic oscillator and synthetic ASR; it is not Whisper evidence.

[Attribution](NOTICE.md) applies separately from the main viewer's model and decoder terms. No merge, deployment, store release or broad device-support claim is included.

Native fixture evidence: HeadlessChrome155.0.8059.39, actual built popup and real oscillator/MediaStream/AudioWorklet/controller. Captured 49152 finite, non-silent 16kHz samples; capture stream stopped, AudioContext closed, synthetic-ASR worker terminated, and Stop cleared results. Peak account PSS622.0MiB. Reproduce with `node scripts/capture-audio-poc.mjs <chrome-headless-shell>`. Evidence artifacts/audio-render/evidence.json and recording.png/transcribed.png. This validates native PCM/cleanup, not tabCapture, Whisper inference, speech quality, hardware output continuity or device latency.

Build verification: seven real Whisper assets verified; separate extension build passed with two asset-size warnings. Initial rebundling exceeded a deliberately small96MiB Node heap; packaging now copies the locked local prebuilt Transformers.js bundle and succeeds with that same heap.

Final combined source suite:264 passed,0 failed,3 browser-dependent checks skipped (267 total). The11 audio checks passed; audio source/permissions/runtime pins were checked. Log: artifacts/audio-combined-tests.log.
