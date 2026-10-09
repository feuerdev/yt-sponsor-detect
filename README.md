# YouTube sponsor detection

An experimental Chrome extension that detects paid sponsorships in YouTube
videos using Ettin INT8, running locally in the browser. It highlights suggested
segments and offers **Skip** and **Undo**. Automatic skipping is disabled.

## Features

- Automatically acquires available English transcripts, without enabling captions.
- Analyzes transcripts with a bundled model, using WebGPU with a CPU/WASM fallback.
- Shows timed sponsor suggestions and a coverage notice for partial transcripts.
- Caches suggestions locally for up to 48 hours.
- Lets you enable or disable suggestions and adjust minimum confidence in the popup.

Suggestions can miss sponsors or include ordinary speech. Self-promotion, custom
categories, live streams and non-English transcripts are unsupported. Videos
without a usable transcript cannot be analyzed.

## Build and install

Use Chrome 116+ and Node.js 24.15+.

```sh
git clone https://github.com/feuerdev/yt-sponsor-detect.git
cd yt-sponsor-detect
npm ci
npm run setup
npm run build
```

Setup downloads the pinned model assets and verifies their checksums. The build
bundles the model and runtime into `dist/`. Model assets and build output are not
tracked in Git.

1. Open `chrome://extensions` and enable **Developer mode**.
2. Select **Load unpacked** and choose the project's `dist/` folder.
3. Open or reload a YouTube video with an English transcript.

After rebuilding, reload the extension and the video page.

## Usage

Detection starts automatically when a video loads. YouTube's transcript panel may
open briefly during acquisition. Captions can stay off.

During a suggested segment, click **Skip** to jump to its end. Click **Undo** to
restore your previous playback position. Use the extension popup to change
settings or clear the current video's suggestions.

If detection is unavailable, open YouTube's transcript panel, clear its search,
and select **Analyze open transcript** in the popup to retry. Transcript-panel
timestamps are approximate, and partial transcripts only cover part of a video.

## Development

```sh
npm test               # source, decoder and lifecycle checks
npm run verify:model   # verify downloaded model assets
npm run build          # build the extension with verified assets
```

The separate [browser benchmark](bench/README.md) compares models and decoding
strategies. Model inference runs in Chrome, not in the Node test suite.

## Privacy and licensing

Transcript inference runs locally with bundled assets. The extension does not
upload captions or load remote models. YouTube and the initial model download
require network access. Settings use Chrome's sync storage. Cached suggestions
stay in local storage.

The project is experimental and marked `UNLICENSED`. Ettin weights are
CC BY-NC-SA 4.0, and the Flow-derived decoder is GPL-3.0-only. See
[third-party notices](licenses/NOTICE.md) for attribution and component licenses.
