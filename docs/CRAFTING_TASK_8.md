# Crafting Task 8: Format Crafting Replay and Logs

## Goal

Make successful and failed Crafting and Combine/Separate actions understandable in match logs and replay, while preserving replay visibility rules.

## Dependencies

- Task 6: Crafting server events.
- Task 7: Combine/Separate server events.

## Scope

- Add action-specific formatting in `client/src/ui/CharacterPanelLogView.ts` for `fabricate` and `manipulate`.
- Show the action name, selected product or recipe mode, and successful output/returned components; show a clear failure reason when execution fails.
- Consume the replay metadata produced by Tasks 6–7; update shared replay types only when needed for a typed, stable event contract.
- Ensure failed actions and multiple operations in one turn render in resolution order.
- Respect existing replay tailoring/privacy rules. Do not expose another player's private inventory or unobserved item details.

## Acceptance

- Crafting logs identify the product granted and never claim ingredients were consumed.
- Combine/Separate logs identify each operation and its actual result; Separate lists returned components.
- Failure logs do not claim an inventory change.
- Replay and current-turn logs agree with authoritative server outcomes and remain correctly ordered.
- Existing actions and replay visibility behavior remain unchanged.

## Validation

- Add formatter tests for Crafting success/failure, Combine success/failure, Separate success/failure, and multiple operations.
- Run `npm run build` and `npm run lint` in `client/`; run `npm run build` and `npm test` in `server/modules/`.
