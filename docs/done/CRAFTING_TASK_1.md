# Crafting Task 1: Define Shared Recipe Catalogs

## Goal

Create one shared source of truth for Crafting products and Combine/Separate recipes. Client and server must use same item IDs, quantities, and recipe identities.

## Dependencies

None.

## Scope

- Add `shared/src/RecipesLibrary.ts` and export its public types and catalogs from `shared/src/index.ts`.
- Define the 10 Crafting-only products: `pistol`, `bullet`, `molotov`, `bat`, `axe`, `knife`, `harpoon`, `arrow`, `trap`, and `c4`. Crafting catalog entries have no inventory inputs.
- Define exactly seven Combine recipes:
  - `knife`: `wood ×1`, `spike ×2` → `knife`
  - `bat`: `wood ×4` → `bat`
  - `nail_bat`: `bat ×1`, `nails ×2` → `nail_bat`
  - `axe`: `wood ×3`, `spike ×2` → `axe`
  - `molotov`: `bottle ×1`, `fuel ×1` → `molotov`
  - `arrow`: `wood ×1`, `spike ×1` → `arrow`
  - `suppressed_pistol`: `pistol ×1`, `silencer ×1` → `suppressed_pistol`
- Derive the seven Separate recipes from Combine recipes; do not maintain a second independent ingredient table.
- Use `ItemId`-checked types and positive integer quantities. Give each operation a stable ID suitable for client selection and server validation.
- Do not include poison coating or add recipes not listed in `docs/CRAFTING_PLAN.md`.

## Acceptance

- Catalogs contain exactly the specified products and recipes.
- Separate consumes one Combine output and returns exactly its inputs.
- `pistol`, `bullet`, `harpoon`, `trap`, and `c4` are not Combine outputs; `nail_bat` and `suppressed_pistol` are not Crafting products.
- No runtime consumer duplicates recipe definitions.

## Validation

- Add shared catalog tests for exact membership, valid `ItemId`s, positive quantities, and all seven reversals.
- Run `npm run build` in `client/` and `server/modules/` to verify both consumers compile against the shared exports.
