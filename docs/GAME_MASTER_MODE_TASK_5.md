# Game Master Mode Task 5: Client Turn Service and Lobby Controlled Characters Table UI

## Goal

Add client RPC service delegation parameters and build the admin-gated Game Master Mode toggle and Controlled Characters Table in `LobbyView`, allowing Game Masters to configure, rename, and manage character rosters.

## Dependencies

Task 1, Task 2.

## Scope

- Modify `client/src/services/turnService.ts`:
  - Update `updateMainAction`, `updateSecondaryAction`, `upgradeSkill`, `upgradeSkills`, `buyShopItem`, and `updateReadyState` methods to accept optional `target_character_id?: string` and include it in RPC payloads.
- Modify `client/src/scenes/LobbyView.ts`:
  - Gate Game Master Mode toggle: verify user account `isAdmin === true`. If non-admin, hide the Game Master Mode control.
  - Add "Game Master Mode" checkbox toggle for admin users.
  - When Game Master Mode is enabled:
    - Automatically set `autoSkip` to `false`, disable `autoSkipToggle`, and prevent manual re-enabling.
    - Hide or disable `botPlayersStepper` and `playersStepper`.
    - Display the **Controlled Characters Table** in place of the standard player waiting list:
      - Style rows to match `LobbyPlayerCard` aesthetic.
      - Render composite sprite portrait generated via `PlayerSkinRenderer` (without hat).
      - Provide inline character renaming via a text prompt dialog.
      - Display character index badge (e.g. `Character #1`).
      - Include a delete button per row (enabled only when total characters > 2).
      - Add "Add Character" button that invokes `generateRandomSkinWithoutHat()` and appends a new character row.
    - Lock "Start Match" button if fewer than 2 characters are in the roster.
  - Handle `OPCODE_PLAYER_KICKED` signal:
    - If a non-admin client in the lobby receives `OPCODE_PLAYER_KICKED`, display an informative banner/dialog and navigate back to `MainScene`.
- Explicit non-goals:
  - Do not implement in-game switching or in-game character panel views (belongs to Task 6).
  - Do not implement multi-GM collaborative conflict resolution (belongs to Task 7).

## Acceptance

- Non-admin users cannot see or interact with the Game Master Mode checkbox.
- Toggling Game Master Mode immediately switches `autoSkip` to `false` and disables the toggle control.
- Controlled Characters Table allows adding, deleting, and renaming characters with instant visual feedback.
- Newly added characters have random clothing/hair/skin combinations and no hats (`hat: ""`).
- Match cannot be started with fewer than 2 controlled characters.
- Non-admin participants in the lobby are kicked and cleanly redirected to the main menu when GM mode is enabled.

## Validation

- Typecheck and compile client: `cd client; npm run build`
- Run client linter: `cd client; npm run lint`
- Manual lobby test: login as admin, toggle Game Master Mode, add 3 characters, rename one, delete one, verify auto-skip is locked to off.
