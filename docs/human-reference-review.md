# Human reference review before fresh validation

The current development results are provisional. A reviewer must independently
watch the source videos and label ordinary content before false skips/hour or
removed ordinary seconds can be measured. A model prediction, missing crowd label,
or sampling stratum cannot establish negative ground truth.

The private `fresh-validation-review-template.json` packet retains all eighteen
registered IDs and hashes. Five have usable English sources. No model predictions
are included, and the working packet no longer displays provisional crowd spans.
Existing crowd snapshots and original fixtures remain separately preserved.

| Acquired source | Split | Approximate duration |
| --- | --- | ---: |
| [RpslsMqPFWA](https://www.youtube.com/watch?v=RpslsMqPFWA) | Validation | 29m 26s |
| [WrCjAAl9okA](https://www.youtube.com/watch?v=WrCjAAl9okA) | Validation | 6m 10s |
| [Tuxgh8SrzbQ](https://www.youtube.com/watch?v=Tuxgh8SrzbQ) | Development | 12m 31s |
| [DWAMwfM2DrM](https://www.youtube.com/watch?v=DWAMwfM2DrM) | Development | 1m 17s |
| [-TvOCDbhCWk](https://www.youtube.com/watch?v=-TvOCDbhCWk) | Development | 55s |

## Review the source

Verify each video ID, channel and duration against the packet. Use playback with
sponsor skipping disabled so the reviewed intervals are actually watched. Do not
view candidate model predictions before completing the annotations. Caption timing
is approximate and cannot replace watching the actual boundary.

Follow [paid-selfpromo-v1](../bench/datasets/category-policy.json): paid external
advertising is `sponsor`, the creator's own paid offering is `selfpromo`, ordinary
unpaid discussion and like/subscribe requests are neutral. Affiliate/gifted or
unclear compensation stays uncertain. Record a known campaign identity if it can
be established. Leave it null when unknown. Do not guess to satisfy a leakage gate.

For each acquired record, supply the actual reviewer name and review timestamp.
Set `reviewerAttestation` to true only after personally reviewing the annotations.
Enter `reviewedSegments` for known paid/self-promotion intervals, with numeric
`start`, `end` seconds and `category`. Enter `reviewedNegativeIntervals` only for
ordinary intervals actually watched, with numeric `start` and `end`. Enter
`uncertainIntervals` for unresolved promotion with the suspected category and
optional notes. Ordinary intervals cannot overlap known or uncertain promotion.
Do not fill the rest of the video with ordinary labels by subtraction.

Keep `annotationCompleteness` as `partial` when any time remains unreviewed or
uncertain. `complete` requires reviewed positives and ordinary intervals to cover
the entire source without gaps. Leave unavailable records pending with no
attestation, null original fixture hash and empty arrays. Keep all selected IDs.

Use one `referenceSetVersion` for the packet. Change its top-level status to
`human-reviewed` only after every acquired source has been reviewed. Preserve
selection/registration hashes, policy version/hash and original fixture hashes.
The importer validates the attestation and data consistency. It cannot prove that
a person watched the intervals or that their judgments are correct.

## Import without changing the original data

Run from the repository, using actual private paths:

```sh
node bench/review-import.mjs \
  --manifest /absolute/path/to/fresh/manifest.json \
  --review /absolute/path/to/fresh-validation-review-template.json \
  --output /absolute/path/to/new-human-reviewed-dataset \
  --exposure-ledger /absolute/path/to/fresh-human-review-test-ledger.json
```

The output directory and exposure ledger must not already exist. The ledger path
is bound into the new manifest. A test run must use that same path with
`--test-ledger`; another filename cannot make the reviewed cohort unexposed again.
Existing or malformed exposure history rejects reference import, even if the input
manifest still says `none`.

The command preserves source caption cues and source hashes, stores the original
provisional reference spans in provenance, creates new fixture hashes and retains
missing sources. It writes a new manifest, the supplied review and import evidence.
It never overwrites original fixtures, selection records or review input, and
performs no model inference. Known campaigns crossing splits reject the import.

The actual pending packet was tested and rejected before creating an output
folder. Synthetic records exercised successful import, but no real human-reviewed
labels have been imported. The complete suite passed **171/171** tests with zero
skips and actual Chrome resource checks. Thirteen new failure-first regressions
cover source integrity, common version/policy, blinding, selection preservation,
reviewer provenance, time/ordinary conflicts, complete coverage, campaign leakage,
exposure history, original-data preservation and bound ledger identity.

After review, freeze code, model, configs and the new fixture set before any fresh
validation prediction. Run every declared candidate against that same reference
version. Report partial/unknown time and unavailable sources separately. Five
sources and three provisional validation paid references do not establish strong
general accuracy. Broader positive coverage, uncertainty estimates, campaign
checks and an independent fresh test remain necessary. Production still uses
Flow/0.8 and manual controls only.
