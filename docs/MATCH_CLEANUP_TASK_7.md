# Match Cleanup Task 7: Filter Expired Lobbies and Present Inactivity Draw in Match Lists

## Goal

Exclude expired unstarted lobbies from both Find Matches and My Matches, and clearly present the inactivity draw reason on finished match cards and client summaries.

## Dependencies

Task 1, Task 4, Task 5.

## Scope

- Shared payload contracts (`shared/src/Payloads.ts` and `shared/src/match.ts`):
  - Add optional `terminalReason?: MatchReportReason` to `MatchCardSummary` and `MyMatchCardSummary`.
- Server match card summaries (`server/modules/src/services/matchCardSummary.ts`):
  - In `buildMatchCardSummary` and `buildMyMatchCardSummary`, populate `terminalReason` when available from the match record or match report.
- List filtering in RPCs:
  - `server/modules/src/rpc/listMatchCards.ts`:
    - Ensure removed lobbies (`removed !== 0`) remain strictly filtered out.
  - `server/modules/src/rpc/listMyMatches.ts`:
    - Do not return removed unstarted lobbies in `activeMatches` or `finishedMatches` (expired unstarted lobbies should disappear from My Matches).
    - For finished matches with a match report, retrieve `report.reason` and include it as `terminalReason` on the match card.
- Client match card presentation:
  - In client UI components displaying match status (e.g., `client/src/scenes/MatchesScene.ts` or match card component):
    - Check if `card.terminalReason === "inactivity_timeout"`.
    - Display an "Inactivity Draw" status badge or text rather than a generic or ambiguous draw state.
  - Add localization strings in `client/src/services/i18n.ts`:
    - English: `"match_card.inactivity_draw": "Inactivity Draw"`
    - Spanish: `"match_card.inactivity_draw": "Empate por inactividad"`
- Explicit non-goals:
  - Do not delete or alter match reports of completed games.
  - Do not change how active, ongoing games are rendered.

## Acceptance

- Expired lobbies (`started === false && removed !== 0`) never appear in the public All Matches view or the personal My Matches view.
- Finished matches ended by inactivity timeout appear in My Matches under finished games with the badge "Inactivity Draw".
- Switching between English and Spanish localizes the inactivity draw label correctly.
- Client builds with zero TypeScript or ESLint errors.

## Validation

- Server module checks:
  ```powershell
  cd server/modules
  npm test
  npm run build
  ```
- Client checks:
  ```powershell
  cd client
  npm run lint
  npm run build
  ```
