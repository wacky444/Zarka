# Crafting Task 2: Publish Action Metadata and Labels

## Goal

Make existing action IDs available in the action planner with accurate names, descriptions, and rules, without changing their identity or resolution order.

## Dependencies

None. Can proceed in parallel with Task 1.

## Scope

- Update `shared/src/ActionLibrary.ts` for `fabricate` and `manipulate`; mark both available to the client action planner.
- Update display-name resolution in `client/src/ui/panel/CharacterPanelActionOptions.ts` and translations in `client/src/services/i18n.ts` so English shows exact labels **Crafting** and **Combine/Separate** and Spanish remains localized. Preserve action IDs `fabricate` and `manipulate`.
- Keep metadata aligned with `docs/CRAFTING_PLAN.md`:
  - `fabricate`: secondary, energy 3, cooldown 3, base XP 2, action order 14/sub-order 0, no extra executions, Workshop or Dexterity 4.
  - `manipulate`: secondary, energy 1, cooldown 3, action order 6/sub-order 3, up to 3 extra executions at +1 energy each, no location or skill requirement.
- Describe Crafting as using environmental/workshop resources without consuming inventory ingredients. Describe Combine/Separate as inventory transformations; do not encode its seven recipes in action-level `requiredItems`.
- Preserve correct values already present in the action definitions; avoid duplicate costs or requirements in the UI.

## Acceptance

- Both actions appear as enabled choices in the existing secondary-action planner.
- English UI uses the requested labels; Spanish UI remains localized.
- Action IDs, order, energy, cooldown, XP, and repetition limits match the plan.
- Crafting metadata does not imply inventory ingredients; Combine/Separate metadata does not imply a Workshop requirement.

## Validation

- Add or update focused action-metadata tests for labels/availability and the values above.
- Run `npm run build` and `npm run lint` in `client/`, plus `npm run build` in `server/modules/`.
