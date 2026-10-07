SponsorSkip reference source and derived decoder

- Author/project: edde746, https://github.com/edde746/sponsorskip
- Immutable code revision: 01e53cbe8beb02f0ce125736b88df99396793595
- Original file: src/offscreen/detector.ts; SHA-256 c19db9de15b928f1d93010bbc4e493939dfa412bb224b8845f0588371af0dea1
- License: GPL-3.0-or-later; complete license included as SPONSORSKIP-LICENSE.
- bench/reference/sponsorskip-detector.ts is the unchanged upstream source.
- bench/adapters/sponsorskip-decode.mjs extracts its pure decoder and erases types; decoding constants/operations are preserved.
- setup generates an ignored browser module from the same source, changing import/model paths and local model loading glue. Browser adapter exposes cached word probabilities for threshold sweeps.
- SponsorSkip weights are separately CC BY-NC-SA 4.0, not GPL. Creator: edde746; derivative of SponsorBlock labels.

Ettin

- Creator: CuriousDragon. Weights/configuration: CC BY-NC-SA 4.0. Base encoder jhu-clsp/ettin-encoder-17m: MIT.
- Pinned release/decoder manifests are preserved here. Source checkpoint/ONNX hashes and revisions are in models.json.
- The adapter reconstructs documented BILOU/window/merge rules. Exact Flow normalization literals, confidence aggregation and overlap decoder parity are NOT verified. Its output is experimental, not claimed as a faithful published reproduction.

Other assets

- MobileBERT exact weights and hashes are pinned; existing repository marks redistribution rights unverified. Benchmark use does not resolve release rights.
- ONNX Runtime Web: MIT; Hugging Face tokenizers and Transformers.js: Apache-2.0. Runtime license files remain in npm packages; setup copies them with distributable benchmark runtime files.
- SponsorBlock crowd annotations: CC BY-NC-SA 4.0; source https://sponsor.ajay.app and snapshot timestamp retained per video. No submission means unknown, not negative.
- YouTube captions: acquisition provenance and raw hashes retained locally; not committed or redistributed. No permission to redistribute raw caption text is assumed.
- Original production project code remains UNLICENSED. New standalone benchmark source is GPL-3.0-or-later; see ../LICENSE and ../NOTICE.md. This is not an extension/model distribution or release authorization.
