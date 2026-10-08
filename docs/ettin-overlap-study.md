# Guarded Ettin overlap study

This is a development decoding experiment, not a production model change or an
independent test. The shipped Flow decoder and 0.8 default are unchanged.

The candidate set was registered before this study scored any candidates:
three families (original per-window union, mean token-logit consensus and
context-weighted consensus), seven thresholds, fixed 24-character/1.5-second
merge gaps. It reuses hash-verified browser INT8 logits from tuning runs on both
WebGPU and WASM. Node performs pure decoding/scoring, never model inference.
The old frozen test set, ledger, registry, model bytes and original adapters are
unchanged and were not read by this study.

Consensus combines repeated-token evidence before the unchanged legal BILOU
decoder rather than accepting a positive span from either overlapping window.
Context weights increase with distance from a window edge, capped at the
existing 128-token overlap. No window size, trained weight or keyword prefilter
was tuned.

## Results

Five tuning transcripts cover four channels, but all four paid-sponsor
references come from one channel. Crowd references are provisional and partial,
with no reviewed negative exposure. Unknown time is not treated as ordinary
content. Agreement precision therefore is not established false-skip precision.

| Operating point | Paid reference matches | Segment agreement F1 | Sponsor seconds covered | Extra predicted seconds outside known references |
| --- | ---: | ---: | ---: | ---: |
| Shipped Flow / 0.8 | 3/4 | 0.857 | 82.23% | 0 |
| Best in-sample, context consensus / 0.7 | 4/4 | 1.000 | 93.86% | 8.056 |
| Channel-held-out selection, WebGPU | 3/4 | 0.750 | 82.23% | 0 |
| Channel-held-out selection, WASM | 3/4 | 0.857 | 82.23% | 0 |

The apparent perfect in-sample score does not transfer to the channel-held-out
procedure. When the only sponsor-positive channel is excluded, the remaining
channels provide no paid references to learn an operating point, so selection
correctly falls back to the shipped baseline. WebGPU's selected low-threshold
point on another excluded channel adds a paid-sponsor suggestion overlapping
a provisional self-promotion reference. Backend sensitivity near a threshold
is retained in the record rather than hidden.

No candidate is promoted. The predeclared gate requires at least three
sponsor-positive channels, twelve references, conservative out-of-fold
agreement, increased sponsor coverage and no extra unknown prediction seconds.
The current data fails those requirements. Independent fresh testing and
reviewed ordinary exposure remain necessary before automatic skipping.

The useful next action is acquisition across more sponsor-positive tuning
channels, followed by this same fixed study. Adjusting examples or publishing
100% as a general quality result would overfit the present sample. Upstream
model-training overlap remains unknown.

## Reproduction and checks

The [registered plan](../bench/experiments/ettin-overlap-v1.json) and
[complete caption-free numeric record](ettin-evidence/overlap-study.json) retain
all 21 operating points for each backend, channel splits/selected points,
bootstrap uncertainty, cache identities and promotion failures.

```bash
node bench/overlap-study.mjs --runs mac-20261007-v3-tune-ettin-int8-webgpu,mac-20261007-v3-tune-ettin-int8-wasm
```

This requires the original private tune caches and exact fixture hashes. Missing
or altered cache data is rejected. Results default to ignored bench/local.
Fixed Mac guards remain 28,672 MiB maximum same-UID RSS and 4,096 MiB minimum
available-memory proxy. Observed peak was 23,162.48 MiB, including unrelated
apps and shared-page duplication. No new model inference was needed.

Twelve new tests cover contradictory overlap evidence, context weighting,
identity/timing validation, preservation of single-window evidence, true
channel separation, rejection of exposed test inputs, invalid-output exclusion
missing sample-count rejection and conservative selection/promotion. Initial failures were recorded before
implementation. Original Flow parity behavior is preserved.

The full repository suite passed 111/111 tests with no skips and real Chrome
environment checks under the same fixed resource policy. Production source,
original Flow adapter, registry, pilot manifest and frozen config were verified
unchanged relative to the production-switch commit.

After this study, a preserved public transcript snapshot from a second
sponsor-positive tuning channel was recovered after agent inspection of its
complete English text, corroborated against the public UI. It belongs only to a
separate private development manifest and is not in the above scores. Its exact
selected caption-track ID remains unknown, all listed player tracks were ASR,
and its crowd labels remain provisional. Neither the original manifest nor
reviewed-negative exposure was changed.

## Expanded development sample

The second sponsor-positive channel was then evaluated with real Chrome INT8
inference on both WebGPU and CPU/WASM, at source33973c8. All six acquired tune
tracks completed, with 24 missing-caption records retained. The same fixed21
candidates were scored without reading the original test set.

The shipped baseline matched4/5 references, with segment agreementF1 0.889 and
84.48% sponsor seconds covered. The new in-sample choice (mean consensus/0.7)
matched5/5 and covered92.18%, again adding8.056 unknown predicted seconds.
Channel-held-out selection matched4/5 and covered only82.84%. GPU agreementF1
was0.800 and CPU0.889. Promotion remains rejected. Two positive channels and
five references are still insufficient, and validation coverage decreased.
See the [expanded caption-free record](ettin-evidence/overlap-study-expanded.json).
The complete21-point traces per backend remain in the private development output.

Another English transcript was acquired from Real Engineering. Its crowd
sponsor/self-promotion intervals overlap. Both were marked disputed before
model inference, following the existing uncertain-category policy. They do not
count as a new paid positive or as reviewed ordinary content. This new private
seven-track development manifest is a subsequent phase and is not part of the
six-track scores above. The original frozen manifest remains untouched.

## Disputed-category stress check

Both native Chrome backends completed the seven-track development run. The
existing0.8 baseline matched4/5 paid references and produced one additional
suggestion in the disputed region, giving provisional segment agreementF1
0.800. That additional suggestion is unknown, not a confirmed ordinary-content
false skip.

The in-sample selection moved to the original Flow decoder at0.95. Channel-held-out
selection then matched only3/5 references, with agreementF1 0.667 on both
backends. This recall regression rejects promotion as well. The preferred
configuration changing materially when one uncertain transcript is added is
another sign that the small, partial annotation sample cannot justify tuning
the production algorithm. [Numeric record](ettin-evidence/overlap-study-disputed.json).

No automatic skipping or new production operating point is enabled. The next
quality phase needs more sponsor-positive channels, resolved category disputes
and reviewed ordinary exposure. The public-panel fallback has since passed actual installed-extension
classification; live public-media Skip/Undo remains unverified. See
[application evidence](ettin-integration.md).

## Ten-track development sample

A further public acquisition pass tried 22 remaining tuning videos, acquiring
only two more tracks; the 20 transport/metadata failures remain recorded. A
fresh Mark Rober retry recovered a complete English transcript with an unknown
selected caption type. A separate, tested development converter preserves that
unknown type instead of guessing manual/automatic. The frozen importer and
original manifest are unchanged. All added labels remain provisional, with no
reviewed negative intervals. The recovered tracks include a six-cue short video.

The private development sample now has ten tracks across seven channels, three
paid-positive channels, eight scorable paid references and two disputed category
references. The same registered 21 candidates were scored against fresh real
Chrome INT8 tune logits on WebGPU and WASM (source `06a8899`). Both runs completed
all ten available tracks; the twenty missing tracks remain explicit.

| Operating point | Paid reference matches | Agreement precision | Agreement recall | Sponsor seconds covered |
| --- | ---: | ---: | ---: | ---: |
| Shipped Flow / 0.8, either backend | 5/8 | 0.833 | 0.625 | 64.18% |
| All-tune selection, Flow / 0.95 | 4/8 | 1.000 | 0.500 | 57.05% |
| Channel-held-out selection, either backend | 4/8 | 0.800 | 0.500 | 57.05% |

Promotion again fails: too few references, low out-of-fold agreement precision,
recall regression and no coverage improvement. The expanded result is weaker
than the original sparse sample. It does not substantiate great accuracy.
[Caption-free numeric record](ettin-evidence/overlap-study-ten-tracks.json).

The missed short sponsor introductions and integrated third-party product pitch
are below the shipped confidence threshold. The upstream Android model card
uses 0.7, but merely lowering our threshold adds a suggestion overlapping a
provisional self-promotion reference and more unknown time. This finding motivates
a separately registered, development-only self-sponsorship policy experiment;
it does not authorize a threshold change or reclassifying uncertain references.
The pinned model card explicitly targets external paid sponsors and treats
self-promotion as negative. [Pinned upstream model card](https://huggingface.co/CuriousDragon/ettin-17m-sponsor-combined-android/blob/d4939256c49e92d158429a55fcf39477d003dd58/README.md).

Inference peak same-UID RSS was 24,864.0 MiB on GPU and 24,788.0 MiB on CPU,
within the unchanged 28,672/4,096 MiB guard policy. The converter and existing
suite passed 140/140 tests with real Chrome checks and zero skips. Original
frozen benchmark files, exposed test history and production decoder remain
unchanged.

## Explicit self-sponsorship policy experiment

A separate three-point [plan](../bench/experiments/ettin-self-sponsor-v1.json)
was committed at `fed03cc` before scoring: baseline Flow/0.8, Flow/0.8 with a
self-sponsorship veto, and Flow/0.7 with that veto. The hypothesis was conceived
after qualitative tuning inspection, so even channel exclusion is development
evidence; it is not independent validation.

The filter acts only after the complete transcript has reached the model. It
rejects an affirmative first-person self-sponsored clause in complete caption
cues wholly inside a predicted span. Quoted speech is ignored, negations and
third-person discussion do not match, and explicit third-party attribution
preserves mixed promotions conservatively. There are no creator/brand rules,
position cutoffs, duration cutoffs or reference-label inputs. This narrow policy
cannot identify every self-promotion or resolve ambiguous memberships.

At 0.7 it removed one prediction overlapping 39.706 seconds of a provisional
self-promotion reference on both backends. It did not remove any known paid
reference match. The complete three-candidate results are retained:

| Development point | Paid matches | Agreement precision | Agreement F1 | Sponsor seconds covered | Unknown predicted seconds |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline / 0.8, either backend | 5/8 | 0.833 | 0.714 | 64.18% | 102.633 |
| Veto / 0.8, either backend | 5/8 | 0.833 | 0.714 | 64.18% | 102.633 |
| Veto / 0.7, GPU | 8/8 | 0.889 | 0.941 | 86.56% | 119.344 |
| Veto / 0.7, CPU | 8/8 | 0.800 | 0.889 | 86.56% | 178.690 |
| Channel-held-out selection, either backend | 5/8 | 0.833 | 0.714 | 64.18% | 102.633 |

The CPU-only additional low-threshold interval concerns a product discussion;
it is unreviewed and remains unknown. The disputed category prediction is also
preserved. Neither is reclassified to improve the score. Conservative selection
on excluded channels provides no improvement, with too few references and
agreement precision below the fixed gate. Production retains Flow/0.8; this
filter is not imported into the extension. Automatic skipping remains disabled.
[Full caption-free policy record](ettin-evidence/self-sponsor-study.json).

Six failure-first policy tests cover affirmative and split-cue declarations,
negation, quoted/third-person speech, mixed external sponsorship, cue containment,
input immutability and malformed inputs. The full suite passed 146/146 with zero
skips and actual Chrome environment checks. Policy scoring reused authenticated
v6 tune logits, never old test predictions or new Node/cloud inference. Reviewed
negative exposure, resolved disputes and a fresh unseen-channel holdout remain
necessary for a stronger quality claim.
