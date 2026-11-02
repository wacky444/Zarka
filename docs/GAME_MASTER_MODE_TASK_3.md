# Game Master Mode Task 3: Server Match Start, Controlled Character Spawning, and Omniscient Match View

## Goal

Configure match initialization so controlled characters are spawned onto the board without spawning personal avatars for Game Masters, and enforce omniscient match visibility ("Admin View Everything") for all Game Masters.

## Dependencies

Task 1, Task 2.

## Scope

- Modify `server/modules/src/rpc/startMatch.ts` and `server/modules/src/match/startMatchRecord.ts`:
  - When `match.gameMasterMode` is true:
    - Verify caller is in `match.gameMasterUserIds`.
    - Validate that `match.controlledCharacterRoster` contains at least 2 characters; otherwise throw `FAILED_PRECONDITION` (`insufficient_controlled_characters`).
    - Initialize `match.playerCharacters` using the entities defined in `match.controlledCharacterRoster` (generating full `PlayerCharacter` instances with default stats, inventory, and their configured skin/name).
    - Ensure no `PlayerCharacter` is created or spawned on the board for any GM user in `match.gameMasterUserIds`.
    - Distribute spawn positions and teams among the controlled characters.
    - Persist `match.autoSkip = false`.
- Modify `server/modules/src/rpc/getState.ts`:
  - When `match.gameMasterMode` is true and `viewerId` is in `match.gameMasterUserIds`:
    - Automatically set `viewAll = true` when invoking `tailorMatchForPlayer(match, viewerId, true)`.
    - Return complete map tiles, all traps, placed C4s, ground items, and true team alignments to the Game Master.
- Modify `server/modules/src/match/async_turn/signal.ts`:
  - In turn advancement and state update broadcasts, treat Game Master users as having omniscient visibility (`viewAll = true`).
- Explicit non-goals:
  - Do not implement client-side camera framing or selector UI (belongs to Task 6).
  - Do not handle action submission routing (belongs to Task 4).

## Acceptance

- Starting a Game Master match with fewer than 2 controlled characters is rejected with `FAILED_PRECONDITION`.
- When started, all controlled characters receive valid spawn coordinates and team allocations, while Game Master accounts have no physical avatars on the game board.
- `match.autoSkip` remains `false` after match start.
- `get_state` calls made by Game Masters return unredacted match state without fog-of-war obscuring tiles, traps, or units.

## Validation

- Build server modules: `cd server/modules; npm run build`
- Typecheck client: `cd client; npm run build`
- Verify match start with 2+ controlled characters and check output `playerCharacters` keys against `controlledCharacterRoster`.
