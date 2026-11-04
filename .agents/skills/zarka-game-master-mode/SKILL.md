---
name: zarka-game-master-mode
description: Architecture, rules, RPC contracts, and workflows for Zarka's admin-only Game Master Mode across shared, server, and client.
---

# Game Master Mode

## Core Rules

1. **Admin Exclusivity**: Game Master (GM) Mode is restricted strictly to administrators (`isAdminUser()`). Non-admin players cannot create, enable, or join GM matches. If GM mode is enabled in the lobby, all non-admin players are automatically kicked with `OPCODE_PLAYER_KICKED`.
2. **Multi-GM Support**: GM matches remain joinable by other administrators. All joined admins are registered in `match.gameMasterUserIds` and share synchronized orchestration privileges over the match.
3. **No Personal Avatars**: Game Masters do not control personal player avatars on the board. The server spawns units exclusively from the `controlledCharacterRoster` (`gm_char_*`).
4. **Disabled Autoskip**: `autoSkip` is strictly locked to `false`. Rounds never advance on timer expiration. Turns advance only when all alive, non-incapacitated controlled characters are marked ready.
5. **Omniscient Visibility**: Game Masters have persistent omniscient visibility (`view_all = true`). Fog of war is lifted, and all traps, items, and concealments are visible across the entire map.
6. **Character-Scoped RPCs**: All action submissions, skill allocations, shop purchases, and readiness updates use `target_character_id` to route commands to the active controlled character.
7. **Portrait-Driven Switching**: Character selection is primarily driven by clicking the character portrait in the `CharacterPanelStatusView`, which opens the `PlayerSelector` modal grid.

## Key Files

### Shared

- `shared/src/match.ts`: Data definitions on `MatchRecord` (`gameMasterMode`, `gameMasterUserIds`, `controlledCharacterRoster`).
- `shared/src/Payloads.ts`:
  - `OPCODE_PLAYER_KICKED` (106): Match signal notifying kicked participants.
  - `OPCODE_GM_ACTION_SYNC` (107): Match signal synchronizing character actions, skills, and readiness across concurrent GMs.
  - `target_character_id?: string` in `UpdateMainActionPayload`, `UpdateSecondaryActionPayload`, `UpgradeSkillPayload`, `BuyShopItemPayload`, and `UpdateReadyStatePayload`.
  - `GmActionSyncPayload`: Event payload for multi-GM synchronization.
- `shared/src/SkinOptions.ts`: Hatless random skin generation for controlled characters (`BODY_OPTIONS`, `SHOES_OPTIONS`, `SHIRT_OPTIONS`, `HAIR_OPTIONS`, `hat: ""`).

### Server

- `server/modules/src/utils/admin.ts`:
  - `isAdminUser(nk, userId)`: Verifies administrator metadata on the Nakama user account.
  - `isGameMasterUser(match, userId)`: Verifies both GM authorization (`gameMasterUserIds`) and active match membership (`match.players`).
- `server/modules/src/rpc/createMatch.ts`: Validates admin authorization for `gameMasterMode`, initializes `gameMasterUserIds`, and enforces `autoSkip: false`.
- `server/modules/src/rpc/updateSettings.ts`: Toggles `gameMasterMode`, kicks non-admin players from the lobby via `OPCODE_PLAYER_KICKED`, updates `controlledCharacterRoster`, and syncs `gameMasterUserIds`.
- `server/modules/src/rpc/joinMatch.ts`: Validates admin credentials when joining a GM match, adding callers to `match.players` and `match.gameMasterUserIds`.
- `server/modules/src/rpc/leaveMatch.ts`: Revokes caller from `match.players` and `match.gameMasterUserIds`, notifying the realtime match via `sync_players`.
- `server/modules/src/rpc/startMatch.ts`: Spawns units exclusively from `controlledCharacterRoster`, avoids spawning units for GM user IDs, assigns spawns/teams, and preserves `autoSkip: false`.
- `server/modules/src/rpc/updateMainAction.ts`, `updateSecondaryAction.ts`, `upgradeSkill.ts`, `buyShopItem.ts`: Validates `isGameMasterUser` and resolves actor from `match.playerCharacters[target_character_id]`. Dispatches `OPCODE_GM_ACTION_SYNC` to other connected GMs.
- `server/modules/src/rpc/updateReadyState.ts`: Validates `isGameMasterUser`, updates `readyStates[target_character_id]`, evaluates turn advancement across all alive controlled characters, and returns full match view (`view_all = true`).
- `server/modules/src/match/async_turn/signal.ts`: Processes `sync_players` with `gameMasterUserIds` and dispatches `OPCODE_GM_ACTION_SYNC`.
- `server/modules/src/utils/matchView.ts`: `tailorMatchForPlayer(match, viewerId, viewAll)` lifting fog-of-war and concealing filters when `viewAll = true`.

### Client

- `client/src/scenes/LobbyView.ts`:
  - `gameMasterToggle`: Checkbox visible and interactive only for administrators.
  - Locks `autoSkipToggle` to `false`.
  - `ControlledCharactersTable`: UI table for adding (hatless random skin), renaming, and removing controlled characters (minimum 2).
- `client/src/scenes/GameScene.ts`:
  - Detects `match.gameMasterMode` on boot.
  - Manages `activeControlledCharacterId` and updates camera and UI on character switch.
  - Listens for `OPCODE_GM_ACTION_SYNC` to keep action synchronizers and UI aligned across multiple GMs.
  - Supports numeric hotkeys (`1`..`N`) and `Tab` as switching shortcuts.
- `client/src/ui/panel/CharacterPanel.ts`:
  - Central bridge for rebinding panel tabs (Status, Actions, Skills, Shop, Log) to `activeControlledCharacterId`.
- `client/src/ui/panel/CharacterPanelStatusView.ts`:
  - Renders character portrait with clickable interactive affordance to trigger character selection modal.
- `client/src/ui/PlayerSelector.ts`:
  - Modal selector displaying all controlled characters with composite avatar portraits, names, HP/energy bars, and readiness badges.
- `client/src/scenes/ActionPlanSynchronizer.ts`:
  - Maintains separate action planning buffers per controlled character ID and attaches `target_character_id` to outbound RPC requests.
- `client/src/services/turnService.ts`:
  - Client RPC wrappers passing `target_character_id` and registering `setOnGmActionSync` and `setOnPlayerKicked` handlers.

## Technical Invariants

1. **Authorization & Active Membership**:
   - Every GM RPC check must verify `isGameMasterUser(match, userId)`. A user must be listed in `match.gameMasterUserIds` **and** present in `match.players` to execute GM operations.
2. **Controlled Character Identification**:
   - Controlled character IDs use prefix `gm_char_` (e.g. `gm_char_1`, `gm_char_2`). They are stored in `match.playerCharacters` and `match.playerList` exactly like normal characters, but no corresponding Nakama user exists for them.
3. **Turn Advancement Condition**:
   - Turn advancement occurs only when every alive, non-incapacitated controlled character in `match.playerCharacters` has `match.readyStates[charId] === true`. Incapacitated or eliminated characters are excluded from the readiness barrier.
4. **Collaboration Synchronization**:
   - When any GM updates an action, skill, or ready state for a controlled character, the server broadcasts `OPCODE_GM_ACTION_SYNC` containing `{ character_id, action_type, payload }` to all other connected GMs to prevent out-of-sync plans.
5. **Autoskip Prohibition**:
   - `match.autoSkip` must remain `false` across match creation, lobby setting updates, match start, and loop iterations. The match loop will never auto-advance rounds.
6. **Hatless Skin Rule**:
   - Random skins generated for controlled characters in the lobby must have `hat: ""` to maintain consistent visual distinction.

## Implementation Workflow

### Adding or Modifying a GM-Scoped Character Interaction

1. **Shared Contract (`shared/src/Payloads.ts`)**:
   - Ensure the request payload accepts optional `target_character_id?: string`.
   - Ensure `OPCODE_GM_ACTION_SYNC` payload covers any new synchronization properties if applicable.

2. **Server Enforcement (`server/modules/src/rpc/`)**:
   - Validate authorization via `isGameMasterUser(match, ctx.userId)`.
   - If `match.gameMasterMode` is active:
     - Require and validate `target_character_id`.
     - Resolve target character from `match.playerCharacters[target_character_id]`.
     - Emit `OPCODE_GM_ACTION_SYNC` via `dispatcher.broadcastMessage` to other presences if the action mutates planned turn state.
   - If normal match: continue standard resolution using `match.playerCharacters[ctx.userId]`.

3. **Client Action Planning (`client/src/`)**:
   - Update `ActionPlanSynchronizer.ts` to cache the planning state against `activeControlledCharacterId`.
   - Pass `target_character_id: this.activeControlledCharacterId` to the RPC caller in `turnService.ts`.
   - Register remote update in `onGmActionSync` callback to refresh the local UI if another GM changes the target character's plan.

4. **Client UI & Panel Integration**:
   - Ensure `CharacterPanel` and subviews rebind their state when `activeControlledCharacterId` changes (`setActiveControlledCharacterId(id)`).
   - Ensure the Status tab portrait click opens `PlayerSelector` with current controlled characters.
