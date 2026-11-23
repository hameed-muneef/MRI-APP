# Phase 6: offline and mobile readiness

Independent preparation while Phase5 religious-content gate remains open. No merge/release, auth/cloud or iOS support claim.

## Implemented

- Explicit per-ayah packs for approved session reciters, with partial/error/ready metadata, progress, abort/resume, bytes, current cache presence check and delete. Existing audio cache reused, exact per-ayah API resolution persisted separately. No silent verse skipping or reader substitution.
- Existing Tafsir/translation packs listed with state and delete; existing full-chapter packs distinguished from session verse audio. Deleting packs never touches plans, evidence, notes or recordings. Shared session pack URLs retained while another session pack references them.
- Quran asset precached for production PWA cold offline reload after first connected initialization; Android bundles it as before. Service worker update does not forcibly reload active mastery session/recording. No canonical byte edits.
- Native reminder gap from Phase4 addressed: opt-in existing reminder settings build bounded 30-day one-shot due summaries, passed through existing permissions/category/quiet-hours/channel logic. Stable native IDs and scoped cancellation are reused. Reconciliation after assessment, deferral, plan pause, preferences, cross-tab change and reopen. No always-on server or indefinite horizon claimed. Web reminders require an open app. OS may defer/drop delivery; device testing required.
- No automatic notification permission request. Local-only progress, separate recording storage, no upload/sync. Download consumes network/storage; quota failure remains visible.

## Verification

256 unit tests, TypeScript pass. Added unit coverage for cache reuse/resume, abort/no-skip, error, quota, deletion isolation, native horizon and pause/deferral removal. Four browser tests pass across mobile and desktop: pack download/presence/delete, plus a full daily session with decoded downloaded WAV audio after removing all route fixtures and disabling network. Synthetic sound proves playback/cache mechanics, not real recitation quality. Offline indicator is in normal page flow, not over dashboard text. Existing plan/catch-up interaction tests rerun mobile. Screenshots inspected; desktop action wrapping fixed/re-inspected.

Production PWA actual check: build preview, first online service-worker setup, offline reload, Quran navigation and new session render passed. Canonical Quran text rendered offline. Fixture pack bytes are not religious audio and cannot establish actual audio quality or timing.

## Remaining gates

User physical Android tests: calls/background recorder cleanup, shared audio preemption, lazy JS continuation when backgrounded, downloaded verse playback, notification permission/quiet-hours/cancel after completion while closed, battery restriction/reboot/horizon. Actual screen-reader check. iOS remains future/unverified. Provider edition and rights caveats remain. No sync conflict test is a pass for active sync: cloud/auth are disabled.
