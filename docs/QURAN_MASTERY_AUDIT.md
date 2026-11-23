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

Embedded authorized/reviewed Tajweed lessons and validated exercises remain incomplete. The approved six-topic external reading interim is unchanged. Physical Android microphone/calls/background/notification/battery/reboot/lazy playback and actual TalkBack remain device gates. No iOS or automatic pronunciation assessment claim. No software audit proves absence of every defect.
