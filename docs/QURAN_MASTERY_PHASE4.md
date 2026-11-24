# Phase 4: plans and smart revision

Authorization: original requirements and the user's 23 November instruction to complete remaining phases sequentially. No merge/release. Local-only and canonical Quran constraints unchanged.

## Working scope

- Free sessions remain available. Organized editable templates: beginner, limited time, regular, full-Quran canonical references and revision-first. Suggested durations remain suggestions. Daily verses, minutes, repetition, compatible reciter, weekdays, timezone and review limit are editable.
- Future chunks are rebuilt on edits; any chunk with session/assessment history is retained unchanged with its IDs and evidence. Pause stops plan assignments/review queue without deleting history. Resume returns the plan. Completed allocation is not mastery.
- Next assignment uses plan weekdays/timezone and shifts to the next allowed day once today's verse target has started. Extra early practice is explicitly optional. Time budget does not predict recitation speed or completion date.
- Existing `mastery-v1` evidence ladder remains unchanged: 0/1/3/7/14/30 local calendar days; weak resets, due unassisted recall advances, early/same-day/assisted/self-report do not grant evidence. Stored schedule timezone, not travel/device timezone, decides evidence day. Existing evidence is never reinterpreted on plan edit.
- Due queue prioritizes weak passages. Missed reviews have bounded catch-up preview with explicit apply/cancel, respecting future occupied dates and plan weekdays. Manual deferral records reason, preserves evidence and cannot move the due date earlier. No automatic catch-up mutation.
- Dashboard deduplicates verse overlap; weak overrides mastered. Started is distinct from self-assessed mastery, with three states, current target, due/overdue, daily completed sessions, surah coverage and chronological history.
- Opt-in local reminder reuses existing reminder category/preferences/quiet hours and delivery engine. It is suppressed when no reviews are due and includes counts, not notes/recordings. Storage failure is visible. No automatic system permission request. Due-aware delivery is foreground-only. Native builder excludes this dynamic reminder rather than scheduling stale daily alerts while closed. Closed-app due-aware delivery is not claimed and remains mobile-readiness work.

## Data and regression

Optional plan fields extend existing schema without migration/deleting data. Legacy `rabbani-v1` remains unchanged, no sync/auth. Plan passages contain canonical references only. `MasteryPlanning` is absent during a focused session to avoid clutter.

## Verification

249 unit tests pass, including multi-surah exact coverage, future-only edits, timezone midnight/DST, 14-item absence with maximum 3 daily, paused exclusion, overlap reconciliation and reminder suppression. Four new browser tests pass desktop/mobile with actual create/edit/pause/resume, session defaults, catch-up preview/consent and screenshots. Existing audio/session/understanding regression cases passed in both projects; combined runner process was killed after its final test output, so the six Phase3/4 mobile cases were rerun as a bounded completed command. Type-check and production build pass (existing large-chunk warning retained).

GUI quality: mobile plan card readable, controls reachable above navigation. Desktop backlog initially cramped the date/label row; flex wrapping was added and the rerender was inspected: labels, dates and buttons are now readable without the narrow column wrap. No physical-device or actual screen-reader pass claimed. Final broad regression and unsigned Android compile will be repeated on the delivered combined branch in Phase 7.
