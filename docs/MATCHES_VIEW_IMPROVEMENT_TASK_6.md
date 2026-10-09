# Matches View Improvement Task 6: Connect Public Match Card Clicks

## Goal

Connect whole-card clicks in the public Matches view to join/open behavior, with server join rules remaining authoritative.

## Dependencies

- Task 5: public card rendering and selection callback.

## Scope

- Wire selected cards from `MatchesListView` through `MainScene` and `TurnService`.
- Clicking a joinable lobby joins the match and opens its lobby.
- Clicking a running match opens it if the current user is already a member; otherwise attempt join/open only when server policy allows it.
- If joining is rejected because match is full, ranked-locked, capped, or otherwise unavailable, keep the user in the list and show a localized reason.
- Do not add separate Join buttons; whole card is the only list click target.

## Acceptance

- Successful lobby and permitted running-match clicks join/open the correct match.
- Existing members open their match without duplicate membership changes.
- Server rejection does not navigate into an invalid match and produces an understandable localized message.
- No client-only readiness or match-cap check is treated as authoritative.

## Validation

- Add tests for lobby join, permitted running-match entry, existing membership, and rejected join responses.
- Run `npm run build` and `npm run lint` in `client/`; manually smoke-test success and failure paths.
