# Game Master Mode Task 7: Multi-Game Master Real-Time Sync, Replay Handling, and End-to-End Validation

## Goal

Implement real-time match signal synchronization between multiple Game Masters, ensure replay and end-game report compatibility, and perform end-to-end validation of the complete Game Master workflow.

## Dependencies

Task 1, Task 2, Task 3, Task 4, Task 5, Task 6.

## Scope

- Modify `server/modules/src/match/async_turn/signal.ts`:
  - When actions, skills, or ready states are modified by any Game Master in a GM match, broadcast updates via match signals to all users in `match.gameMasterUserIds`.
- Modify `client/src/scenes/GameScene.ts` & `ActionPlanSynchronizer.ts`:
  - Listen for GM synchronization signals to update local action plans, ready state indicators, and character panel tabs when a co-GM makes changes.
- Modify `server/modules/src/rpc/getReplay.ts` and `client/src/scenes/EndGameReportScene.ts`:
  - Ensure `get_replay` delivers unredacted replay snapshots for Game Master matches.
  - In `EndGameReportScene`, tag Game Master matches as sandbox/simulation sessions, bypassing human player Elo calculations and presenting a clean sandbox summary.
- Comprehensive end-to-end verification:
  - Admin match creation, GM checkbox toggle, and non-admin kick.
  - Co-GM join access for other admins.
  - Controlled character table management (random hatless sprites, rename, delete).
  - Match initialization without player avatars and with autoskip locked to false.
  - In-game Status tab portrait character selector modal.
  - Multi-character action planning, skill allocation, and per-character ready state.
  - Turn advancement strictly upon all living controlled characters ready.
  - Final match report and replay inspection.

## Acceptance

- When multiple Game Masters collaborate on the same match, character action and ready state modifications synchronize across all GM clients in real time.
- Game Master matches do not alter human player Elo ratings upon match completion.
- Replays of Game Master matches can be viewed with full omniscient event visibility.
- End-to-end flow from match creation to match conclusion executes smoothly with zero unhandled exceptions or regressions.

## Validation

- Build server modules: `cd server/modules; npm run build`
- Build client: `cd client; npm run build`
- Run client linter: `cd client; npm run lint`
- Full manual smoke test:
  1. Login with admin user, create match, enable Game Master mode, verify auto-skip is off and locked.
  2. Join with second admin, confirm co-GM access.
  3. Configure 3 controlled characters with custom names.
  4. Start match; verify omniscient board view and lack of personal avatar.
  5. Click Status tab portrait to open `PlayerSelector` modal and cycle characters.
  6. Set actions and ready status for all characters, verify turn advances only when all are ready.
