# Matches View Improvement Task 3: Render My Matches Cards

## Goal

Replace My Matches text rows with reusable cards and add the requested collapsible groups and sorting, while leaving navigation wiring to Task 4.

## Dependencies

- Task 1: My Matches summary data.
- Task 2: reusable card and preview components.

## Scope

- Remake `client/src/scenes/MyMatchesList.ts` to render card data instead of one-line text rows and separate action buttons.
- Add collapsible **Partidas online** and **Partidas terminadas** groups with localized headings and online count/max, e.g. `3/10 Partidas online`.
- Sort active matches with `currentUserReady === false` first, then ascending time remaining; place untimed matches after timed ones and use a stable tie-breaker.
- Render Play overlay only for active matches with `currentUserReady === false`; show a waiting state when ready. Never show the overlay for missing readiness or finished matches.
- Keep existing refresh, back, ranked queue status, leave availability inside the opened match, and latest-10 finished list behavior.
- Emit selected match/status from the card callback but do not connect it to lobby/game/report navigation in this task.

## Acceptance

- Online and finished sections collapse independently and display correct counts.
- Cards use the summary's status-specific counts and map preview.
- Readiness-first/time-left ordering is deterministic and does not change when names resolve.
- No standalone View, Report, or Leave buttons remain in the list.
- Card selection callback receives correct match ID and status; navigation remains delegated to Task 4.

## Validation

- Add client tests for group membership/count, collapse behavior, ordering, readiness overlay, and selected-card callback.
- Run `npm run build` and `npm run lint` in `client/`; visually inspect long lists and mobile layout.
