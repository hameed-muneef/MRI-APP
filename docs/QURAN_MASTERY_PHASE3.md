# Quran mastery, Phase 3 review

Scope approved: shared audio ownership, cancellation and reciter changes, narration separation, in-session understanding, attribution, local deletable notes. No merge, release, auth/cloud activation or Phase 4.

## Audio capability matrix

| Source | Per-verse indication | Whole chapter | Offline resolution |
| --- | --- | --- | --- |
| Quran.com per-ayah | Exact track reference only | No | Previously resolved in memory; audio bytes may be cached |
| EveryAyah folder | Exact track reference, Hafs guard required | No | Deterministic URL; bytes still need cache/network |
| MP3Quran / Quran.com chapter | No estimated verse highlighting | Yes | Existing downloaded packs reused |
| Live stream | No verse mapping | No | Not an offline source |

All Quran recitation uses the existing background player. Mastery repetition resolves one verse at a time; stale requests abort, and reciter changes retain verse position and completed cycles. Repetition history records reciter changes. A completion receipt contains the exact naturally ended track ID; external stop, preemption and error do not grant a completed repeat. Android emits the same receipt, but physical-device validation remains required.

Reader sequences stop at the first missing verse or chapter rather than filtering it out. The older reader repetition now uses the same background player lazy queue: only the current track is resolved/allocated, with repetition coordinates computed from the cursor. Pause/resume, previous/next, external-preemption cancellation and explicit missing-audio stop are preserved and unit-tested. Natural-completion receipts advance the lazy cursor; no later verse is requested after missing audio. Whole-chapter playback never highlights an estimated current verse. Non-Hafs/unknown narrations play independently in the library without updating Hafs reader/session selection.

## Understanding and storage

The sheet opens from each session verse or the session footer. It keeps the session range/stage, uses the existing Tafsir/translation offline pack and cache APIs, aborts stale requests, reports load failure and offers retry. The dialog has keyboard focus containment, Escape close and focus return. Changing sources does not erase an unsaved note; leaving an unsaved note requires confirmation. Opening the sheet during recall records reveal assistance.

Notes use validated `rabbani-verse-notes-v1` local storage, separate from legacy `rabbani-v1` and mastery evidence. Save/delete failure is visible. Malformed/unsupported data is not overwritten. Notes are never uploaded. Browser data deletion removes them. No cloud backup is implied.

## Resource and licensing register

Verified metadata endpoints on 2026-11-23:
- https://api.quran.com/api/v4/resources/tafsirs?language=en
- https://api.quran.com/api/v4/resources/translations?language=en
- https://api.quran.com/api/v4/resources/recitations?language=en

Configured Tafsir resources: 91 Sa'di, 16 Muyassar, 14 Ibn Kathir, 90 Qurtubi, 15 Tabari, 94 Baghawi. Configured translations: 20 Saheeh International, 22 Yusuf Ali, 19 Pickthall, 85 M.A.S. Abdel Haleem. ID 85 was previously mislabeled as Taqi Usmani; this phase corrects the attribution without changing the resource ID or cached text.

Text edition/version is not supplied by the existing provider response. UI explicitly says so, alongside the resource name and Quran.com API v4 transport version. API version is not represented as the text edition. These are existing integrations, not newly licensed content. This phase grants no redistribution rights and adds no new bulk content pack. Publisher/edition and redistribution/license review remain release checks where required.

Asbab and word meanings have no approved integrated source. Both remain honest gates, with no general Tafsir substituted as Asbab and no token-aligned meanings invented. Word-level masking remains disabled.

## Verification and release conditions

Run `npm run lint`, `npm run test:unit`, `npm test`, `npm run quran:check`, `npm run build`, and all Playwright specs in both projects. Controlled audio tests cover resolution/playback failures, no-skip retry and reciter change. Adapter tests cover cancellation, preemption, explicit completion and missing verses. UI tests cover attribution, gates, local notes, retry, focus return and cached-resource reuse offline. Test text is a fixture, not religious content.

Physical-device microphone/call/background behavior and actual screen-reader use remain pending from Phase 2. Android native completion receipt changes compile successfully in the unsigned check below; device behavior remains unverified before release. No estimated timing is accepted as verse alignment.

Review this PR on top of the unmerged Phase 2 branch. Do not merge either phase without separate authorization.

### Follow-up verification

Legacy reader lazy-queue migration is complete. New tests exercise 10,000 configured repetitions with one allocated track, pause/resume and previous/next, missing audio, stale resolution after another owner starts, and exact natural completion. User-approved isolated GitHub Actions check now passes on Java 21 with Android SDK platform 36 / build-tools 36.0.0: `:app:compileDebugJavaWithJavac`, including local-only web build and Capacitor sync. Verified run: https://github.com/hameed-muneef/MRI-APP/actions/runs/45202118546/job/137788060209 (commit `6adf8d5`). The first check stopped before compilation because `sdkmanager` was not on PATH; using the runner SDK path fixed setup. No app compile fixes were needed. Workflow has read-only contents permission, no persisted checkout credentials, no signing secrets, APK/AAB packaging, artifact upload, installation or release. The existing release/signing workflow was not dispatched. Final local checks: 241 unit tests, 173 Node tests, 72 browser tests, type-check/build pass; canonical Quran checksum remains `7d07a93a4caa556b1dce92fbac347ffc7e74da12c0480dc898880627a2a0554a`. Native background continuity for JS-driven lazy advancement remains a physical-device release check.

## Required quality gate for every phase

User requirement: verify working functionality, actual GUI interactions and design at every phase. Passing tests/build alone is not enough. Inspect rendered mobile and desktop screens, operate the affected controls, check fixed overlays, focus, RTL text, contrast, overflow, loading/error/empty states, and record screenshots. Fix visible issues and inspect again. Keep native/device-only behavior explicitly unverified until exercised on the target device. Phase approval never implies merge, release or approval of the next phase.
