# Unified Coach: implementation plan

Branch: `feature/unified-coach` (from `main` at 6f9e13c). Concept: "مدرّب واحد لكل أهدافك" (private File, 26 Nov 2026).

## Goal
One local coaching engine that reads a goal, its pace and its log, and proposes load changes. Hifz is one template. Phase 1 applies the engine to Goals (`src/StrongGoals.tsx`, `src/goal-plan.ts`).

## Defaults used for the concept's open decisions
These were unanswered by the user. The recommended default from the concept is used and is easy to change.
1. Activation: manual, per goal. Each goal has a "المدرّب" switch, off by default.
2. A single "Today" page: not in phase 1. The coach stays inside the Goals view. Revisit with phase 2.
3. Standalone one-off tasks: deferred. Course tasks come in phase 2, habits and wirds in phase 3.

## Rules (from the concept and the user's standing rules)
- The coach proposes. It never edits a plan by itself. Each change is accept, keep or change by hand.
- Works only on goals with the coach switched on.
- It measures commitment to steps the user chose. It does not judge intention or worship. No mastery score outside Hifz.
- All computation is local and pure. No server writes, no new notifications beyond what the device already schedules.
- Core goals, steps, reminders and history stay free. No prices and no billing wiring in this work. The paid features sit behind one `coachEntitled()` gate, which returns true for now so the feature can be reviewed. Wiring it to a subscription is a later decision.
- Nothing is sold as worship. Mastery stays Hifz-only.

## Phases
### Phase 1: Goals (this branch)
- P1.1 `src/coach/engine.ts`: pure functions over `Goal`. Adherence per step over recent periods, goal pace against target date, suggestions (lighten, increase, early warning), "start here" ordering, weekly summary.
- P1.2 Data: optional `coach` field on `Goal` (`enabled`, `enabledAt`, `dismissed` suggestion keys). Validate in `src/state-schema.ts`. Old data loads unchanged.
- P1.3 UI: `src/coach/CoachPanel.tsx` inside the expanded goal card. Switch, suggestions with accept / keep, summary line. Arabic, RTL, mobile fit.
- P1.4 Tests: vitest for the engine and schema (back-compat), Playwright e2e for toggle, suggestion accept and keep, persistence across reload.
- P1.5 CI: `npm run lint`, `npm run test:unit`, `npm run build:android` run locally, then CI on the PR.

### Phase 2: course tasks
Same engine on daily, weekly and monthly plan tasks. One ordered list for the day across goals and tasks.

### Phase 3: habits and wirds
New template without an end date. Learns from regularity.

## Acceptance for phase 1
- Coach off: goal screens behave exactly as before.
- Coach on with a poor log: a "lighten" suggestion appears. Accept changes the step period. Keep hides it for that period.
- Coach on with a strong log: an "increase" suggestion appears.
- Early warning appears after repeated misses, before the target date slips.
- Backups and imports of old state still pass.

## Status
- [x] P1.1 engine
- [x] P1.2 data and schema
- [x] P1.3 UI
- [x] P1.4 tests (vitest 12 + playwright 4, mobile-light)
- [ ] P1.5 CI (local lint, unit 393, build:android pass; PR CI pending)
