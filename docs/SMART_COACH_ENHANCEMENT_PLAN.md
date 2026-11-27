# Smart Coach enhancement: stage 5 plan

Branch: feature/smart-coach-enhancement, from main 59bde38. Baseline tag: baseline/smart-coach-before-enhancement-20261127. Plan only. No app code written, no commits made.

## 0. Is anything conversational in the coach today?

No. I searched src/coach for chat, questions, free-text inputs, speech, network calls and any AI service. Nothing matched. The coach UI is made of buttons, switches, tabs and static text. All numbers come from fixed rules in src/coach/smart.ts, engine.ts, habit.ts and course.ts. It has no network calls, and the app is built with LOCAL_ONLY = true (src/config.ts), so cloud sync is off in this build.

One item for him to judge: the 3-step "what is the smart coach" panel I added (CoachHowTo, in CoachToday.tsx) is static explanatory text with previous/next/close. It asks nothing and answers nothing. I think it is acceptable. If he reads it as onboarding, I will remove it.

## 1. Gaps between today's coach and the requirements

| Requirement | Today | Gap |
|---|---|---|
| Realistic task durations from history | The coach assumes a fixed 30 minutes when it blocks time. Task items only store done/not done. Goal steps store done per date. The achievement log has a timestamp only for three kinds (Quran plan step, adhkar category, wird complete). Day records store planned start, end and duration, not actual. | No measured durations exist. Needs a new coach-owned history of completion times. |
| Repeated postponement | A schedule keeps initial and confirmed date/time, but only the latest values. Earlier moves are lost. | Needs a detector: a snapshot of each schedule, and a diff on every state change. |
| Overload warnings | One rule: more than capacity + 2 daily open steps shows "heavy daily load". Capacity is the median of daily completions (default 4). | Compares step counts only. Should compare estimated minutes with free minutes and with usual daily capacity, and show a fixed message. |
| Quran revision alerts | analyzeQuranCoach already counts due, overdue and weak passages and puts reviews first. It shows one message card. | Works. Needs a clear alert with counts, a dismiss for today, and a link to the review task. |
| Goal progress slowdown | Early warning (missed run), lighten/increase suggestions, deadline risk (target within 14 days and average under 50%). | No pace metric (done vs time elapsed) and no trend (last 7 days vs the 7 before). |
| Static rule-based messages | Arabic strings are written inline inside smart.ts and CoachToday.tsx. | Move to one message catalog with ids. Add the "not enough history to personalize this yet" message wherever a recommendation lacks data. |
| Accept / dismiss / schedule / adjust | Accept and dismiss exist for weekly recommendations. "جدولة في يومي" exists. Capacity override (preferredCapacity 2 to 12) exists in the data but has no screen. Today's plan items cannot be dismissed. | Add a capacity stepper, and dismiss for plan items and alerts. |
| Never change existing schedules without approval | Found a real gap. "جدولة في يومي" shows whenever the item is not scheduled for today, and writes over any existing schedule for that item (for example one set for tomorrow). | Fix first. Offer the button only when the item has no schedule, or ask for explicit confirmation. |

Things that already satisfy the rules: suggestions are applied only on accept (applyStepPeriod runs only after the user presses accept). Recovery mode only shortens the displayed list and does not change data.

## 2. Module layout (follows the current flat src/coach folder)

New files. Each is a pure function module with no React, no network, and `now` passed in (no Date.now or Math.random inside):

- `src/coach/messages.ts`: static message catalog (id, Arabic text, severity).
- `src/coach/history.ts`: types and helpers for the new `coachHistory` (record, trim to a cap, merge, dedupe by id).
- `src/coach/duration.ts`: duration estimate per item kind and per item: median of recent clipped samples. Fewer than 3 samples means "estimated default" and the "not enough history" message.
- `src/coach/postpone.ts`: schedule snapshot diff; counts reschedules per item over the last 14 days; flags 3 or more.
- `src/coach/workload.ts`: planned estimated minutes vs free minutes vs usual capacity; returns an overload level and the message id.
- `src/coach/pace.ts`: goal pace (elapsed share of the goal period vs completed share) and the 7-day vs previous-7-day trend.

Changed files: smart.ts stays the orchestrator and calls the new modules. Quran alert logic stays in smart.ts (small change). UI: CoachToday.tsx gets cards, plus two small components, `CoachAlerts.tsx` and `CoachCapacity.tsx`. Wiring: App.tsx records completions and runs the schedule-diff effect. TodayTasksView.tsx gets the schedule fix.

## 3. Data and local storage (backward compatible)

- Add one optional top-level key to State: `coachHistory`, version 1: `{v, events[], scheduleSnapshot{}}`. Events are completion times and reschedules with id, kind, ref, date and ISO time. Capped (for example 2,000 events, oldest dropped).
- Add optional `dismissedAlerts` (capped list) to `coachSettings`. `preferredCapacity` already exists.
- The stored-state schema (src/state-schema.ts) must list every new key. Its objects are not strict, so Zod drops unknown keys on load. A new key that is not added there would be lost silently on the next load.
- All new fields are optional. Missing means empty. No existing field is changed or migrated. No renames.
- Add the new keys to the local backup export/import test pattern (local-backup.test.ts already round-trips coach fields).
- Downgrade caveat: an older app build would drop `coachHistory` when it loads. Acceptable. The rollback section of the PR will say so.
- The coach only reads history. Learned values never overwrite goals, targets, recurrence or schedules.

## 4. Test plan

- Unit tests for each new module with fixed fixtures: empty, sparse (under 3 samples), typical, and extreme data (midnight, year boundary, bad times).
- Determinism test: same input gives the same output twice.
- Guard tests: no fetch, XMLHttpRequest, WebSocket or AI-library import in src/coach. No text input or textarea in coach UI files. All coach messages come from the catalog.
- Storage tests: an old export without `coachHistory` loads; new data round-trips through export/import; cap and merge behavior; unknown keys preserved.
- "No silent change" tests: scheduling never overwrites an existing schedule; accept is the only path that edits a goal or wird.
- Playwright e2e for the coach screen flow (activate, plan with durations, capacity change, dismiss, schedule, weekly report), run in headless Chrome. It will not replace a phone test.
- Regression: the full existing vitest and node suites unchanged (never weakened).

## 5. Quality gates (every commit and before the PR)

1. `tsc --noEmit` clean. 2. `vitest run` all pass. 3. Node suite 179 or more, 0 fail. 4. `npm run build` OK. 5. Offline check: the Playwright run with the network blocked. 6. Data-preservation check with an old backup fixture. 7. `npm audit` summary, reported as-is (not yet run, no dependency changes planned). 8. Android: CI Android Build and Emulator Smoke green on the branch. On-device checks only he can do, listed in the PR. 9. PR to main opened and not merged. Release tags only after his approval.

## 6. Commit steps (Conventional Commits, each small and green)

1. `docs(coach): add smart coach enhancement plan`
2. `fix(coach): do not overwrite an existing schedule when scheduling a suggestion` (needs his approval of the behavior: offer only when unscheduled)
3. `test(coach): add guard tests (no network, no free-text input, determinism) and shared fixtures`
4. `refactor(coach): move static messages into a catalog (no behavior change)`
5. `feat(coach): add coachHistory state, schema and backup round-trip`
6. `feat(coach): record completion events`
7. `feat(coach): estimate task durations from history`
8. `feat(coach): detect repeated postponements`
9. `feat(coach): workload overload warning from estimated minutes`
10. `feat(coach): goal pace and slowdown detection`
11. `feat(coach): Quran revision alert card with dismiss`
12. `feat(coach): show duration, capacity bar, capacity adjust and dismiss in the coach UI`
13. `test(coach): e2e flow and offline check`
14. `docs(coach): PR description, storage notes, rollback`

## 7. Decisions needed from him

1. Fix the schedule overwrite first (commit 2), with "offer only when unscheduled"? Recommended yes.
2. Durations: the app records no actual duration today. Estimates will use time between a scheduled start and the recorded completion, clipped to sane limits, with defaults per item kind until there are at least 3 samples. Accuracy will be rough and will be labeled "estimated". OK?
3. Keep the static how-to panel, or remove it?
4. A branch named feature/unified-coach already exists on the remote and may overlap. I have not looked at it. Should I compare it before stage 6?

## 8. Status (2026-11-27)

Approved by the owner: phase 1 only, which is commits 2, 4 and 9 above (schedule overwrite fix, message catalog with a guard test, minutes-based workload alert). Commits 5 to 8 and 10 to 12 (history, duration, postponement, goal pace) wait until the owner has tried the coach on a phone. The how-to panel stays as is. Branch feature/unified-coach is already fully merged into main (0 commits ahead), so there is nothing to reconcile.
