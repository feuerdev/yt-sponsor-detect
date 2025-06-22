# YouTube Sponsor Skipper

This is a browser extension that automatically detects and skips sponsored segments in YouTube videos using a locally-run machine learning model.

## Features

- **Automatic Sponsor Detection**: Uses a zero-shot classification model to identify promotional content in video transcripts in real-time.
- **Automatic Skipping**: Once a sponsored segment is detected, the video player automatically jumps past it.
- **Configurable Confidence Threshold**: You can adjust the sensitivity of the sponsor detection from the extension's popup menu.
- **Enable/Disable Toggle**: Easily turn the functionality on or off at any time.

## How It Works

The extension fetches YouTube's auto-generated captions as they become available. It then analyzes the text of these captions using the `Xenova/mobilebert-uncased-mnli` zero-shot classification model from Hugging Face Transformers.

This model is run entirely within the browser—no data is sent to an external server. We provide it the labels `['promotional content', 'neutral content']` on the fly. If the model classifies the caption text as "promotional content" with a score higher than the user-set confidence threshold, the extension skips that segment of the video.

## Installation

1.  Clone or download this repository to your local machine.
2.  Open your Chrome/Chromium-based browser and navigate to `chrome://extensions`.
3.  Enable **Developer mode** (usually a toggle in the top-right corner).
4.  Click the **Load unpacked** button.
5.  Select the root folder of this project (`adblock/`).
6.  The extension's icon will appear in your browser's toolbar.

## Development

The project includes a Node.js-based testing environment to evaluate the classifier's performance without needing to load the extension.

### Setup

First, install the required dependencies:
```bash
npm install
```

### Testing the Classifier

To run a batch test against the sample data in `test_data.js`, use:
```bash
npm run test
```

To classify a single sentence from your terminal, use the `debug` script:
```bash
npm run debug "this video is sponsored by" "promotional content,neutral content"


### Open Issues

*   The detection window is too large. A second pass is needed to hone in on the exact sponsored segment.
*   Acting on the detected sponsorship window. This may involve a loop on the content script side that checks the current time of the video player and skips the segment if entering a detected sponsored window.
*   How to embed the model directly so it is not necessary to download it when the extension is first run. 
*   Only works when the captions are requested. So we either need to kick off a request for captions when the video starts, or we need to enable the captions silently.
*   Configuration of the confidence threshold.