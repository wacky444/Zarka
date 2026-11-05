# Match Cleanup Task 5: Build Stale Match and Inactive Lobby Cleanup Service

## Goal

Implement the core cleanup scanner service with configurable thresholds, dry-run mode, and race-safe transitions for empty lobbies, stale lobbies, and inactive matches.

## Dependencies

Task 1, Task 2, Task 4.

## Scope

- Create `server/modules/src/services/matchCleanupService.ts`:
  - Define default threshold constants:
    - `DEFAULT_INACTIVE_MATCH_THRESHOLD_SECONDS = 14 * 24 * 60 * 60` (14 days).
    - `DEFAULT_INACTIVE_LOBBY_THRESHOLD_SECONDS = 14 * 24 * 60 * 60` (14 days).
    - `DEFAULT_EMPTY_LOBBY_THRESHOLD_SECONDS = 24 * 60 * 60` (24 hours).
  - Define interfaces:
    ```typescript
    export interface MatchCleanupOptions {
      dryRun?: boolean;
      nowSeconds?: number;
      inactiveMatchThresholdSec?: number;
      inactiveLobbyThresholdSec?: number;
      emptyLobbyThresholdSec?: number;
    }

    export interface MatchCleanupResult {
      scannedCount: number;
      expiredEmptyLobbies: number;
      expiredStaleLobbies: number;
      expiredActiveMatches: number;
      dryRun: boolean;
      affectedMatchIds: string[];
    }
    ```
  - Implement `scanAndCleanStaleMatches(nk: nkruntime.Nakama, logger: nkruntime.Logger, options?: MatchCleanupOptions): MatchCleanupResult`:
    - Retrieve all matches from storage using `storage.listAllMatches()`.
    - Skip matches already removed (`match.removed !== 0 && match.removed !== undefined`).
    - Evaluate each active candidate:
      1. **Empty lobbies**: `match.started !== true`, `match.players.length === 0`, and elapsed time since `getEffectiveLastRosterActivityAt(match) >= emptyLobbyThresholdSec`:
         - Action: close lobby (`match.removed = 1`).
      2. **Stale unstarted lobbies**: `match.started !== true`, `match.players.length > 0`, and elapsed time since `getEffectiveLastRosterActivityAt(match) >= inactiveLobbyThresholdSec`:
         - Action: close lobby (`match.removed = 1`).
      3. **Inactive started matches**: `match.started === true`, and elapsed time since `getEffectiveLastHumanActionAt(match) >= inactiveMatchThresholdSec`:
         - Action: terminalize as inactivity draw via `terminalizeMatchForInactivity` (from Task 4).
    - Concurrency and race safety:
      - In live mode (`dryRun !== true`), re-read the match record and its version from storage immediately before persisting the change.
      - If `last_human_action_at` or `last_roster_activity_at` has been updated since the scan (e.g., a human submitted an action or joined), abort the transition for that match.
      - If storage write fails due to a version conflict, catch and log the conflict rather than crashing the batch.
    - Legacy record fallback:
      - Records missing activity timestamps fall back to `started_at` or `created_at` via helpers from Task 1. Never delete or crash on missing fields.
    - Dry-run mode:
      - When `options.dryRun === true`, identify and count all candidates without performing any storage writes or state changes.
- Explicit non-goals:
  - Finished matches (`match.removed === 1`) must never be touched or deleted by this service.
  - Do not wire into background cron/coordinator tick here (deferred to Task 6).

## Acceptance

- Empty unstarted lobbies older than 24 hours are removed.
- Unstarted lobbies with no roster activity for 14 days are removed.
- Started matches with no human gameplay actions for 14 days end as an inactivity draw with a report.
- Ongoing matches with recent human activity remain completely untouched.
- Dry-run mode accurately identifies all stale candidates and returns metrics without modifying storage.
- Concurrent human action or player join racing the cleanup worker prevents erroneous removal.

## Validation

- Add unit and scenario tests in `server/modules/test/match-cleanup-service.test.ts` verifying:
  - 24-hour empty lobby cleanup.
  - 14-day unstarted lobby cleanup.
  - 14-day started match inactivity timeout.
  - Retention of active matches with recent human actions.
  - Safe fallback for legacy records missing activity timestamps.
  - Dry-run mode accuracy and non-mutation.
  - Storage version check and race-abort behavior.
- Run tests:
  ```powershell
  cd server/modules
  npm test
  npm run build
  ```
