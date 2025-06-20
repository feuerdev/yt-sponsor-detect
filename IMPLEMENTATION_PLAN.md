# AdBlock Extension: Implementation Plan

This document outlines the implementation plan for a Chrome browser extension that automatically detects and skips sponsored segments in YouTube videos using a local NLP model.

## 1. Project Overview

The goal is to create a "set-and-forget" browser extension for Chrome that enhances the YouTube viewing experience by automatically skipping sponsored content. The extension will operate locally within the browser for user privacy and will not require any external API keys or complex user setup.

**Core Features:**

-   **Real-time Caption Analysis**: Intercept and analyze video captions as they are delivered.
-   **Local AI-based Detection**: Use a small, efficient, in-browser NLP model (via WebAssembly) to identify sponsored content from caption text.
-   **Automatic Skipping**: Jump the video player past detected sponsored segments.
-   **Chapter Integration**: Leverage video chapter information as an additional heuristic for detection.

## 2. Architecture

The extension will consist of three main components:

1.  **Background Script (`background.js`)**:
    -   Manages the extension's core logic.
    -   Uses the `chrome.webRequest` API to intercept network requests for YouTube's caption files (`timedtext`).
    -   Hosts the machine learning model in a Web Worker to perform inference without blocking the UI.
    -   Communicates with the Content Script.

2.  **Content Script (`content.js`)**:
    -   Injects into YouTube video pages.
    -   Communicates with the Background Script to send caption data for analysis.
    -   Controls the YouTube video player (e.g., seeking/skipping).
    -   Parses the page for video chapter information from the DOM or JavaScript context.
    -   Manages any UI overlays on the video player.

3.  **Machine Learning Model**:
    -   A lightweight, quantized text-classification model (e.g., `distilbert` or `bert-tiny`) fine-tuned for identifying sponsored content.
    -   The model will be executed using `Transformers.js`, which runs efficiently in the browser via a WASM backend.
    -   It will be bundled with the extension files.

## 3. Detailed Implementation Steps

### Step 1: Basic Extension Setup

-   **`manifest.json`**:
    -   Define name, version, and description.
    -   Set `manifest_version` to 3.
    -   Request necessary permissions:
        -   `scripting`: To inject the content script.
        -   `webRequest`: To intercept caption network traffic.
        -   `storage`: For any user settings.
    -   Define host permissions for `*://*.youtube.com/*`.
    -   Declare the background service worker.

-   **File Structure**:
    ```
    adblock/
    ├── manifest.json
    ├── icons/
    │   ├── icon16.png
    │   └── icon48.png
    ├── src/
    │   ├── background.js
    │   └── content.js
    └── model/
        └── (model files will go here)
    ```

### Step 2: Caption and Chapter Interception

1.  **Background Script (`background.js`)**:
    -   Add a listener for `chrome.webRequest.onCompleted`.
    -   Filter for URLs containing `youtube.com/api/timedtext`.
    -   When a match is found, fetch the URL to get the caption data (XML format).
    -   Parse the XML into a structured format (e.g., `[{text, start, duration}]`).
    -   Send the parsed captions to the active YouTube tab's content script.

2.  **Content Script (`content.js`)**:
    -   On page load (matching a YouTube video), listen for messages from the background script.
    -   On the same page load, attempt to extract chapter information from `window.ytInitialPlayerResponse.playerOverlays.playerOverlayRenderer.decoratedPlayerBarRenderer.decoratedPlayerBar.playerBar.chapteredPlayerBarRenderer.chapters`. This provides chapter titles and start times.
    -   If chapters are found, send them to the background script to be used as hints.

### Step 3: Machine Learning Model Integration

1.  **Model Selection & Setup**:
    -   Choose a suitable pre-trained and quantized text classification model. A good starting point is `distilbert-base-uncased-finetuned-sst-2-english`. While not specific to ads, it's a solid base for classification.
    -   We will use the `Transformers.js` library to load and run the model.

2.  **Inference in Background Worker (`background.js`)**:
    -   Load the classification pipeline from `Transformers.js` when the extension starts. This should be done only once.
    -   The model itself should be loaded lazily on the first request to save memory.
    -   Create a message listener that receives text (caption buffers) from the content script.
    -   When text is received, pass it to the classification pipeline.
    -   The pipeline will return a result like `[{ label: 'NEGATIVE', score: 0.99 }]` or `[{ label: 'POSITIVE', score: 0.99 }]`. We will map one of these labels to "SPONSOR".
    -   Send the classification result back to the content script.

### Step 4: Sponsor Detection and Skipping Logic

1.  **Content Script (`content.js`)**:
    -   Maintain a sliding window/buffer of recent caption objects (e.g., the last 3-5 captions).
    -   When a new caption arrives from the background script, add it to the buffer.
    -   Combine the `text` from the buffered captions into a single string.
    -   Send this string to the background script for analysis.
    -   Listen for the analysis result.

2.  **Skipping Mechanism (`content.js`)**:
    -   If the result is classified as a sponsor segment:
        -   Identify the `start` time of the first caption in the buffer and the `start` + `duration` of the last caption. This defines the segment's time range.
        -   Get the video element: `document.querySelector('video')`.
        -   Set `video.currentTime` to the end of the sponsored segment to skip it.
        -   (Optional) Briefly show an overlay on the video indicating a segment was skipped.
        -   Clear the caption buffer to prevent immediate re-triggering.

## 4. Milestones

1.  **M1: Foundation (1 day)**
    -   Set up `manifest.json` and file structure.
    -   Implement caption interception in `background.js` and log parsed captions to the console.

2.  **M2: Content Script & Communication (2 days)**
    -   Inject `content.js` into YouTube pages.
    -   Establish message passing between `background.js` and `content.js`.
    -   Implement the caption buffering logic in `content.js`.
    -   Implement chapter extraction and logging.

3.  **M3: Model Integration & Basic Detection (3 days)**
    -   Integrate `Transformers.js` into the background script.
    -   Load a pre-trained classification model.
    -   Set up the pipeline to classify buffered caption text sent from the content script.
    -   Log the classification result.

4.  **M4: End-to-End Skipping (2 days)**
    -   Implement the video skipping logic in `content.js` based on the model's output.
    -   Refine the detection threshold and buffer size for better accuracy.

5.  **M5: UI & Refinements (2 days)**
    -   Create a simple UI overlay to notify the user of a skip.
    -   Add an options page to enable/disable the feature.
    -   Test thoroughly and handle edge cases (live streams, videos without captions).

## 5. Potential Challenges

-   **YouTube DOM/API Changes**: YouTube frequently updates its site, which could break selectors or the `timedtext` endpoint format. The implementation should be modular to allow for easy updates.
-   **Model Accuracy**: The initial model may produce false positives (skipping valid content) or false negatives (missing sponsors). Fine-tuning the model on a dedicated dataset of sponsor segments would be a future improvement.
-   **Performance**: Inference on very low-end devices might be slow. We must ensure the process is non-blocking and efficient. Using a Web Worker is critical.
-   **Heuristics**: Relying solely on the ML model might not be enough. Combining its output with chapter names (e.g., "Sponsor," "Our Partner") and keyword matching can improve reliability. 