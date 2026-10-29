# Crafting Task 7: Implement Authoritative Combine/Separate Resolution

## Goal

Implement server-side Combine and Separate operations using shared recipes and the persisted ordered selections.

## Dependencies

- Task 1: shared recipes.
- Task 2: action metadata.
- Task 5: validated operation selections and execution counts.

## Scope

- Add `executeManipulate` under `server/modules/src/match/actions/` and dispatch it from `server/modules/src/match/actionExecutor.ts`.
- Resolve at action order 6/sub-order 3, after Pick Up and Search. Require no location or skill.
- Validate every mode and recipe ID against shared catalogs; derive all inputs and outputs on the server. Never accept ingredient quantities or output IDs from the client.
- Execute the base operation and up to three selected extras in order, charging the configured +1 energy per extra and respecting the action cooldown.
- For each operation, verify all required inventory quantities before changing inventory; consume inputs and grant outputs atomically. Later selected operations may use items produced or returned by earlier successful operations.
- Resolve operations sequentially. On the first operation failure, leave that operation's inventory unchanged, emit a failed-action event, and stop remaining operations; preserve earlier operations that already completed. Never partially consume inputs for a failing operation.
- Record recipe/mode/result data needed by replay without exposing hidden inventory details to other players.

## Acceptance

- All seven Combine and seven Separate recipes use catalog quantities exactly.
- Missing inputs, malformed selections, and unsupported recipe IDs cause no partial mutation for the failing operation.
- Up to four distinct operations resolve in selected order; created/returned items are available to later operations until an operation fails.
- Cost, extra-execution cap, cooldown, and action ordering match the plan; no Workshop or Dexterity check is applied.
- Client-provided shortage warnings do not influence server acceptance.

## Validation

- Add server tests for exact input/output quantities, missing-item failure without mutation, all seven reversals, chained operations, operation order, malformed choices, costs, cooldown, and replay events.
- Run `npm run build` and `npm test` in `server/modules/`.
