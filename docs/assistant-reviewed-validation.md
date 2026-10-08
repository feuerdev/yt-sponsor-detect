# Assistant-reviewed benchmark

The user authorized this assistant to judge the five acquired transcripts independently of Ettin. This is a transcript-based reference set, not human audiovisual ground truth. SponsorBlock metadata was previously visible, and prior development aggregate results were known. Fresh test predictions were unavailable when labels were written.

The fixed eighteen selected videos remain selected: five transcripts acquired, thirteen unavailable. The source hashes and original crowd labels are preserved. Labels were frozen before validation inference. Human reviewer attestations remain false. No threshold, window, model or boundary tuning used the validation results. Production remains Ettin INT8, Flow window-union decoding at 0.8, manual Skip/Undo.

| Video | My judgment | GPU suggestion | CPU suggestion |
|---|---|---|---|
| ElectroBOOM, power washer | Paid VPN read 130–203 s | 130–203.5 s | 130–203.5 s |
| ElectroBOOM, glass/current short | Ordinary demonstration, no ad | None | None |
| ElectroBOOM, plasma/fire short | Ordinary demonstration, no ad | None | None |
| Stuff Made Here, apple peeler | Paid Brilliant read/segue 1586–1697 s | 1597.421–1698 s | 1602.769–1698 s |
| Fireship, AI model news | Paid browser-service read 320–365 s. Mixed segue 313–320 s uncertain. | 314.979–370 s | 314.979–370 s |

All three clear paid reads matched on both GPU and CPU at IoU 0.5. Both ordinary shorts received no suggestion. Of these, the two test videos contribute two paid reads. Test paid-time coverage is 92.68% on GPU and 89.25% on CPU. The beginning of Stuff Made Here's advertising segue is missed by about 11.4 s on GPU and 16.8 s on CPU.

Fireship's suggestion includes **five seconds of ordinary closing remarks**. That is a partial overrun, even though the evaluator's count of wholly ordinary false-skip intervals is zero. Both backends have 5 s ordinary loss relative to my labels, across 45.44 minutes of reviewed ordinary transcript time. This is observed sample behavior, not a population safety estimate.

Twenty-seven seconds of mixed boundaries/uncertain Patreon self-promotion remain uncertain. Music-only/no-transcript intervals remain unknown. Approximate cue timing limits exact skip boundary accuracy. Upstream training overlap is unknown. Five videos and three positive segments are too few to select a new operating point or claim strong general accuracy.

All four browser-page runs completed with real pinned weights: development/test × native GPU/explicit GPU-disabled WASM. Initialization was about 0.54–0.58 s. Full-track test inference was about 0.27–0.85 s on GPU and 0.99–3.21 s on CPU. This is localhost browser inference, separate from installed extension and live public playback. The unchanged guards were 28,672 MiB account RSS and 4,096 MiB minimum availability proxy.

The original exposed pilot and its ledger were preserved. A separate bound ledger records both fresh test attempts with one frozen configuration. This new cohort is now exposed and must not be used for further tuning.

SponsorBlock remains useful for expanding reference coverage. Its database provides community segment labels rather than captions or guaranteed ordinary intervals. The linked sb-mirror README currently says there are no public rsync mirrors, while the official API documentation lists database mirrors. Existing VIP moderation and category lock reasons may reduce additional review work, but bare locks can also be preemptive anti-spam locks. Caption availability and sampling independence still need handling.

## Artifacts and reproduction

- [Versioned assistant references](ettin-evidence/assistant-transcript-review.json). Raw transcript text remains private.
- [Caption-free benchmark and provenance](ettin-evidence/assistant-reviewed-benchmark.json).
- [Frozen operating point](ettin-evidence/assistant-reviewed-frozen-config.json) and [separate exposure ledger](ettin-evidence/assistant-reviewed-test-ledger.json).
- [Import/source integrity evidence](ettin-evidence/assistant-review-import-evidence.json).

Import the private original sources with `bench/review-import.mjs --review-kind llm` and the same four required path arguments. The default route still requires actual human review. The LLM route requires `status=llm-reviewed`, `reviewMethod=transcript-only`, `llmReviewerAttestation=true` and `reviewerAttestation=false` for every acquired transcript. Original source hashes, all eighteen identities, category policy, ordinary/positive conflicts and the not-yet-exposed bound ledger remain checked. The importer never substitutes or invents unavailable captions.

Run `bench/run.mjs` with the imported manifest and frozen config, `--model ettin-int8`, backend `webgpu` or `wasm`, and split `tune` or `test`. Test runs must use the bound `--test-ledger`. Use the native Chrome path and the established Mac resource guards. Results include all selected acquisition failures. Once test exposure exists, reference import into that cohort is rejected.

Sources: [sb-mirror README](https://github.com/mchangrh/sb-mirror), [official API documentation](https://wiki.sponsor.ajay.app/w/API_Docs), [VIP review and lock guidance](https://wiki.sponsor.ajay.app/w/VIP_Guide). No mirror was downloaded or used for these five-video results.
