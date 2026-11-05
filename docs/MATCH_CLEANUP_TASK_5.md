# Match Cleanup Task 5: Build Stale Match and Inactive Lobby Cleanup Service

## Goal

Implement the bounded cleanup scanner service with configurable thresholds, dry-run mode, shared lobby artifact deletion (preventing storage bloat), and race-safe transitions for empty lobbies, stale lobbies, and inactive matches.

## Dependencies

Task 1, Task 2, Task 4.

## Scope

- Extract shared unstarted-lobby deletion helper in `server/modules/src/services/lobbyCleanup.ts` (and reuse it in `server/modules/src/rpc/leaveMatch.ts`):
  - Implement `deleteUnstartedLobbyAndArtifacts(match: MatchRecord, version: string | undefined, storage: StorageService, nkWrapper: NakamaWrapper, logger: nkruntime.Logger): void`:
    - Marks `match.removed = 1`, `match.started = false` and writes with `storage.writeMatch(match, version)` to verify the optimistic concurrency version before deletion.
    - Sends `nkWrapper.matchSignal(getRuntimeMatchId(match), JSON.stringify({ type: "match_removed" }))` (ignoring signal errors if the runtime match is already stopped).
    - Deletes associated turns (`listTurnsForMatch` -> `deleteTurnByKey`), replays (`listReplaysForMatch` -> `deleteReplayByKey`), chat log (`deleteChatLog`), match report (`deleteMatchReport`), and the match record itself (`storage.deleteMatch(match.match_id)`) so expired unstarted lobbies do not accumulate in `MATCH_COLLECTION`.
  - Refactor `server/modules/src/rpc/leaveMatch.ts` (both tutorial leave and empty match leave blocks) to call `deleteUnstartedLobbyAndArtifacts` instead of duplicating the artifact deletion loops.
- Create `server/modules/src/services/matchCleanupService.ts`:
  - Define default constants:
    - `DEFAULT_INACTIVE_MATCH_THRESHOLD_SECONDS = 14 * 24 * 60 * 60` (14 days).
    - `DEFAULT_INACTIVE_LOBBY_THRESHOLD_SECONDS = 14 * 24 * 60 * 60` (14 days).
    - `DEFAULT_EMPTY_LOBBY_THRESHOLD_SECONDS = 24 * 60 * 60` (24 hours).
    - `DEFAULT_MAX_CANDIDATES_PER_RUN = 100`.
  - Define interfaces:

    ```typescript
    export interface MatchCleanupOptions {
      dryRun?: boolean;
      nowSeconds?: number;
      inactiveMatchThresholdSec?: number;
      inactiveLobbyThresholdSec?: number;
      emptyLobbyThresholdSec?: number;
      maxCandidatesPerRun?: number;
    }

    export interface MatchCleanupResult {
      scannedCount: number;
      expiredEmptyLobbies: number;
      expiredStaleLobbies: number;
      expiredActiveMatches: number;
      skippedDueToRace: number;
      dryRun: boolean;
      affectedMatchIds: string[];
    }
    ```

  - Implement `scanAndCleanStaleMatches(nk: nkruntime.Nakama, logger: nkruntime.Logger, options?: MatchCleanupOptions): MatchCleanupResult`:
    - Iterate matches from storage using paginated `storage.listServerMatches(100, cursor)` (stopping early if `affectedMatchIds.length >= maxCandidatesPerRun`).
    - Skip finished matches (`match.removed !== 0 && match.removed !== undefined` when `match.started === true` or a report exists).
    - Evaluate each active candidate (`match.removed === 0 || match.removed === undefined`):
      1. **Empty lobbies**: `match.started !== true`, `(match.players?.length ?? 0) === 0`, and `nowSeconds - getEffectiveLastRosterActivityAt(match) >= emptyLobbyThresholdSec`:
         - Action: delete lobby and artifacts via `deleteUnstartedLobbyAndArtifacts`.
      2. **Stale unstarted lobbies**: `match.started !== true`, `(match.players?.length ?? 0) > 0`, and `nowSeconds - getEffectiveLastRosterActivityAt(match) >= inactiveLobbyThresholdSec`:
         - Action: delete lobby and artifacts via `deleteUnstartedLobbyAndArtifacts`.
      3. **Inactive started matches**: `match.started === true`, and `nowSeconds - getEffectiveLastHumanActionAt(match) >= inactiveMatchThresholdSec`:
         - Action: terminalize as inactivity draw via `terminalizeMatchForInactivity` (from Task 4).
    - Concurrency and race safety:
      - In live mode (`dryRun !== true`), re-read the match record and its latest `version` from storage (`storage.getMatch(match.match_id)`) immediately before executing the transition.
      - Re-verify eligibility against the freshly read record; if `last_human_action_at`, `last_roster_activity_at`, `started`, or `players.length` changed such that the record is no longer stale, increment `skippedDueToRace` and abort the transition for that match.
      - If the storage write fails due to a version conflict, catch and log the conflict, increment `skippedDueToRace`, and continue scanning the remaining batch.
    - Legacy record fallback:
      - Records missing activity timestamps fall back to `started_at` or `created_at` via helpers from Task 1. If both `started_at` and `created_at` are missing/0, log a warning and skip the record rather than deleting it.
    - Dry-run mode:
      - When `options.dryRun === true`, identify and count all candidates without performing any storage writes, signals, or deletions.

- Explicit non-goals:
  - Finished matches with reports (`match.removed === 1`) must never be deleted or altered by this service.
  - Do not wire into background cron/coordinator tick here (deferred to Task 6).

## Acceptance

- Empty unstarted lobbies older than 24 hours and unstarted lobbies with no roster activity for 14 days are cleanly deleted from storage via `deleteUnstartedLobbyAndArtifacts` (reused with `leaveMatch.ts`).
- Started matches with no human gameplay actions for 14 days end as an inactivity draw with a persisted `MatchReport`.
- Ongoing matches with recent human activity remain completely untouched.
- Dry-run mode accurately identifies all stale candidates and returns metrics without modifying storage.
- Concurrent human action or player join racing the cleanup worker increments `skippedDueToRace` and prevents erroneous removal.

## Validation

- Add unit and scenario tests in `server/modules/test/match-cleanup-service.test.ts` verifying:
  - 24-hour empty lobby deletion.
  - 14-day unstarted lobby deletion.
  - 14-day started match inactivity timeout draw.
  - Retention of active matches with recent human actions.
  - Safe fallback for legacy records missing activity timestamps (and quarantine/skip when `created_at` is 0).
  - Dry-run mode accuracy and non-mutation.
  - Storage version check and race-abort behavior (`skippedDueToRace`).
- Run tests:
  ```powershell
  cd server/modules
  npm test
  npm run build
  ```
