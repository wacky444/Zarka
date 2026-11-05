# Match Cleanup Task 1: Define Inactivity Timestamps, AFK Counters, and Terminal Reason Contracts

## Goal

Define shared and server-side domain models for tracking durable human activity timestamps, lobby roster activity, per-player consecutive AFK turn counters, and the `inactivity_timeout` terminal match reason.

## Dependencies

None.

## Scope

- Modify `shared/src/match.ts`:
  - Add optional `last_human_action_at?: number;` (epoch seconds) to `MatchRecord`.
  - Add optional `last_roster_activity_at?: number;` (epoch seconds) to `MatchRecord`.
  - Add optional `consecutive_afk_turns?: Record<string, number>;` to `MatchRecord`.
- Modify `shared/src/matchReport.ts`:
  - Extend `MatchReportReason` union type to include `"inactivity_timeout"`:
    ```typescript
    export type MatchReportReason = "last_alive" | "all_dead" | "inactivity_timeout";
    ```
- Modify `server/modules/src/match/checkEndGame.ts`:
  - Update `EndGameOutcome` union to allow `reason: "last_alive" | "all_dead" | "inactivity_timeout"`.
- Create helper utilities in `server/modules/src/utils/activityClock.ts`:
  - `getEffectiveLastHumanActionAt(match: MatchRecord): number`: returns `match.last_human_action_at ?? match.started_at ?? match.created_at ?? 0`.
  - `getEffectiveLastRosterActivityAt(match: MatchRecord): number`: returns `match.last_roster_activity_at ?? match.created_at ?? 0`.
  - `getConsecutiveAfkTurns(match: MatchRecord, playerId: string): number`: returns `match.consecutive_afk_turns?.[playerId] ?? 0`.
- Update `shared/src/index.ts` to export any updated or new shared symbols.
- Explicit non-goals:
  - Do not update mutation RPCs to record activity yet (deferred to Task 2).
  - Do not implement the ranked 3-AFK kick logic yet (deferred to Task 3).
  - Do not write the cleanup scanner or worker yet (deferred to Task 5).

## Acceptance

- All new fields on `MatchRecord` are optional, ensuring existing persisted records remain valid without migration scripts.
- Legacy records with absent activity timestamps safely resolve fallbacks using `getEffectiveLastHumanActionAt` and `getEffectiveLastRosterActivityAt`.
- `MatchReportReason` permits `"inactivity_timeout"` without TypeScript compiler errors in shared, server, or client packages.
- All existing tests in `server/modules/test/` continue to pass.

## Validation

- Build server modules:
  ```powershell
  cd server/modules
  npm run build
  ```
- Build client:
  ```powershell
  cd client
  npm run build
  ```
- Run server unit tests:
  ```powershell
  cd server/modules
  npm test
  ```
