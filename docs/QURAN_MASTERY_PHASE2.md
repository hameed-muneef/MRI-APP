# Quran mastery, Phase 2

Status: implementation for review, not a release or merge approval. Phases 3–7 remain gated.

## Entry points

Quran > Hifz opens the six-stage local session. Quran > Revision opens the same engine at Recite, then Assess. Existing plans/reviews remain visible beneath it and retain their original data. Free sessions select one surah and an inclusive verse range. Organized-plan configuration and adaptive scheduling UI belong to Phase 4.

## Engine and policy

`engine.ts` is framework independent. New sessions traverse Listen, Understand, Memorize, Connect, Recite, Assess. Revision uses Recite and Assess. A session has a purpose, canonical range, stage, start/update/end timestamps and explicit completion reason. Stage transitions are persisted immediately. Exiting or backgrounding marks interruption; reopening a stale session after a crash resumes its recorded stage under a new session ID. A continued attempt is copied with provenance under the resumed session, preserving assistance history.

Repetition scopes are verse, pairs of verses and full passage. Presets are 1/3/5/10/15/20, with a custom integer up to 100. Optional 0–30 second pauses and automatic group advance are available. Only a complete selected range increments a repetition event. Stop/error/background during playback records interruption; missing audio does not skip the verse or increment completion. Network failures are explicit. Session playback reuses the existing Quran.com per-ayah resolver; only the listed Hafs-compatible reciters are offered. No estimated timing or word synchronization is claimed.

Connection chains expand from the first verse to the full passage. An adjacent previously completed passage in the same surah can be connected in the next session. This is separate from the legacy ordering quiz.

A/B/D/E are visual-only mask states. D progressively hides verses in canonical order. All modes retain immediate reveal-all and individual reveal. Reveal/help events and difficult-verse flags belong to RecallAttempt. C and word meanings remain gated; legacy word-fragment exercises are no longer offered. Canonical Quran asset bytes are not changed.

### `mastery-v1`

Assessments use exactly: لم أتقن بعد / أحتاج مزيداً من التثبيت / جيد / متقن.

Projection states are قيد الحفظ / بحاجة إلى تثبيت / متقن. Every projection stores assessment evidence IDs and policy version. Session completion never changes mastery by itself. A valid assessment must link to an attempt and its session/passsage, and an attempt can only be assessed once.

A completed unassisted recall can advance the evidence ladder at most once on a due local calendar day. The ladder is same day, +1, +3, +7, +14, +30 days. Five eligible positive assessments across the due ladder and a final explicit "متقن" rating are needed for a mastered projection. Same-day, early, assisted and self-report assessments do not advance evidence. A weak rating resets the ladder and projection. This is conservative self-assessment evidence, not a claim of independently measured recitation accuracy or religious certification. Adaptive limits, deferrals and schedule-management UI remain Phase 4.

## Local schema and privacy

`types.ts` defines Plan, Passage, Session, RepetitionEvent, RecallAttempt, Assessment, MasteryProjection, RevisionSchedule and RecordingMeta. Plans/passages store references only, never Quran text. The version-1 root lives in `rabbani-mastery-v1`; the existing `rabbani-v1` is neither read nor migrated by this repository. Zod validates the complete root before writing. Each complete serialized snapshot is staged in a pending key before replacing the main key. localStorage writes are individually atomic; this is not a cross-tab database transaction or a multi-writer conflict resolver. Storage failures are shown in the UI. Corrupt/unsupported snapshots are retained in quarantine instead of being deleted. No auth or cloud sync is enabled.

## Recordings

The recorder owns permission requests, tracks, MediaRecorder handlers, blobs and object URLs. A late permission result after disposal stops its tracks without recording. Backgrounding, pagehide, stage/passage exit and unmount clean up recording resources. Calls are handled when the browser emits its background/page lifecycle event; native call-interruption behavior still needs real-device checks in Phase 6.

Audio is temporary in-memory by default and never uploaded. "Save on device" explicitly stores the blob in the separate IndexedDB database `rabbani-mastery-recordings-v1`. A private local recording list supports playback and per-item delete. Only metadata is stored in the learning root, not the blob. Temporary object URLs are revoked on discard/replacement/save/disposal. Clearing browser storage removes these local recordings. No microphone permission is required to finish a session.

## Honest content gates

Asbab does not substitute tafsir: it displays source-under-review. Understanding directs users to the existing tafsir library. Token-aligned meanings, word masking, AI scoring, cloud sync, new offline packs and advanced scheduling are not activated.

## Verification and remaining gates

Run `npm run quran:check`, `npm run lint`, `npm run test:unit`, `npm test`, `npm run build`, and the full browser suite `npx playwright test` (12 specs × desktop/mobile projects, 62 tests, all passing at review time).

Tests cover transitions/resume, completed-vs-interrupted repetition, connection order, same-day/early/assisted/self-report evidence rules, failed-recall reset, attempt-link rejection, masking escape hatches, storage isolation/quarantine, recorder tracks/URLs/background/late-permission cleanup, and full UI sessions at 360/1280px. `tests/e2e/mastery-audio.spec.ts` drives the real `<audio>` repetition path with controlled responses: per-verse sequencing, exact repeat counts (completed plays only), auto-advance order, visible failure on resolution and playback errors, and no-skip retry that resumes the same verse. It also probes the live Quran.com per-ayah source and reports a skip (not a pass) when the network is unavailable. Unit/mock/browser checks do not replace real-device microphone/call checks. Those remain explicitly unverified.

Phase 2 review requires a walkthrough of the full local session and evidence records before acceptance. No merge and no Phase 3 work are included.
