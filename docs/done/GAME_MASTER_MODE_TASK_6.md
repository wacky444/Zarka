# Game Master Mode Task 6: Client Status Tab Character Selector Modal and Panel Rebinding

## Goal

Make the character sprite portrait in `CharacterPanelStatusView` interactive in Game Master mode, opening a `PlayerSelector` modal to switch the active controlled character, and dynamically rebind stats, actions, skills, shop, and readiness.

## Dependencies

Task 1, Task 3, Task 4, Task 5.

## Scope

- Modify `client/src/ui/panel/CharacterPanelStatusView.ts`:
  - When Game Master mode is active:
    - Make the composite sprite portrait interactive with a pointer cursor and hover cue.
    - Clicking the portrait opens a modal instance of `PlayerSelector` populated with all controlled characters (showing character portrait, name, HP bar, and ready status).
    - On character selection, close the modal and fire `onSelectControlledCharacter(characterId)`.
- Modify `client/src/ui/panel/CharacterPanel.ts`:
  - Track `activeControlledCharacterId`.
  - Implement `setActiveControlledCharacter(characterId: string)`:
    - Update `CharacterPanelStatusView` with selected character's portrait, name, HP, and energy.
    - Rebind `CharacterPanelActionPlanView`, `CharacterPanelSkillsView`, and `CharacterPanelShopView` to the active character.
    - Bind panel ready toggle to `match.readyStates[activeControlledCharacterId]`.
- Modify `client/src/scenes/ActionPlanSynchronizer.ts`:
  - Pass `target_character_id = activeControlledCharacterId` with all action submissions.
  - Race condition mitigation: immediately flush any debounced or queued action submissions before changing `activeControlledCharacterId`.
  - Maintain action buffers per character ID so unsaved inputs are preserved when cycling characters.
- Modify `client/src/scenes/GameScene.ts`:
  - In Game Master mode, set `adminViewEnabled = true` to display the full omniscient board (no fog of war, all traps/items/C4s visible).
  - Do not attempt to bind the camera or player cursor to a non-existent GM avatar.
  - Wire ready toggle to submit `updateReadyState` with `target_character_id`.
  - Add optional keyboard shortcuts (`1`..`N`, `Tab`) to cycle through controllable characters.
- Explicit non-goals:
  - Do not modify lobby controls (belongs to Task 5).
  - Do not handle match end report formatting (belongs to Task 7).

## Acceptance

- In Game Master mode, clicking the character portrait in the Status tab opens the character selector modal.
- Selecting a character updates the panel's Status, Actions, Skills, and Shop tabs to reflect that specific character.
- The ready button accurately reflects and updates the ready state of the currently selected character.
- Rapidly switching characters does not cause action plan bleed or overwrite actions of the previous character.
- Full map visibility (all tiles, traps, items, and character true teams) is active on the game board.

## Validation

- Compile client: `cd client; npm run build`
- Lint client: `cd client; npm run lint`
- In-game verification: launch a Game Master match, click the Status tab portrait, switch between characters, allocate skills for each, set actions, and toggle ready for each character.
