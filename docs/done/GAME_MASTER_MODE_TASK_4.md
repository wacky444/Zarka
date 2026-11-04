# Game Master Mode Task 4: Server Delegated Character Actions, Skills, Shop, and Turn Resolution

## Goal

Enable Game Masters to submit action plans, skill upgrades, shop purchases, and ready state toggles on behalf of any controlled character, and advance the turn strictly when all living controlled characters are ready.

## Dependencies

Task 1, Task 2, Task 3.

## Scope

- Modify `server/modules/src/rpc/updateMainAction.ts` and `server/modules/src/rpc/updateSecondaryAction.ts`:
  - When `match.gameMasterMode` is true:
    - Authorize caller against `match.gameMasterUserIds`.
    - Resolve target character by `json.target_character_id` (returning `NOT_FOUND` if invalid).
    - Validate action constraints and persist action plan on `match.playerCharacters[json.target_character_id]`.
- Modify `server/modules/src/rpc/upgradeSkill.ts` and `server/modules/src/rpc/buyShopItem.ts`:
  - When `match.gameMasterMode` is true:
    - Authorize caller against `match.gameMasterUserIds`.
    - Apply skill upgrades and shop item purchases directly to `match.playerCharacters[json.target_character_id]`.
- Modify `server/modules/src/rpc/updateReadyState.ts`:
  - When `match.gameMasterMode` is true:
    - Authorize caller against `match.gameMasterUserIds`.
    - Read `target_character_id = json.target_character_id`.
    - Set `match.readyStates[target_character_id] = requestedReady`.
    - Evaluate `allReady` condition across all characters in `match.playerCharacters`:
      - All non-incapacitated, living controlled characters must have `readyStates[charId] === true`.
      - Incapacitated and eliminated characters are excluded from blocking `allReady`.
    - If `allReady`, invoke `resolveTurnForMatch` and reset readiness for next turn.
    - Always return unredacted match state (`viewAll = true`) in the RPC response.
- Explicit non-goals:
  - Do not build the client-side character selector or action synchronizer integration (belongs to Task 6).
  - Do not alter matchmaking or standard match turn rules.

## Acceptance

- Submitting actions, skills, or shop purchases with a valid `target_character_id` updates that character's state.
- Submissions from unauthorized non-GM accounts are rejected with `PERMISSION_DENIED`.
- Ready state is recorded per controlled character.
- The turn advances automatically once every living controlled character is marked ready.
- Incapacitated characters do not cause turn advancement deadlocks.

## Validation

- Build server modules: `cd server/modules; npm run build`
- Run client typecheck: `cd client; npm run build`
- Execute RPC tests for `update_main_action`, `upgrade_skill`, and `update_ready_state` targeting a specific `target_character_id`.
