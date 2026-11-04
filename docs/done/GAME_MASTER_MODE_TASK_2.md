# Game Master Mode Task 2: Server Match Creation, Settings, Multi-Admin Join, and Non-Admin Kick RPCs

## Goal

Implement backend authorization and match configuration in `create_match`, `update_settings`, and `join_match` RPCs, allowing administrators to enable Game Master mode, kick non-admins, invite co-GMs, and lock autoskip off.

## Dependencies

Task 1.

## Scope

- Modify `server/modules/src/rpc/createMatch.ts`:
  - Read optional `gameMasterMode` from payload.
  - If requested, verify caller via `isAdminUser(nk, ctx.userId)`; throw `PERMISSION_DENIED` if not an admin.
  - Initialize `record.gameMasterMode = true`, `record.gameMasterUserIds = [ctx.userId]`, and strictly enforce `record.autoSkip = false`.
  - Echo `gameMasterMode` back in the response payload.
- Modify `server/modules/src/rpc/updateSettings.ts`:
  - Read `settings.gameMasterMode` and `settings.controlledCharacterRoster`.
  - If `settings.gameMasterMode` is enabled:
    - Authorize caller with `isAdminUser(nk, ctx.userId)`; throw `PERMISSION_DENIED` if non-admin.
    - Enforce `match.autoSkip = false` and assign `match.gameMasterMode = true`.
    - Persist `match.controlledCharacterRoster`.
    - Initialize or ensure caller is in `match.gameMasterUserIds`.
    - Roster purge: iterate `match.players`. For any player where `!isAdminUser(nk, playerId)`:
      - Remove the user from `match.players`, `match.readyStates`, and unstarted `match.playerCharacters`.
      - Emit a match signal with opcode `OPCODE_PLAYER_KICKED` (`kicked_reason: "gm_mode_enabled"`).
- Modify `server/modules/src/rpc/joinMatch.ts`:
  - When `match.gameMasterMode` is true:
    - Validate `isAdminUser(nk, ctx.userId)`. Reject non-admin join attempts with `PERMISSION_DENIED` ("Game Master matches are restricted to administrators").
    - If admin: append `ctx.userId` to `match.gameMasterUserIds` and `match.players` without spawning a personal unit in `playerCharacters`.
- Explicit non-goals:
  - Do not handle board spawning, teams, or map creation for controlled characters (belongs to Task 3).
  - Do not handle action planning or turn resolution (belongs to Task 4).
  - Do not implement client UI components (belongs to Task 5 and Task 6).

## Acceptance

- Non-admin attempts to create a Game Master match or toggle the mode via `update_settings` fail with `PERMISSION_DENIED`.
- When Game Master mode is toggled on in an unstarted lobby, all non-admin players are removed from `match.players` and receive the `OPCODE_PLAYER_KICKED` signal.
- In Game Master mode, `autoSkip` is strictly set to `false`.
- Authenticated admins can join existing Game Master matches as co-GMs, while non-admins are rejected.

## Validation

- Build server modules: `cd server/modules; npm run build`
- Typecheck and compile client: `cd client; npm run build`
- Server RPC verification: simulate `create_match`, `update_settings`, and `join_match` with admin vs non-admin context.
