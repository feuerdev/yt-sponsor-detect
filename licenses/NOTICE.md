# Third-party notices

## Ettin model

Creator: CuriousDragon. Model/configuration: CC BY-NC-SA 4.0.

- Model: https://huggingface.co/CuriousDragon/ettin-17m-sponsor-combined-android
- Revision: `d4939256c49e92d158429a55fcf39477d003dd58`
- Model card: https://huggingface.co/CuriousDragon/ettin-17m-sponsor-combined-android/blob/d4939256c49e92d158429a55fcf39477d003dd58/README.md
- License: https://creativecommons.org/licenses/by-nc-sa/4.0/
- Base encoder: https://huggingface.co/jhu-clsp/ettin-encoder-17m (MIT).
- SponsorBlock-derived labels: https://sponsor.ajay.app (CC BY-NC-SA 4.0).

The INT8 model is the unchanged upstream quantized export. Attribution,
non-commercial and share-alike conditions apply separately to the weights.

## Flow-derived code

Author/project: seshuthota/Flow. License: GPL-3.0-only.

- Original source: https://github.com/seshuthota/Flow/tree/d3d628dfc15025b725d311c38c5891e9e2549948/ml/sponsor_detection
- Verification source: https://github.com/seshuthota/Flow-SponsorML/tree/6bfbf2b58490c22156836586f1ae27f437590154
- Port: `bench/adapters/ettin-text.mjs` (JavaScript preprocessing, BILOU/Viterbi decoding and window stitching).
- Integration modules: `src/ettin-engine.js` and `src/inference-worker.js`.

Source provenance and port differences are in `bench/reference/ettin-parity.md`.
The full license is in `bench/reference/FLOW-LICENSE` and copied into extension
builds as `licenses/FLOW-GPL-3.0.txt`.

## Browser dependencies

- ONNX Runtime Web 1.29.0: Microsoft, MIT. Full license is copied to `licenses/ONNX-RUNTIME-MIT.txt` in extension builds.
- Hugging Face Tokenizers 0.1.3: Hugging Face, Apache-2.0. Full license is copied to `licenses/TOKENIZERS-APACHE-2.0.txt` in extension builds.

## Project licensing

The original project remains `UNLICENSED` pending the owner's license decision.
Distribution of combined covered code requires GPL-compatible licensing and
corresponding source. Model distribution or adaptation carries its separate
attribution, non-commercial and share-alike conditions. This notice does not
grant commercial rights or clear model-training-data rights.
