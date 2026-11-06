# Match Cleanup Task 8: Add End-to-End Test Suite for Stale Match Cleanup and Ranked Forfeits

## Goal

Validate the complete stale match cleanup lifecycle, unstarted lobby artifact deletion, ranked 3-AFK forfeit and bot-control flow (including when bot characters are still alive), concurrent action races, and backward-compatible fallback handling with comprehensive automated tests.

## Dependencies

Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7.

## Scope

- Add automated integration test suites under `server/modules/test/`:
  - `server/modules/test/match-cleanup-e2e.test.ts`:
    - **14-day lobby timeout**: unstarted lobby with no roster activity for `>= 14 days` is deleted from storage along with its artifacts (`deleteUnstartedLobbyAndArtifacts`) and excluded from `listMatchCards` and `listMyMatches`.
    - **24-hour empty lobby timeout**: unstarted lobby with 0 players for `>= 24 hours` is deleted from storage.
    - **Legacy soft-removed lobby exclusion**: unstarted lobby with `removed = 1`, `current_turn = 0`, and no report is excluded from `listMyMatches`.
    - **14-day gameplay timeout**: started match with no qualifying human actions for `>= 14 days` ends via `finalizeMatchWithOutcome` as a draw with `reason: "inactivity_timeout"`, increments participant `draws` stats once, and exposes `terminalReason: "inactivity_timeout"` in `listMyMatches`.
    - **AFK turn exclusion**: auto-advanced/random AFK turns (`resolveTurnForMatch(..., { isAutoAdvance: true })`) do not refresh `last_human_action_at`, allowing 14-day inactivity expiry to proceed.
    - **Active match retention**: match with human gameplay actions within 14 days is preserved and never expired.
    - **Tutorial match handling**: stale tutorial match terminalizes as draw with `inactivity_timeout` and asserts that `tutorialCompleted` is not set on the user account.
    - **Solo match handling**: single-human started match follows standard timeout rules and ends as an inactivity draw without declaring an artificial winner.
    - **Legacy record fallback**: records created before new timestamp fields safely fall back to `started_at` or `created_at` without mass deletion or crashes.
    - **Concurrent user action race**: a human turn action or join arriving concurrently with cleanup updates the activity timestamp / storage version, increments `skippedDueToRace`, and prevents erroneous match expiration.
    - **Idempotent scanner runs**: running `scanAndCleanStaleMatches` multiple times consecutively causes no duplicate reports, no duplicate stats increments, and no errors.
  - `server/modules/test/ranked-afk-e2e.test.ts`:
    - **3-AFK forfeit and bot substitution**: in a ranked match, a player reaching 3 consecutive AFK turns has `forfeited_players[playerId] = true` set, remains in `match.players` and `ranked.eloSnapshots`, and has subsequent turns planned by `botAI` (`isBotControlled`).
    - **Multi-human match continuation**: if `>= 2` active human players remain alive after a forfeit, the match continues running with the bot controller.
    - **Sole remaining human victory with living bots**: if a forfeit leaves exactly 1 active human player remaining while substituted bot characters still have `health > 0`, the match immediately terminates via `finalizeMatchWithOutcome`, assigns complete ranked placements for all teams (`place: 1` for the sole human's team), sets `winning_team_id` on the `MatchReport`, and enqueues Elo settlement.
    - **Immediate Elo settlement**: Elo settlement is enqueued and applied, yielding an Elo increase for the sole human winner and an Elo penalty for the forfeited leaver.
- Explicit non-goals:
  - No new schema, feature, or production code changes in this task; strictly test coverage and verification.

## Acceptance

- All end-to-end test scenarios pass deterministically with `npm test` in `server/modules/` and `client/`.
- All stale match cases and architectural invariants from `MATCH_CLEANUP_PLAN.md` are backed by explicit unit/integration test assertions.
- Concurrency, idempotency, and fallback behavior are thoroughly verified.

## Validation

- Run full server test suite:
  ```powershell
  cd server/modules
  npm test
  ```
- Build server and client:
  ```powershell
  cd server/modules
  npm run build
  cd ../../client
  npm test
  npm run lint
  npm run build
  ```
