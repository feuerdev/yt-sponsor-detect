# Fresh channel validation

This cohort was registered and selected before caption acquisition or model
predictions. It is separate from the exposed original benchmark and all earlier
tuning transcripts. The six channel identities were verified against public
YouTube RSS feeds. All six feeds succeeded. Three newest entries per channel
were selected, without choosing based on label count, duration or caption access.

The eighteen exact IDs and whole-channel splits are fixed in the
[selection record](ettin-evidence/fresh-channel-selection.json), with the
[sampling registration](../bench/experiments/fresh-channel-validation-v1.json).
SHA-256 channel order assigns DIY Perks, NileRed and ElectroBOOM to development
and Fireship, Stuff Made Here and Project Farm to validation. Both groups have
nine selected videos. No original pilot channels, pilot IDs or known published
model examples are eligible. Transport failures cannot be replaced with easier
videos. Short tracks are included.

Public SponsorBlock metadata was snapshotted after ID selection. It supplies
eight provisional paid references in each split, before resolving overlaps.
Unlabelled time remains unknown. Category overlaps must be disputed before
inference. No negative intervals have been human reviewed. Channel disjointness
is relative to our benchmark; upstream training and campaign overlap remain
unknown. Publication dates do not establish a model training cutoff.

Caption acquisition uses the same installed-extension public panel reader and
native English detection, with inference disabled. Exact selected track type
may honestly remain unknown. A fresh converter checks the registration hash,
selection hash, original selection identity, channel splits, prior/canary
exclusions and absence of test exposure. It validates cue/source/language/duration
and reference bounds, preserves disputed categories and never invents negatives.
The frozen original importer and dataset remain unchanged.

Six failure-first regressions and the full **152/152** repository suite passed,
with zero skips and real Chrome checks under the established 28,672 MiB maximum
same-UID RSS / 4,096 MiB minimum available proxy guards.

At this checkpoint acquisition and quality evaluation are pending. There are no
fresh model predictions, no accuracy result, no promotion and no automatic
skipping. Configuration and fixture hashes must be frozen before first validation
inference, using a separate exposure ledger that preserves the original ledger.
Candidate budgets and selection rules remain those already registered. A common
human reference version, reviewed ordinary exposure and campaign checks remain
required for a release-quality claim.

## Separate exposure lock

`bench/run.mjs` now accepts `--test-ledger /absolute/path/to/fresh-ledger.json`
for a genuinely fresh frozen cohort. Omitting it preserves the original
`bench/local/test-ledger.json` default. An incompatible config/selection or corrupt
existing history is rejected; the helper retains first-exposure time, previous
attempt events and legacy provenance. A reused run ID is rejected. Events are
recorded as **before-inference attempts**, not as completed model predictions.
The ledger path is recorded in each test run's metadata. Original history is
unchanged by this development work and matches the exported original ledger.

Six additional failure-first ledger regressions pass, including byte-identical
preservation of a separate original history, compatible backend attempts,
changed config/selection rejection, corrupt JSON and duplicate run protection.
After all sequential acquisition browsers closed, the complete suite passed
**158/158** tests with zero skips and actual Chrome checks under the same guards.
A blind human review template following the [category policy](../bench/datasets/category-policy.json)
has been prepared privately for the selected videos; all reviewed intervals and
reviewer fields remain pending. No human review or fresh accuracy is claimed.

## Completed first acquisition pass

The fixed eighteen-video pass completed with **3 acquired transcripts and 15
failures**. All three successful tracks are automatic English captions from
ElectroBOOM: one sponsor-positive full video and two short science clips. The
nine fresh validation tracks are all unavailable. Their absence supplies no
accuracy evidence or negative labels, and no fresh validation predictions have
been exposed. They stay in the selection for later source recovery; they are
not replaced by easier videos.

The acquired development tracks add one provisional paid reference from a new
channel. A separate combined development manifest contains only the original
thirty tune IDs and the nine newly registered tune IDs: thirteen acquired tracks,
four sponsor-positive channels and nine scorable paid references. It contains
no test entries and is still not an independent quality evaluation.

A targeted retry of the latest DIY Perks video inspected the actual public UI.
The Transcript tab was already selected, with zero caption rows. Chrome observed
HTTP **400** from `/youtubei/v1/get_transcript`. This corroborates the empty-panel
transport failure; no alternate client or direct endpoint replay was attempted.
The retry failure and original eighteen attempts remain separate preserved
records. Raw panel data/captions, profiles and request parameters stay private.
[Caption-free acquisition evidence](ettin-evidence/fresh-channel-acquisition.json).

Peak same-UID RSS was **26,017.156 MiB** within the unchanged guard. The sequential
task-owned browsers and profiles closed. Fresh accuracy, resolved categories,
campaign checks and reviewed ordinary exposure remain pending.

## Registered thirteen-track development check

The complete combined development snapshot has thirteen acquired tracks from
eight channels, four paid-positive channels and nine provisional paid references.
Both actual Chrome INT8 GPU and WASM runs succeeded for all thirteen available
tracks; the other twenty-six selected development videos remain missing. The
source was clean commit `22d0f36`. GPU peak same-UID RSS was 25,652.9 MiB and
WASM peak was 25,238.2 MiB, within the unchanged resource guards.

Production Flow decoding at 0.8 matched **6 of 9** provisional sponsor segments,
with agreement precision 85.7%, recall 66.7% and timed sponsor coverage 69.9%.
Unknown suggested time was 103.913 seconds; it is not reviewed false-positive
exposure. The registered 21-point overlap study's channel-held-out choice matched
5 of 9 and lowered coverage to 64.0%. It failed the promotion requirements.

The separate three-point self-sponsorship experiment matched 9 of 9 in-sample at
0.7, but introduced additional unknown suggestions and did not improve held-out
channel selection: both backends returned the baseline 6 of 9 and 69.9% coverage.
It also failed promotion. Production decoding, threshold and manual-only behavior
remain unchanged. These are development results, not fresh test accuracy.
[Overlap evidence](ettin-evidence/overlap-study-thirteen-tracks.json) and
[self-sponsorship evidence](ettin-evidence/self-sponsor-study-thirteen-tracks.json).

## Public source recovery after the first pass

A headed isolated retry of the same Stuff Made Here ID still returned transcript
HTTP 400. Regular Chrome's public UI succeeded for two fixed validation IDs:
`RpslsMqPFWA` (785 rendered rows, 778 normalized cues) and `WrCjAAl9okA`
(48 rows/cues). Native Chrome language detection, with extension inference disabled,
verified reliable English at 100% for both. Exact track IDs remain unknown. The
first selected label explicitly said English auto-generated; the second has no
selected type metadata and is recorded honestly as unknown. The built-in export
for the first video unexpectedly returned German and was excluded; actual visible
English DOM rows were saved locally instead. No authentication/profile state was
transferred or external caption upload performed.

The other thirteen failed sources were attempted in the same regular browser:
twelve showed empty public transcript panels, and one lacked a visible transcript
control. They remain selected, with failures preserved. Current source coverage
is **5/18**: three development transcripts and two validation transcripts carrying
three provisional paid references. No fresh validation predictions have been
produced; config/fixture freeze and human review remain pending.

Actual public playback worked on the first regular-Chrome source. Our unreleased
extension was not installed there, so this supplies no live Skip/Undo proof.
All task-owned source tabs, local collector and isolated verifier profiles closed.
[Caption-free recovery evidence](ettin-evidence/fresh-channel-recovery.json).

A further documented browser-export diagnostic on the fixed Fireship ID
`No-JPdFvYWU` returned a file whose header said `Language: en`, but its text
was German. Native Chrome language detection, with model inference disabled,
confirmed reliable German at 100%. The export was excluded. Source headers and
selected type metadata never override actual language verification. This adds
no English fixture and exposes no validation prediction.
[Caption-free mismatch evidence](ettin-evidence/export-language-mismatch.json).

## Checked human reference import

A [review workflow](human-reference-review.md) now has an explicit fresh-only
import command. It validates a common human reference version/policy, original
fixture hashes, reviewer attestation and blind source review. Pending packets,
changed sources, incomplete selected populations, ordinary/promotion conflicts,
invalid complete coverage, campaign leakage and existing exposure history reject
import. New reviewed fixtures preserve original captions and provisional references.
They bind one exposure ledger path, which the runner enforces before test inference.
No real human labels have been created. The actual pending packet rejected safely
without creating a dataset. The complete regression suite passed 171/171 tests.
