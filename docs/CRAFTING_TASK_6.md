# Crafting Task 6: Implement Authoritative Crafting Resolution

## Goal

Implement `fabricate` on the server so each selected product is granted only after authoritative execution checks pass.

## Dependencies

- Task 1: shared Crafting catalog.
- Task 2: action metadata.
- Task 5: validated product selection in the action plan.

## Scope

- Add `executeFabricate` under `server/modules/src/match/actions/` and dispatch it from `server/modules/src/match/actionExecutor.ts`.
- At action execution time, recheck the character's current tile and abilities: allow a Workshop tile or `dexterity4`; do not rely on the client warning.
- Validate selected product against `CRAFTABLE_ITEMS`; reject missing or invalid selection.
- Grant one selected item without deducting inventory ingredients. Enforce inventory weight capacity before granting; failed grant must not partially mutate inventory.
- Preserve configured energy cost 3, cooldown 3, no extra executions, action order 14/sub-order 0, and award +2 XP on successful Crafting.
- Emit a success or failed-action replay event using existing conventions. Do not charge cost or apply cooldown twice if shared turn-resolution code already handles them.

## Acceptance

- Crafting succeeds at a Workshop without Dexterity 4 and anywhere with Dexterity 4.
- Crafting fails outside a Workshop without Dexterity 4, with invalid product IDs, or when the item cannot fit.
- Successful execution grants exactly one selected item, consumes no carried ingredients, and awards exactly +2 XP.
- Failed execution does not grant or consume items; location/skill is rechecked after earlier ordered actions have resolved.

## Validation

- Add server regression tests for both valid requirement paths, invalid location/skill, invalid product, inventory capacity, no ingredient consumption, XP, cooldown/energy integration, and replay result.
- Run `npm run build` and `npm test` in `server/modules/`.
