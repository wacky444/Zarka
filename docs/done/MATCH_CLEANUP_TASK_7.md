# Match Cleanup Task 7: Filter Expired Lobbies and Present Inactivity Draw in Match Cards and End-Game Report

## Goal

Exclude expired or soft-removed unstarted lobbies from both Find Matches and My Matches, and clearly present `"Inactivity Draw"` on finished match cards and in `EndGameReportScene` using existing `i18n.ts` conventions.

## Dependencies

Task 1, Task 4, Task 5.

## Scope

- Shared payload contracts (`shared/src/Payloads.ts`):
  - Add optional `terminalReason?: MatchReportReason;` to `MatchCardSummary` (which `MyMatchCardSummary` extends).
- Server match card summaries (`server/modules/src/services/matchCardSummary.ts`):
  - Allow `buildMatchCardSummary(match: MatchRecord, nowMs?: number, terminalReason?: MatchReportReason)` and `buildMyMatchCardSummary(match: MatchRecord, currentUserId: string, nowMs?: number, terminalReason?: MatchReportReason)` to include `...(terminalReason ? { terminalReason } : {})`.
- List filtering in RPCs:
  - `server/modules/src/rpc/listMatchCards.ts`:
    - Ensure removed matches (`match.removed !== 0 && match.removed !== undefined`) remain strictly filtered out.
  - `server/modules/src/rpc/listMyMatches.ts`:
    - When `match.removed !== 0 && match.removed !== undefined`:
      - Look up `const report = storage.getMatchReport(match.match_id)`.
      - If `!report` and `(match.current_turn ?? 0) === 0` (e.g., a legacy soft-removed unstarted lobby via `removeMatchRpc`), `continue` so removed unstarted lobbies never appear in `finishedMatches`.
      - When `report` exists, pass `report.reason` into `buildMyMatchCardSummary(match, ctx.userId, Date.now(), report.reason)` (or set `terminalReason: report.reason` on the entry).
- Client match card and report presentation (using real client components and English-literal `i18n.ts` keys):
  - `client/src/services/i18n.ts`:
    - Add Spanish translation entry to `SPANISH_TRANSLATIONS`:
      - `"Inactivity Draw": "Empate por inactividad"`
  - `client/src/ui/MatchCardModel.ts` and `client/src/ui/MatchCard.ts`:
    - In `getMatchCardPresentation`: when `match.timeStatus === "finished"`, set `timeLeft` to `"Inactivity Draw"` if `match.terminalReason === "inactivity_timeout"`, otherwise `"—"`.
    - In `MatchCard.ts` (`getLocalizedTime`): localize `"Inactivity Draw"` via `t(value)` alongside `"Manual"` and `"Waiting"`.
  - `client/src/scenes/EndGameReportScene.ts`:
    - In `renderReport(report: MatchReport)`: when `report.reason === "inactivity_timeout"`, display `title = t("Inactivity Draw")` instead of generic `t("Match Draw")`.
- Explicit non-goals:
  - Do not delete or alter match reports of completed games.
  - Do not change how active, ongoing games are rendered.

## Acceptance

- Expired or Creator-removed unstarted lobbies (`removed !== 0` with no report and `current_turn === 0`) never appear in the public Find Matches view or the personal My Matches view.
- Finished matches ended by inactivity timeout appear in My Matches under finished games with `terminalReason: "inactivity_timeout"` and display `"Inactivity Draw"` (`"Empate por inactividad"` in Spanish) on the card and in `EndGameReportScene`.
- Client builds and lints with zero TypeScript or ESLint errors.

## Validation

- Server module checks:
  ```powershell
  cd server/modules
  npm test
  npm run build
  ```
- Client checks (`client/test/MatchCardModel.test.ts` and `client/test/MyMatchesListModel.test.ts`):
  ```powershell
  cd client
  npm test
  npm run lint
  npm run build
  ```
