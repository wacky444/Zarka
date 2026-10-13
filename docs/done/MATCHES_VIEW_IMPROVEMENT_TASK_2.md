# Matches View Improvement Task 2: Build Reusable Card and Hex Preview

## Goal

Create the reusable visual card and mini-map preview used by both match lists, without coupling components to list fetching or navigation.

## Dependencies

- Task 1: typed card summary and preview data.

## Scope

- Add Phaser UI components under `client/src/ui/`, such as `MatchCard.ts` and `MatchMapPreview.ts`.
- Render two card rows: map preview spans both; row 1 shows `R` or `UR` plus match name; row 2 shows status-specific player count. Time-left and turn columns each span both rows.
- Draw cells at axial coordinates. Use green for safe, yellow for scheduled destruction, and red for destroyed; keep cell-type art subtle.
- Display time as `HH:MM`, localized status when no deadline exists, and `—` for finished matches. Show countdown in red only when less than 3 hours remain and `currentUserReady === false` is known for this user.
- Show green Play overlay only for an active My Matches card with `currentUserReady === false`. Hide it when ready, finished, readiness is unknown, or card is public/non-personalized.
- Make entire card one click target with a typed selection callback. Add no separate View, Report, Leave, Join, or Play buttons.

## Acceptance

- Layout matches the two-row table in the plan; image, time-left, and turn cells visually span both rows.
- Card renders lobby joined/capacity, running alive/started-total, and finished total-only counts.
- Overlay/red-countdown rules are strict; unknown readiness never displays the Play overlay or readiness-based red.
- Component does not fetch data or decide where a click navigates.

## Validation

- Add focused tests for row content, status counts, overlay and red countdown conditions, and card click callback.
- Run `npm run build` and `npm run lint` in `client/`; visually inspect desktop and narrow mobile layouts.
