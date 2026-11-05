# Match Cleanup Task 8: Add End-to-End Test Suite for Stale Match Cleanup and Ranked Forfeits

## Goal

Validate the complete stale match cleanup lifecycle, ranked 3-AFK forfeit flow, concurrent action races, and backward-compatible fallback handling with comprehensive automated tests.

## Dependencies

Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7.

## Scope

- Add automated integration test suites under `server/modules/test/`:
  - `server/modules/test/match-cleanup-e2e.test.ts`:
    - **14-day lobby timeout**: unstarted lobby with no roster activity for >= 14 days is closed (`removed = 1`) and excluded from match lists.
    - **24-hour empty lobby timeout**: unstarted lobby with 0 players for >= 24 hours is closed (`removed = 1`).
    - **14-day gameplay timeout**: started match with no qualifying human actions for >= 14 days ends as a draw with `reason: "inactivity_timeout"`.
    - **AFK turn exclusion**: auto-advanced/random AFK turns do not refresh the human activity clock, allowing 14-day inactivity expiry to proceed as expected.
    - **Active match retention**: match with continuous human gameplay actions within 14 days is preserved and never expired.
    - **Tutorial match handling**: stale tutorial match terminalizes as draw with `inactivity_timeout` and asserts that `tutorialCompleted` is not set on the user account.
    - **Solo match handling**: single-human unstarted and started matches follow standard timeout rules and end as a draw without declaring an artificial winner.
    - **Legacy record fallback**: records created before new timestamp fields safely fall back to `started_at` or `created_at` without mass deletion or crashes.
    - **Concurrent user action race**: a human turn action or join arriving concurrently with cleanup updates the storage version and prevents erroneous match expiration.
    - **Idempotent scanner runs**: running `scanAndCleanStaleMatches` multiple times consecutively causes no duplicate reports, no duplicate state updates, and no errors.
  - `server/modules/test/ranked-afk-e2e.test.ts`:
    - **3-AFK kick and bot substitution**: in a ranked match, a player reaching 3 consecutive AFK turns is forfeited and converted to bot control.
    - **Multi-human match continuation**: if >= 2 human players remain after forfeit, the match continues running with the bot.
    - **Sole remaining human victory**: if kicking an AFK player leaves exactly 1 human player remaining, the match immediately terminates and awards 1st place to the remaining human.
    - **Immediate Elo settlement**: Elo settlement is enqueued, with Elo increase for the winner and Elo penalty for leavers and forfeited players.
- Explicit non-goals:
  - No new schema, feature, or production code changes in this task; strictly test coverage and verification.

## Acceptance

- All end-to-end test scenarios pass deterministically with `npm test` in `server/modules/`.
- All stale match cases from `MATCH_CLEANUP_PLAN.md` are backed by explicit unit/integration test assertions.
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
  npm run lint
  npm run build
  ```
