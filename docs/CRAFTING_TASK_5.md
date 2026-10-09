# Crafting Task 5: Connect Selectors to the Action Plan

## Goal

Connect the standalone selectors to the existing secondary-action planner and persist enough typed data for server execution to reproduce the player's choices.

## Dependencies

- Tasks 1–4.

## Scope

- In `client/src/ui/panel/CharacterPanelActionPlanView.ts`, launch the Crafting selector when `fabricate` is selected and the Combine/Separate selector when `manipulate` is selected.
- Add typed planned-action/submission fields for the chosen Crafting product and the ordered Combine/Separate operations. Use stable catalog IDs and an explicit mode; do not infer recipe choice from display text, list position, or ingredient arrays.
- Update `shared/src/Action.ts`, `shared/src/playerCharacter.ts`, relevant `shared/src/Payloads.ts` types, and `server/modules/src/rpc/updateMainAction.ts` / `updateSecondaryAction.ts` validation and persistence as needed.
- Validate payload shape server-side: Crafting accepts one catalog product; Combine/Separate accepts 1–4 valid operations and no client-supplied recipe ingredients or outputs. Reject or clear stale selection data when action type changes.
- Restore saved choices when the action plan is reopened or refreshed.
- Compute advisory Combine/Separate projections from carried inventory plus items picked up earlier in the turn, applying earlier selected operations in order. Crafting does not affect projected ingredients.
- Keep selection warnings advisory and preserve the action's configured extra-execution count/cost limits.

## Acceptance

- Selecting either action opens its matching selector; choosing an option updates the existing plan and survives a state refresh.
- Client and server use the same typed operation IDs and mode values.
- Combine/Separate projection accounts for pickups and earlier operations, including returned items; Crafting does not consume projected inventory.
- Invalid IDs, operation modes, counts, or action-specific fields are rejected or safely cleared by the server RPC.
- No action executes solely because a selector was opened or changed.

## Validation

- Add client tests for selector-to-plan wiring, save/restore, projection ordering, and switching actions.
- Add RPC tests for valid and malformed payloads, including more than four manipulation operations.
- Run `npm run build` and `npm run lint` in `client/`; run `npm run build` and `npm test` in `server/modules/`.
