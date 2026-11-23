> Current scope update, 23 November2026: Tajweed lessons and their interim external links/checklist were removed by user request. Older phase records below are historical, not a remaining Tajweed delivery gate. Latest defect/audio verification is in QURAN_MASTERY_AUDIT.md.

# Phase 7: final review-code verification

Draft PR9 is stacked on draft Phase4: https://github.com/hameed-muneef/MRI-APP/pull/9 . No merge, release signing, package distribution or production deployment. Review code is prepared; this is not a claim that every originally specified phase is complete.

## Status by phase

- Phase4 plans/revision/dashboard implemented and tested. Native closed-app reminder preparation is included in PR9, with OS/device caveats below.
- Phase5 user-approved interim external reading is implemented. All six topics point to inspected chapter openings of the attributed reference. Embedded authorized/reviewed lessons and validated exercises remain incomplete, not waived. The temporary personal checklist is not a test or evidence of mastery.
- Phase6 browser offline implementation verified. Physical Android demonstration remains for the user.
- Phase7 automated/readiness checks below pass. Physical accessibility/lifecycle checks remain release gates.

## Verification matrix

| Area | Evidence | Limits / remaining gate |
|---|---|---|
| Unit | 257 passing on fetched code86c36c7, including storage, evidence, plans, offline, native preferences and mocked plugin reconciliation | Mock is not OS execution |
| Node regressions | 173 passing | No physical-device claim |
| Browser regression | 82 existing/interim/offline cases passed in bounded batches, 41 per viewport; four new theme/viewport cases pass, total86 unique configured cases | Chromium, not every browser/device |
| TypeScript/build | Typecheck and production build pass on fetched review code | No signed production artifact |
| Quran integrity | Original checksum7d07a93a4caa556b1dce92fbac347ffc7e74da12c0480dc898880627a2a0554a unchanged;114 surahs/6236 verses | Manifest stability does not replace scholarly content review |
| Browser offline | Full daily session completes with downloaded synthetic decoded WAV, network disabled and fixtures removed; assessment persists. Production cold reload plus real-source Fatiha pack download, first-ayah natural playback and completed1 event verified without mocks | Actual audio decode/completion, not a pronunciation/content audition; user must test actual phone |
| Download lifecycle | Partial/resume/abort/no-skip/error/quota/eviction checks; deletion leaves progress/notes/recordings intact | Browser can evict storage; no backup/sync |
| Visual/RTL | Actual mobile/desktop pixels inspected. Layout gap fixed; offline status in page flow, no persistent content overlay; bottom storage control clicked clear of navigation. Light/dark palette fixes verified | User large-text and device review |
| Accessibility | Exposed enabled control text contrast >=4.5 in both themes/viewports; keyboard start/link and sheet focus/Escape tests; RTL overflow checks | Not a full WCAG audit; actual TalkBack/screen reader remains untested |
| Performance | Lazy feature loading retained; local screen-entry budget under5s, observed transition plus checks1.7–2.2s across themes/viewports | Not a low-end-phone or network benchmark |
| Native reminders | Original recurrence/start/end/snooze respected; bounded30-day due summaries, channel/category/quiet-hour/permission gates, serialized refresh and scoped cancellation. Mocked plugin test cancels stale reminders after due removal/permission loss without touching prayer/task alarms | Closed-app delivery, completion/deferral/pause on device, battery limits/reboot/horizon remain user tests |
| Android compile | Unsigned Java21/SDK36 compile passes on code86c36c7: https://github.com/hameed-muneef/MRI-APP/actions/runs/45214070405/job/137830358473 | Earlier parallel push run881e77f failed with truncated Gradle log while its PR run passed; latest PR compile passes. No packaging/signing/upload. Deprecation warnings for actions remain |
| Privacy/sync | Local-only unchanged; temporary recording with explicit private save; no upload; legacy data preserved | Sync/conflict testing is inapplicable while sync disabled, not a sync safety pass |
| Trusted content | No Quran source changes, invented rules/examples or automatic recitation judgment; external source attribution and unknown/unavailable states retained. Asbab al-nuzul now ships bundled from the MIT-licensed «صحيح أسباب النزول دراسة حديثية» dataset (200 entries, 277 ayah references) with honest empty state per verse; Tafsir al-Jalalayn added as the default tafsir via the QUL/tafsir_api CDN | Tajweed lessons removed by user request; token-level word meanings remain gated pending a licensed verified source |

## Physical Android protocol before release

1. Build/install a test artifact through the developer workflow. No release signing or distribution was performed.
2. Download verse audio while online, restart offline, complete a daily session, reload and check history, notes and recordings. Check missing-file and deletion behavior.
3. Deny then allow microphone; interrupt recording with phone call, background, lock screen, resume and exit. Confirm microphone release and private recording save/play/delete.
4. Test shared audio preemption, reciter changes and long lazy continuation without inflated repetition counts.
5. Opt into a near-term due review reminder. Test permission denial/grant, quiet hours, assessment/deferral/pause cancellation, closed-app delivery, reboot and battery restriction behavior. Reopen within the bounded horizon to refresh.
6. Use TalkBack, large text and both themes. Check mask/reveal controls, focus, sheet closing and bottom actions.
7. Review content scope and remaining gates before any merge/release. iOS is unverified; no cloud sync or automated voice assessment is included.
