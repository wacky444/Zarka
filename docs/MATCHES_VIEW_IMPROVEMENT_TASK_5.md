# Matches View Improvement Task 5: Render Public Matches Cards

## Goal

Replace public Matches text rows with the shared card presentation, using paginated public summaries and no user-specific readiness assumptions.

## Dependencies

- Task 1: public paginated summary contract.
- Task 2: reusable card and preview components.

## Scope

- Remake `client/src/scenes/MatchesList.ts` to load pages from the public match-card summary service.
- Render the same map preview, two-row layout, `R`/`UR` badge, match name, status-specific counts, `HH:MM` time, and turn number.
- Sort open/joinable matches ahead of running matches, then by authoritative time remaining and stable tie-breaker.
- Do not show a Play overlay or readiness-based red countdown in public results unless a personalized summary explicitly supplies the current user's readiness.
- Keep public result paging/bounds. Do not add a global finished-match feed.
- Emit selected match and joinability through a callback; leave navigation and join wiring to Task 6.

## Acceptance

- Public Matches uses the same reusable card and map preview; old text rows and separate Join buttons are removed.
- Cards never expose or infer other players' readiness.
- Joinability and status come from server summary data; pagination does not duplicate or omit matches.
- Selection callback reports correct match identity and status without performing a join yet.

## Validation

- Add client tests for summary paging, card mapping, sorting, unknown readiness behavior, and selection callback.
- Run `npm run build` and `npm run lint` in `client/`; visually inspect desktop and mobile layouts.
