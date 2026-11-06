# Match Cleanup Task 6: Integrate Scheduled Background Cleanup and Admin Audit RPC

## Goal

Hook the stale match cleanup service into periodic background execution via the Nakama match coordinator and provide an authenticated Admin RPC for on-demand audits and manual dry-run execution.

## Dependencies

Task 5.

## Scope

- Scheduled background execution:
  - In `server/modules/src/matchmaking/coordinator.ts`:
    - Extend `RankedQueueCoordinatorState` with `lastCleanupAtMs?: number`.
    - In `rankedQueueCoordinatorMatchLoop`:
      - Define `CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000` (24 hours).
      - Check if `nowMs - (state.lastCleanupAtMs ?? 0) >= CLEANUP_INTERVAL_MS`.
      - When due, update `state.lastCleanupAtMs = nowMs` and invoke `scanAndCleanStaleMatches(nk, logger, { nowSeconds: Math.floor(nowMs / 1000) })`.
      - Wrap in `try / catch` to log errors and guarantee coordinator matchmaking and Elo settlement ticks are never disrupted.
- Admin cleanup and audit RPC:
  - Create `server/modules/src/rpc/cleanStaleMatches.ts`:
    - Function `cleanStaleMatchesRpc(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string`.
    - Authorization check: require valid user context and verify `isAdminUser(nk, ctx.userId)`. Throw `PERMISSION_DENIED` via `makeNakamaError` for unauthorized users.
    - Parse optional JSON payload for `MatchCleanupOptions`:
      ```typescript
      {
        dryRun?: boolean;
        inactiveMatchThresholdSec?: number;
        inactiveLobbyThresholdSec?: number;
        emptyLobbyThresholdSec?: number;
        maxCandidatesPerRun?: number;
      }
      ```
    - Execute `scanAndCleanStaleMatches(nk, logger, options)` and return `{ ok: true, result }` as JSON.
  - Register RPC:
    - Export `cleanStaleMatchesRpc` from `server/modules/src/rpc/index.ts`.
    - Register `"clean_stale_matches"` RPC in `InitModule` inside `server/modules/src/main.ts`.
- Explicit non-goals:
  - Do not expose `clean_stale_matches` to non-admin players.
  - Do not implement custom UI scenes for cleanup in this task.

## Acceptance

- Background cleanup executes once every 24 hours inside the running coordinator without interrupting matchmaking or rankings.
- Admin users can invoke `clean_stale_matches` with `{"dryRun": true}` to view prospective candidate counts without executing changes.
- Admin users can invoke `clean_stale_matches` with custom thresholds and `maxCandidatesPerRun` to trigger immediate cleanup runs.
- Non-admin callers receive a `PERMISSION_DENIED` error.

## Validation

- Add unit and RPC tests in `server/modules/test/clean-stale-matches-rpc.test.ts` verifying:
  - Admin authorization pass/fail.
  - Coordinator 24-hour interval gating and error isolation.
  - Dry-run payload options handling and response structure.
  - Custom threshold forwarding to `scanAndCleanStaleMatches`.
- Run tests:
  ```powershell
  cd server/modules
  npm test
  npm run build
  ```
