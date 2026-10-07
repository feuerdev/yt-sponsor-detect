# Ettin behavior and upstream verification

The original reconstruction has been replaced by a behavioral port of Flow's pure preprocessing, constrained BILOU/Viterbi decoder and window stitching. The weights and browser runtime are unchanged. The browser caches each window's logits, decodes each window independently, thresholds geometric-mean label confidence, fuses overlaps and merges adjacent spans only when **both** character and time gaps qualify. It no longer averages token probabilities across windows.

Upstream verification source: [Flow-SponsorML](https://github.com/seshuthota/Flow-SponsorML/tree/6bfbf2b58490c22156836586f1ae27f437590154), revision `6bfbf2b58490c22156836586f1ae27f437590154`.

| File | SHA-256 |
|---|---|
| src/sponsor_detection/model/decoder.py | 85f1eb90e6663203033c1fbf7e935c1e0d87ce44e256f7664fcd5578b2aad9c7 |
| src/sponsor_detection/inference/windowing.py | 9cbe42d690be297ed4b3cad0ad3a7e8e99fcea36fa948da5fb9d38150ba5aa99 |
| src/sponsor_detection/inference/stitching.py | 7c9e7a23ddb7c1c319f847b9f3a7b2293b1c22332ec8f74dad7099a7232b0b28 |

These files originated in the GPLv3 [Flow repository](https://github.com/seshuthota/Flow/tree/d3d628dfc15025b725d311c38c5891e9e2549948/ml/sponsor_detection). The decoder/windowing source hashes were independently compared with that immutable original. Flow's `License` at that revision is preserved as `FLOW-LICENSE` (SHA-256 `20fd6324498af175a10e745ac4e0389d3e1f7dc7cd77a5b8573becd54807252f`). The standalone JavaScript port is GPL-3.0-only, author/project seshuthota/Flow. Specialist weights remain separately CC BY-NC-SA 4.0. No upstream model inference was run outside Chrome.

`tests/fixtures/ettin-upstream-parity.json` contains numerical synthetic outputs, not video captions or weights. Its provenance records the source hashes and Rust/Python tokenizer version 0.22.2. Tests compare 150 deterministic overlapping-window cases (seed 47), including tied logits, constrained labels, confidence thresholds, and gap stitching. Six normalization/token-offset cases cover domains, URL/number boundaries, Unicode digits, whitespace, lowercase expansion, astral characters and decomposed accents. Actual local Hugging Face JavaScript token IDs were additionally compared with the pinned tokenizer's recorded Rust output for these cases.

Scope limits: these are differential algorithm checks, not a reproduction of the publisher's unpublished corpus or model-card scores. Empty time intervals produced from whitespace-only character spans are omitted to satisfy the common playback contract. Complex NFC mappings that cannot be verified are rejected explicitly rather than guessed. Browser inference, runtime cost and temporal quality are measured separately. Captions acquired from the modern public transcript UI have whole-second starts and inferred ends, so sub-second boundary accuracy is unavailable for those tracks.

To regenerate the numerical oracle in an isolated development environment, clone the source repository at the pinned revision, install `tokenizers==0.22.2` in a venv, install the pinned benchmark tokenizer assets with `bench:setup`, then run:

```sh
python bench/reference/generate-ettin-parity.py --source /path/to/pinned/Flow-SponsorML
node --test tests/benchmark-ettin-parity.test.mjs
```

The generator uses only the upstream pure functions and tokenizer, never its model inference classes. Source hashes are recorded in every generated fixture and should match the table above.
