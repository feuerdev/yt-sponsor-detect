# YouTube Sponsor Skipper

This is a browser extension that automatically detects and skips sponsored segments in YouTube videos using a locally-run machine learning model.

## Features

- **Automatic Sponsor Detection**: Uses a zero-shot classification model to identify promotional content in video transcripts in real-time.
- **Self-Contained**: The machine learning model is bundled with the extension, so it works offline and sends no data to external servers.
- **Automatic Skipping**: Once a sponsored segment is detected, the video player automatically jumps past it.
- **Configurable Confidence Threshold**: You can adjust the sensitivity of the sponsor detection from the extension's popup menu.
- **Enable/Disable Toggle**: Easily turn the functionality on or off at any time.

## How It Works

The extension fetches YouTube's auto-generated captions as they become available. It then analyzes the text of these captions using the `mobilebert-uncased-mnli` zero-shot classification model.

This model is run entirely within the browser—no data is sent to an external server. We provide it the labels `['promotional content', 'neutral content']` on the fly. If the model classifies the caption text as "promotional content" with a score higher than the user-set confidence threshold, the extension skips that segment of the video.

## Building and Installing from Source

To build and install this extension, you'll need to have Node.js and npm installed.

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/feuerdev/adblock.git
    cd adblock
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Download the ML Model:**
    This step downloads the necessary machine learning model and places it in the correct directory for the extension to use.
    ```bash
    npm run setup
    ```

4.  **Build the extension:**
    This command bundles all the files into the `dist/` directory.
    ```bash
    npm run build
    ```

5.  **Load the extension in your browser:**
    - Open your Chrome/Chromium-based browser and navigate to `chrome://extensions`.
    - Enable **Developer mode** (usually a toggle in the top-right corner).
    - Click the **Load unpacked** button.
    - Select the `dist/` folder that was created by the build process.
    - The extension's icon will appear in your browser's toolbar.

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
```

### Open Issues

*   The detection window is too large. A second pass is needed to hone in on the exact sponsored segment.
*   Only works when the captions are requested. So we either need to kick off a request for captions when the video starts, or we need to enable the captions silently.
*   Enable users to configure additional labels and confidence thresholds.