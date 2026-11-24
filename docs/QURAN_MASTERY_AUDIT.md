# Fresh mastery defect audit, 23 November 2026

Scope: the unmerged review stack through PR9. No merge, release, signing, APK/AAB packaging, production deployment, cloud/auth enablement or Quran-source modification.

## Reproduced defects and fixes

- Progressive hiding began with all text visible but counted as unassisted recall. Only complete initially hidden A/E attempts without help can now advance evidence. Progressive mode is clearly labelled as practice.
- A completed recall could be copied when resuming the assessment stage and later reused as new dated evidence. Assessment resumes now return to fresh recall, clear completion and retain prior help; old-day completion cannot advance the ladder.
- Unavailable storage could crash reads or silently accept saves. Reads now report failure; writes fail explicitly. Corrupt/future roots are preserved and not overwritten. Stale windows cannot silently replace newer learning state. This is optimistic conflict detection, not cloud synchronization or a cross-window transaction lock.
- Invalid schedule dates/timezones could crash the dashboard. They are validated before use; invalid mastery backup data is rejected before unrelated backup writes.
- Download deletion could race an active transfer. Destructive pack controls are disabled during transfer. Malformed pack metadata is ignored; truncated metadata cannot pass a presence check. Missing persistent-storage support now has explicit feedback.
- Session audio lacked a visible current-ayah marker. Its verse card is now highlighted while resolving/playing and cleared on stop. Permission requests update recording UI immediately; unsupported recording has a clear message.
- Multi-range engine chunk ordering reset at each surah. Engine order is now global. Organized plan reshaping already assigned global order, so this is an engine-level regression fix, not a claim that its existing UI interleaved chapters.
- Settings now explicitly says its JSON backup excludes audio blobs and downloaded content, while including learning records and notes. No false recording-backup claim.

## Checks

Fresh baseline:257 source tests passed. Current fetched review head4dcdec4:268 source tests, TypeScript and production build passed.173 Node tests passed during this audit. Original Quran checksum remains7d07a93a4caa556b1dce92fbac347ffc7e74da12c0480dc898880627a2a0554a (114 surahs/6236 verses).

Browser checks ran in bounded batches across desktop/mobile: new evidence/storage/resume/persistence/active-ayah/deletion cases, existing learning/assessment/recording/understanding/plans/offline flows, light/dark contrast and keyboard checks, and unrelated navigation/location/reciter/reminder/review regressions. A whole desktop invocation was interrupted by its process limit; completed cases were retained and remaining cases rerun in bounded batches. An over-strict new uniqueness check was caught by the existing offline fixture and removed before final verification. No failure is represented as a pass.

Actual progressive warning, storage-conflict warning and active-ayah pixels were inspected. Existing synthetic offline-session and live Quran.com resolution/bytes checks passed. This audit does not repeat or upgrade the prior real-source production cold-offline proof into physical-phone evidence. Build retains an existing large-chunk warning.

## Still open

Tajweed lessons, interim reference links and checklist were removed at the user's request on 23 November2026 and are no longer an open scope gate. Physical Android microphone/calls/background/notification/battery/reboot/lazy playback and actual TalkBack remain device gates. No iOS or automatic pronunciation assessment claim. No software audit proves absence of every defect.

## Original-spec audio continuation

The earlier closeout did not satisfy every original audio requirement. This continuation adds previous/next ayah selection within the session range, true pause/resume at the current media position, and session speeds 0.5/0.75/1/1.25/1.5/2. Whole-passage replay starts at the original range start. Previous/next stops the partial play and never counts it as completed. Pause holds both pending URL resolution and the inter-verse delay. Reciter changes retain the stable playback range and completed repetition count.

Web speed survives the media load reset and is reapplied to each repeated verse. Android receives per-track rate metadata and an active rate command, using PlaybackParams with unchanged pitch; pause during preparation does not autoplay. Session tracks do not restore a prior verse's saved media position into a new repetition. This native path still requires real-device listening/interrupt testing, not merely compilation.

Original-spec comparison also exposed the missing reciter comparison route during recall. Reference playback is now available in the recall stage alongside temporary recording replay. Reference playback reveals the text and records help, so it cannot earn unassisted mastery. Comparison preserves an existing temporary recording. Recording and reference playback stop each other; pending microphone permission blocks starting comparison. No speech recognition or automated pronunciation score is claimed.

Verification for this continuation:271 unit tests,173 Node tests, TypeScript, production build and unchanged Quran checksum. Ten new configured browser cases (five scenarios on desktop/mobile) verify real HTMLAudioElement position/rate against controlled WAV audio: pause/resume and navigation evidence, whole-passage replay, assisted comparison, pause during resolution, and pause between verses. Twenty existing audio/audit regressions passed, including live Quran.com resolution/bytes. Four existing light/dark desktop/mobile accessibility cases passed. A combined command hit its overall time budget after twelve completed browser cases; all five mobile transport cases were then rerun in a bounded batch. No incomplete invocation is counted as a full pass. Actual paused mobile controls were visually inspected.

## Remaining requirement classification

- Reviewed religious-content/data dependencies: reliable referenced Asbab al-Nuzul and validated word meanings remain incomplete. Accurate word-part hiding remains gated on verified word structure. No generated substitute religious content was added.
- Deliberately restricted infrastructure: local-only learning, notes and recording storage remain enabled; authentication/cloud synchronization remain disabled by the user's project boundary. No claim of cross-device synchronization.
- Device/release gates: physical Android audio rates/pitch, microphone, interruptions/calls, background/lazy playback, notification/battery/reboot and actual TalkBack remain unverified. No iOS, merge, signed artifact, packaging or release claim.
- Existing implementable flows reviewed against the original request: free/organized range plans, adaptive review and catch-up, evidence-based mastery, dashboard/history, hide/reveal, progressive connection, attributed understanding/private notes, explicit recording storage and offline packs retain their existing implementation and automated coverage. This is not proof that no further defect exists.

## User scope change, 23 November2026

Tajweed education was removed by explicit request. The mastery landing/session reference card, six-topic external links and temporary checklist are removed. Its former source/component are deleted; the regression now verifies absence without losing session, audio or assessment behavior. Phase5 interim research remains historical, not a current requirement or completion blocker. The user guide and current acceptance matrix reflect this narrower scope.
