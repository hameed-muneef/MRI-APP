# Phase 7 verification matrix, in progress

No merge, signed artifact or release. Phase5 content gate is unresolved, so this is not all-phases completion.

| Area | Current evidence | Remaining |
|---|---|---|
| Unit | 256 passing, including plans, evidence, offline, native preference payloads | Recheck fetched remote head after publication |
| Node regressions | 173 passing | Recheck on final code |
| TypeScript/build | Passing Phase6 build and typecheck | Final publication retest |
| Quran integrity | Original checksum 7d07a93a4caa556b1dce92fbac347ffc7e74da12c0480dc898880627a2a0554a unchanged | Final check |
| Desktop regression | First run tests 1–32 passed before process timeout; bounded remaining reader/reciter/reminder/review batch 8/8 passed | One consolidated bounded accounting, latest audio cases |
| Mobile mastery | 12 tests passed: Phase2,3,4,6 session/masks/recording mock/understanding/planning/offline | Remaining audio and legacy screen regressions |
| Offline | Four new desktop/mobile cases pass: manage cache and full daily session with downloaded synthetic WAV after network removed. Production PWA cold reload and Quran/session render pass | Real-source downloaded playback and phone demo |
| Visual/RTL | Actual mobile/desktop viewport pixels inspected. Offline status moved to page flow, card spacing fixed, storage action clicked clear of navigation | Final Phase5 if approved; full dark/accessibility audit |
| Native reminders | 30-day bounded one-shot due summaries; original recurrence/start/end/snooze, quiet hours/categories/channel; permission refresh; serialized refresh and scoped cancel/rebuild. Pure payload tests pass | Plugin reconciliation mock integration, final unsigned Android compile, physical delivery/cancel/battery/reboot |
| Accessibility | Existing focus/keyboard sheet tests and selected control contrast assertions pass | Actual screen reader, broader light/dark contrast audit |
| Performance | Lazy Quran feature and bounded revision/catch-up | Measured session budgets |
| Privacy/sync | Local-only unchanged; recording explicit private save; no upload; pack deletion preserves learning | Device lifecycle tests; sync conflict tests inapplicable while sync disabled |
| Trusted content | No Quran source edits; attribution and unavailable states retained | Phase5 authorized reviewed lessons/exercises or user-approved interim scope |

## Physical Android protocol

1. Install a locally built unsigned-debug/test artifact through the normal developer workflow. No release signing or distribution is authorized.
2. Download verse audio while online, restart offline, finish one daily session, reload and check history, notes and recordings.
3. Deny then allow microphone; interrupt with phone call, background, lock screen, resume and leave the session. Confirm microphone is released and private recording save/delete works.
4. Test shared audio preemption and long lazy continuation without inflated repetition counts.
5. Opt into a near-term due review reminder. Check permission denial and grant, quiet hours, pause, assessment/deferral cancellation, closed-app delivery, reboot and battery restriction behavior. Reopen within the bounded horizon to refresh.
6. Use TalkBack, large text and dark/light modes. Check every mask/reveal button and sheet focus.
7. Do not publish until unresolved content and device/accessibility gates are explicitly accepted.
