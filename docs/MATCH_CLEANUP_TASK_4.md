# Match Cleanup Task 4: Implement Inactivity Timeout Match Terminalization and Report Generation

## Goal

Provide an idempotent server-side terminalization mechanism that ends abandoned active matches as an inactivity draw with a terminal match report, without falsely awarding tutorial completion.

## Dependencies

Task 1.

## Scope

- Create `server/modules/src/match/inactivityTerminalize.ts`:
  - Implement `terminalizeMatchForInactivity(match: MatchRecord, storage: StorageService, nk: nkruntime.Nakama, logger: nkruntime.Logger, nowSeconds?: number): MatchReport`:
    - Validates that the match is eligible for terminalization (`match.started === true` and `(match.removed === 0 || match.removed === undefined)`).
    - Transitions match state: `match.removed = 1`, `match.started = false`.
    - Generates and writes a terminal `MatchReport`:
      - `reason: "inactivity_timeout"`
      - `winning_character_ids: []`
      - `winning_team_id: undefined`
      - Mark all participant teams with `won: false` (draw).
      - Include player and team combat statistics recorded up to the abandonment point.
    - Tutorial match handling:
      - Detect tutorial matches via `match.metadata?.[TUTORIAL_MATCH_METADATA_KEY]`.
      - Terminalize the tutorial match as an inactivity draw.
      - Explicitly ensure that user account metadata is NOT updated with `tutorialCompleted = true`.
    - Solo / single-human match handling:
      - Terminate as an inactivity draw without inferring a competitive win.
    - Idempotency and race safety:
      - Check if `storage.getMatchReport(match.match_id)` already exists; if present, do not duplicate report generation or stats writes.
      - Persist match transition with storage version check.
- Update `server/modules/src/match/matchReport.ts`:
  - Ensure `buildMatchReport` properly formats reports when `reason === "inactivity_timeout"`.
- Explicit non-goals:
  - Do not implement the periodic cleanup scan loop here (deferred to Task 5).
  - Do not modify client views or match card lists in this task (deferred to Task 7).

## Acceptance

- Terminalizing an active match sets `removed = 1`, `started = false`, and saves a report with `reason: "inactivity_timeout"`.
- Report indicates a draw: `winning_character_ids` is empty and no team is marked as `won: true`.
- Abandoned tutorial matches terminate with an inactivity draw report without setting `tutorialCompleted: true` on the player's account.
- Repeated calls to `terminalizeMatchForInactivity` on the same match are idempotent and do not duplicate reports or corrupt statistics.

## Validation

- Add unit tests in `server/modules/test/inactivity-terminalize.test.ts` covering:
  - Active match terminalized as draw with `reason: "inactivity_timeout"`.
  - Stale tutorial match terminalized without granting tutorial completion.
  - Idempotent execution on already-terminalized records.
- Run tests:
  ```powershell
  cd server/modules
  npm test
  npm run build
  ```
