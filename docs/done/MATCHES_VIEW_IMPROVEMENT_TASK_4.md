# Matches View Improvement Task 4: Connect My Matches Card Clicks

## Goal

Connect whole-card clicks in My Matches to the correct existing match flow and remove old row-button navigation.

## Dependencies

- Task 3: card list and selection callback.

## Scope

- Wire My Matches card selection in `MainScene` and `MyMatchesListView`.
- Clicking a waiting/lobby match opens its lobby; clicking a running match opens or resumes it; clicking a finished match opens its report.
- If a finished match lacks a report, open the report view and show a localized unavailable state.
- Keep Leave available inside the lobby or running match; do not retain a separate Leave control on the card.
- Treat the visual Play overlay as part of the same whole-card click target, not as an independent control.

## Acceptance

- Card click opens the correct lobby, running match, or finished report.
- No separate View, Report, Leave, or Play buttons are rendered in My Matches.
- Existing match identity, back navigation, leave flow inside the match, and report permissions continue to work.
- Clicking a card never changes readiness or starts a turn by itself.

## Validation

- Add focused routing tests or scene-level tests for lobby, running, finished-with-report, and finished-without-report cases.
- Run `npm run build` and `npm run lint` in `client/`; manually smoke-test all three click paths.
