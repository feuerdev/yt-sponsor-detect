# Viewer source attribution and distribution status

The new `src/viewer/` modules, `src/viewer-*.js` entrypoints, viewer HTML/CSS and new viewer regression tests are GPL-3.0-or-later. The full license is in `src/viewer/LICENSE`.

Transcript acquisition adapts the design and JSON3 word-timing approach of [SponsorSkip](https://github.com/edde746/sponsorskip), copyright 2026 SponsorSkip contributors, GPL-3.0-or-later, pinned at `01e53cbe8beb02f0ce125736b88df99396793595`. Primary references: `src/page/transcript.ts`, `src/page/index.ts`, `src/content/transcriptBridge.ts`. The implementation adds track fallback, current-video identity, validated messages/times, distinct absence/language/failure states, cancellation, and rejects arbitrary fetch URLs. It does not copy the upstream minimum-word cutoff.

Event-based skip scheduling follows the same general design as SponsorSkip. This implementation uses ordinary timers and playback events rather than upstream's final-250ms busy interval. It validates identity before seeks and preserves user suppression through same-video player replacement.

The standalone benchmark already contains an attributed GPL SponsorSkip decoder; see `bench/reference/NOTICE.md`. Production does not currently ship SponsorSkip weights. Those weights have separate CC BY-NC-SA 4.0 terms, including noncommercial use. Original source files retain their existing distribution status; package metadata remains UNLICENSED. No commercial distribution, store submission, or model rights clearance is claimed by this change. No caption tracks, model binaries, browser profiles or authentication data belong in Git.
