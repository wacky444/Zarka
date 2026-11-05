# Match Cleanup Task 4: Implement Inactivity Timeout Match Terminalization via Unified End-Game Pipeline

## Goal

Provide an idempotent server-side terminalization mechanism that ends abandoned active matches as an inactivity draw with a terminal match report, player draw stats update, and runtime match termination signal, without duplicating `checkEndGame.ts` or falsely awarding tutorial completion.

## Dependencies

Task 1, Task 3.

## Scope

- Update `server/modules/src/match/checkEndGame.ts` (`finalizeMatchWithOutcome`) and `server/modules/src/match/matchReport.ts` (`buildMatchReport`):
  - In `finalizeMatchWithOutcome`:
    - Treat `outcome.reason === "inactivity_timeout"` as a draw (`const isDraw = outcome.reason === "all_dead" || outcome.reason === "inactivity_timeout"`).
    - Ensure `isWinner` is `false` when `outcome.reason === "inactivity_timeout"`.
    - Ensure `completedTutorial` (`isWinner && !!match.metadata?.[TUTORIAL_MATCH_METADATA_KEY]`) evaluates to `false` on `"inactivity_timeout"`, so abandoned tutorial matches never set `tutorialCompleted = true`.
    - For unranked, non-tutorial, non-GM matches, update participant account stats once (`matchesPlayed + 1`, `draws + 1`, `currentWinStreak: 0`).
  - In `buildMatchReport`:
    - When `reason === "inactivity_timeout"`, set `winning_team_id: undefined`, `winning_character_ids: []`, and `team.won = false` for all teams while preserving all combat/progression statistics accumulated up to abandonment.
- Create `server/modules/src/match/inactivityTerminalize.ts`:
  - Implement `terminalizeMatchForInactivity(match: MatchRecord, storage: StorageService, nk: nkruntime.Nakama, logger: nkruntime.Logger, expectedVersion?: string, nowSeconds?: number): MatchReport | null`:
    - Validate that the match is eligible (`match.started === true` and `(match.removed === 0 || match.removed === undefined)`).
    - If `storage.getMatchReport(match.match_id)` already exists, ensure `match.removed = 1` and `match.started = false` are persisted and return the existing report (idempotent guard).
    - Construct `const outcome: EndGameOutcome = { ended: true, reason: "inactivity_timeout", aliveCharacterIds: [] }`.
    - Call `finalizeMatchWithOutcome(match, outcome, nk, logger, [], match.current_turn ?? 0)` so report generation, `match.removed = 1`, `match.started = false`, and account draw stats execute through the single shared pipeline.
    - Persist the updated `match` record via `storage.writeMatch(match, expectedVersion)`.
    - Notify the running Nakama match handler (if active) using `emitMatchEndedSignal(createNakamaWrapper(nk), match, outcome)` and `{ type: "match_removed" }` so any in-memory match loop exits cleanly.
    - Return `storage.getMatchReport(match.match_id)`.
- Explicit non-goals:
  - Do not duplicate `buildMatchReport`, `usersGetId`, or `updateAccountMetadata` loops inside `inactivityTerminalize.ts`.
  - Do not implement the periodic cleanup scan loop here (deferred to Task 5).
  - Do not modify client views or match card lists in this task (deferred to Task 7).

## Acceptance

- Terminalizing an active match delegates to `finalizeMatchWithOutcome`, sets `removed = 1` and `started = false`, persists the match with `expectedVersion`, signals the runtime match loop, and saves a `MatchReport` with `reason: "inactivity_timeout"`.
- Report indicates a draw: `winning_character_ids` is empty, `winning_team_id` is `undefined`, and no team is marked `won: true`.
- Abandoned tutorial matches terminate with an inactivity draw report without setting `tutorialCompleted: true` on the player's account.
- Repeated calls to `terminalizeMatchForInactivity` on the same match are idempotent and do not duplicate reports or double-increment player draw stats.

## Validation

- Add unit tests in `server/modules/test/inactivity-terminalize.test.ts` covering:
  - Active match terminalized as draw with `reason: "inactivity_timeout"` and participant draw stats incremented once.
  - Stale tutorial match terminalized without granting `tutorialCompleted`.
  - Solo / single-human match terminalized as draw without a winner.
  - Idempotent execution on already-terminalized records.
- Run tests:
  ```powershell
  cd server/modules
  npm test
  npm run build
  ```
