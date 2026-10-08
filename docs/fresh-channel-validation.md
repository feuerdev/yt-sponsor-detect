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
