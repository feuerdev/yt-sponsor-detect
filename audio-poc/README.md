# Explicit local-audio transcription experiment

This separate development extension records at most 20 seconds from the current YouTube tab after an explicit popup action. It routes captured audio to the output, stops capture before local Whisper tiny.en INT8 inference in a dedicated worker, and displays English text, recording-relative phrase timestamps and measured load/inference time. It never seeks the video.

```sh
npm run audio:setup
npm run audio:build
```

Load `audio-poc-dist/` as an unpacked extension. The manifest requires Chrome 116; installed behavior was tested on Chrome 155.0.8059.40. Disable the main sponsor detector while measuring this experiment. Open a YouTube watch page, click the action, then **Capture next 20 seconds**. Keep playback running. **Finish recording** shortens capture. **Stop and clear** cancels capture/inference, terminates the worker, closes the offscreen document and clears results. Tab closure or navigation to another video also clears the experiment. Reopen the popup to see progress.

Setup streams seven pinned assets (about 42 MiB), verifies sizes/hashes and atomically publishes the directory. Build requires those assets and copies the locked Transformers.js 2.17.2 prebuilt bundle. The model copy explicitly treats `whisper-tiny.en` as a directory: previously its `.en` suffix caused Webpack to emit a single file instead of nested model files. For an existing broken build, remove the generated `audio-poc-dist/` directory once before rebuilding. A real Webpack regression verifies nested filenames and distinct file bytes without downloading weights.

Inference disables remote model loading and browser caching. Extension CSP permits only local assets. Audio and transcripts remain in memory. Capture and inference have separate duration bounds; inference times out after two minutes. [Chrome's capture guide](https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture) describes worker-issued stream IDs, offscreen consumption and routing captured audio to an AudioContext destination. Hardware listening continuity still needs a human check.

The worklet averages channels and applies bounded box-filter downsampling to 16 kHz mono, with 4096-sample transfers. A final partial transfer can lose up to 256 ms. Resampling fidelity is not evaluated. Phrase times refer to captured audio, not YouTube timestamps. Pauses, seeks, rate changes and ads prevent direct use as sponsor-video boundaries. An unresolved final timestamp remains null. An observed final Whisper end at most one second beyond captured audio is also marked unresolved, retaining the reported end in `timestampAdjustment`; larger overshoots and invalid starts fail validation. No precise boundary is invented. Live capture cannot supply unheard sponsor ends; ahead-of-playback retrieval remains a separate feasibility question.

## Installed evidence, 10 October 2026

An isolated native Chrome 155.0.8059.40 profile on macOS 27.0.1, M1 Pro and 32 GiB installed the actual built extension. Chrome granted tab capture through action invocation. Actual `tabCapture`, offscreen WebAudio, AudioWorklet and bundled Whisper ran against a local synthesized spoken fixture, served in place of a YouTube watch page/media. The popup HTML was opened as a browser tab for inspection; this does not establish toolbar-popup opening behavior.

The final run captured 6.144 seconds at 16 kHz, with 6310.1 ms capture time and 2229.9 ms combined model initialization/inference. Whisper recovered the fixture's two requested phrases and repeated part of the looped speech. Its final phrase was 0–6 seconds in this run; an earlier run returned 0–7 seconds and reproduced the timestamp-validation failure. The media element continued playing during capture and after inference. That establishes browser playback state, not audible hardware output or transcription accuracy on public videos.

No HTTP(S) requests from observed extension contexts occurred. The inference worker was gone at completion, and Stop removed the offscreen document and cleared state. The 390 px popup had no horizontal overflow. Peak same-user RSS was 22251 MiB under a 30720 MiB ceiling, with at least 4096 MiB available-page proxy required. RSS includes unrelated applications/shared-page duplication and is not model RAM. The task browser/profile were removed.

Reproduce on a suitably provisioned Mac with the exact synthetic phrase:

```sh
say -v Samantha -o artifacts/speech.aiff 'This is a local audio test. The video is sponsored by Acme.'
afconvert -f WAVE -d LEI16@16000 artifacts/speech.aiff artifacts/speech.wav
BENCH_MEMORY_BUDGET=30720 BENCH_MIN_AVAILABLE=4096 \
  node scripts/capture-installed-audio-poc.mjs artifacts/speech.wav artifacts/installed-audio
```

Create `artifacts/` first. Choose account-wide resource limits from a native baseline rather than copying the Mac's ceiling onto smaller hardware. `BENCH_CHROME` selects the Chrome binary. The harness writes the fixture hash, raw transcript, timings, network paths, cleanup checks and screenshot locally; these outputs remain ignored. It fulfills the watch page and WAV locally, while capture and inference use actual installed APIs/model. Only use an intentionally shareable synthetic fixture: the evidence file contains its transcription.

The combined source suite passed 289 tests with no failures/skips, including three native Chrome controller checks. The viewer and separate audio builds passed with two size warnings each. Source tests cover lifecycle, sample bounds, resampling, cancellation, inference failure/timeout, sender/navigation restrictions, packaging and timestamp validation. Earlier oscillator/synthetic-ASR rendering evidence from `scripts/capture-audio-poc.mjs` remains a separate proof type.

Public-video ASR, native hardware listening, low-end-device latency and sponsor-boundary accuracy remain open. [Attribution](NOTICE.md) applies separately from the viewer model/decoder terms. No merge, deployment or store release is included.
