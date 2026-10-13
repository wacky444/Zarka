# Matches View Improvement Task 8: Cross-View Regression and Visual QA

## Goal

Verify My Matches, public Matches, card summaries, navigation, and account match limits work together without privacy, ordering, or responsive-layout regressions.

## Dependencies

- Tasks 1–7.

## Scope

- Add or extend cross-layer tests for summary payloads, preview cell states, player counts, readiness isolation, pagination, and click routing.
- Verify Play overlay appears only on active My Matches cards where `currentUserReady === false`; it must not appear when ready, finished, unknown, or on unpersonalized public cards.
- Verify countdown format `HH:MM` and red styling only when less than 3 hours remain and current user is not ready.
- Manually test collapsible online/finished groups, status-specific player counts, map preview colors, lobby/running/report click paths, and max-current-matches enforcement.
- Check English and Spanish localization, keyboard/touch interaction, and desktop/mobile card layout.

## Acceptance

- Client/server test suites pass with no per-card state-request fanout or private readiness leakage.
- Card layout matches the two-row plan: image, time left, and turn span rows; row 1 has `R`/`UR` + name; row 2 has status-specific player count.
- My Matches play marker and red countdown follow readiness exactly; public results do not leak it.
- Existing list refresh, ranked queue status, reports, and leave-inside-match flows continue to work.

## Validation

- Run `npm run build` and `npm run lint` in `client/`.
- Run `npm run build` and `npm test` in `server/modules/`.
- Record desktop and real-device visual checks; do not claim device verification unless performed on device.
