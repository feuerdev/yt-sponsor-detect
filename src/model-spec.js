export const MODEL_SPEC = Object.freeze({
    "repository": "CuriousDragon/ettin-17m-sponsor-combined-android",
    "revision": "d4939256c49e92d158429a55fcf39477d003dd58",
    "directory": "ettin-int8",
    "precision": "int8",
    "task": "token-classification",
    "pipelineVersion": "ettin-flow-v2-int8-768-128-ort1.29-tokenizers0.1.3",
    "rights": "CC-BY-NC-SA-4.0; CuriousDragon; sponsorblock labels; base encoder MIT",
    "preprocessing": {
        "normalization": [
            "collapse_whitespace",
            "lowercase",
            "replace_urls",
            "replace_numbers"
        ],
        "maxLength": 768,
        "overlapTokens": 128,
        "labels": [
            "O",
            "B-SPONSOR",
            "I-SPONSOR",
            "L-SPONSOR",
            "U-SPONSOR"
        ],
        "implementation": "flow-pure-v2; cue normalization followed by tokenizer NFC; Python-codepoint offsets"
    },
    "decoding": {
        "threshold": 0.8,
        "mergeGapCharacters": 24,
        "mergeGapSeconds": 1.5,
        "parity": "150 pinned pure-pipeline differential cases; verified common cases; zero-duration proposals omitted and complex NFC offsets rejected",
        "sourceRevision": "6bfbf2b58490c22156836586f1ae27f437590154"
    },
    "files": [
        {
            "path": "config.json",
            "size": 1852,
            "sha256": "6a288d0f8ed552a2e6273c46dcb97a8b1d382b62a7863640165c2e86d28ff07a"
        },
        {
            "path": "tokenizer.json",
            "size": 3583228,
            "sha256": "6c8aaa9a542084f2457eab775d4eeb51f92a70c0fd9de28d5edb0ddec3c08d30"
        },
        {
            "path": "tokenizer_config.json",
            "size": 350,
            "sha256": "b777be9359fc2dd0dd89a5fab5d6f1ebdc937040cf47be84b75e431c5129885b"
        },
        {
            "path": "sponsor_detector_combined.int8.onnx",
            "size": 29799099,
            "sha256": "5006c192c9ba17c9283d7366307cccc9d80d67bab4301c1749e8f737a8b6d40f"
        }
    ]
});
