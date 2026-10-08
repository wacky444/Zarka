# Crafting and Combine/Separate Plan

## Goal

Implement two item-creation actions: **Crafting** (`fabricate`) and **Combine/Separate** (`manipulate`). Use these English labels in the UI while retaining existing action IDs. Give each action a product selector similar to the item selector. Always show every applicable recipe; show a warning when ingredients are missing instead of hiding the option.

## Rules and action order

Both actions are secondary actions:

- **Combine/Separate** costs 1 energy, has cooldown 3, and allows one extra operation per extra execution, up to 3 extras. It runs at action order 6, after **Pick Up** (6.1) and **Search** (6.2).
- **Crafting** costs 3 energy, has cooldown 3, and runs at order 14, after **Steal** (order 13). It requires the workshop unless the player has **Dexterity 4**.

Ingredient warnings must use inventory projected at each action's execution point, not only inventory at the beginning of the turn. Items picked up earlier can be available to both actions; known items acquired by stealing can be available to Crafting. Search reveals items but does not put them in inventory; they must also be picked up.

Keep the server's existing action order authoritative. Recheck requirements when each action executes because earlier actions can fail or consume items.

## Current implementation and relevant UI

- `shared/src/ActionLibrary.ts` defines both actions, but neither is marked developed. No server handlers for these action IDs were found; undeveloped entries are disabled in the action selector.
- `shared/src/ItemLibrary.ts` has display-only `recipes` strings but no structured ingredient quantities. Add `shared/src/RecipesLibrary.ts`, modeled after `ItemLibrary`, as the authoritative recipe catalog.
- `client/src/ui/panel/CharacterPanelActionOptions.ts` calls `getMissingRequirement()` and passes its result as `GridSelectItem.missingRequirement`.
- `client/src/ui/ActionRequirementWarnings.ts` computes action-level requirement messages. Its workshop check currently does not account for the Dexterity 4 exception.
- `client/src/ui/GridSelect.ts` renders `missingRequirement` in warning color within each item card. Missing requirements do not disable selection; only `disabled` does. Use this behavior for recipe cards.
- `client/src/ui/ItemPrioritySelector.ts` and `client/src/ui/CellItemGrid.ts` show existing item icon/name patterns. Use `resolveItemTexture()` from `client/src/ui/itemIcons.ts` for item art.

## Recipe catalog

Build both selectors from `shared/src/RecipesLibrary.ts`, not parsed localized strings. Model it after `shared/src/ItemLibrary.ts`; each base recipe has a typed recipe ID, action ID, output `ItemId`, and ingredient entries `{ itemId, quantity }`. Derive localized names, icons, and descriptions from `ItemLibrary`. Export the catalog and types from `shared/src/index.ts`; keep it as the single source of ingredient requirements.

A Separate operation reverses a base recipe: it consumes one output item and returns that recipe's original ingredients. Use the same catalog for both directions so combine and separate costs cannot drift.

### Crafting recipes

Show exactly these four options:

| Recipe ID | Output | Ingredients |
| --- | --- | --- |
| `knife` | Knife | Wood ×1, Spike ×2 |
| `bat` | Bat | Wood ×4 |
| `axe` | Axe | Wood ×3, Spike ×2 |
| `arrow` | Arrow | Wood ×1, Spike ×1 |

All four remain visible at the workshop and when Dexterity 4 is owned. Outside the workshop, show the action-level warning unless Dexterity 4 is present. Do not expose outputs beyond these four in the Crafting selector.

### Combine and Separate options

The Combine selector shows exactly these three combinations:

| Recipe ID | Output | Ingredients |
| --- | --- | --- |
| `silenced_pistol` | Silenced pistol | Pistol ×1, Silencer ×1 |
| `molotov` | Molotov | Bottle ×1, Fuel ×1 |
| `nail_bat` | Nail bat | Bat ×1, Nails ×2 |

The Separate selector lists reverse operations for recipe outputs and returns original ingredients:

| Separate option | Consumes | Returns |
| --- | --- | --- |
| Separate Knife | Knife ×1 | Wood ×1, Spike ×2 |
| Separate Bat | Bat ×1 | Wood ×4 |
| Separate Axe | Axe ×1 | Wood ×3, Spike ×2 |
| Separate Arrow | Arrow ×1 | Wood ×1, Spike ×1 |
| Separate Silenced pistol | Silenced pistol ×1 | Pistol ×1, Silencer ×1 |
| Separate Molotov | Molotov ×1 | Bottle ×1, Fuel ×1 |
| Separate Nail bat | Nail bat ×1 | Bat ×1, Nails ×2 |

In particular, separating a Knife returns Wood ×1 and Spike ×2; separating a Molotov returns Bottle ×1 and Fuel ×1. Keep the poison-on-weapon behavior described in `Zark.md` as a separate Combine/Separate operation, not a recipe entry or craftable output. Its poison consumption and coating duration still need rule confirmation.

## Selector behavior

- Add one recipe selector for Crafting and one for Combine/Separate, shown when the corresponding action is selected. In the latter, let the player choose Combine or Separate. Reuse `GridSelect` card/modal behavior and item textures.
- Always show all four Crafting recipes, all three Combine options, and all seven Separate options. Do not filter options based on current inventory.
- Show output name, icon, and ingredient list on each card. For Separate, show the item consumed and the components returned. Show available projected quantities and a warning for every shortage; example: `Missing Spike ×1`.
- Set `missingRequirement` for ingredient warnings and leave `disabled` false for shortages. This matches the action-list warning pattern and allows a recipe to be selected when an earlier planned pickup or known steal may provide the ingredients.
- For Crafting, also show the workshop/Dexterity 4 warning through the action-level requirement path.
- Localize labels, ingredient names, and warning text in English and Spanish. Keep ingredient counts explicit.
- Persist selected recipe and operation (`combine` or `separate`) per Combine/Separate execution. It supports up to four operations (base plus three extra executions); repeats can select different recipes. Crafting selects one output.

## Projected ingredients and authoritative validation

- Calculate each warning from known carried inventory plus items selected by earlier planned actions that resolve before the recipe. Subtract ingredients allocated to earlier planned recipes.
- For pickup projections, count only visible items actually selected by the player's pickup plan. A search alone is not an inventory gain.
- Include a same-turn steal only when the selected item is known to the acting player. Never inspect or disclose hidden opponent inventory to build warnings.
- Treat projections as advisory. At resolution, the server validates the recipe, checks live inventory and the workshop/Dexterity requirement, consumes all inputs, and grants all outputs atomically. On failure, consume nothing and record a clear failed-action result.
- Validate quantities, duplicate selections, recipe/action compatibility, and maximum Combine/Separate repetitions server-side. Ignore client-supplied warning status.

## Implementation work

1. Add `shared/src/RecipesLibrary.ts`, modeled after `ItemLibrary`, with exactly the seven base recipes above and their action IDs. Define typed recipe IDs, output `ItemId`s, and ingredient `{ itemId, quantity }` entries; export it from `shared/src/index.ts` and test that all referenced items exist. Derive Separate options by reversing the base recipe ingredients; do not duplicate recipe costs.
2. Add client recipe-card builders using `ItemLibrary`, `resolveItemTexture()`, and `GridSelectItem.missingRequirement`.
3. Persist Crafting recipe selection and the recipe plus operation type for each Combine/Separate execution in the action plan/RPC payload. Keep recipe IDs typed and server-validated; do not overload pickup target IDs.
4. Implement server handlers for `manipulate` and `fabricate`, integrate them at their documented action orders, and enable both `ActionDefinition`s only when authoritative handlers are ready. Display their English labels as Combine/Separate and Crafting.
5. Extend `getMissingRequirement()` so Crafting accepts either workshop location or Dexterity 4. Keep this action-level warning separate from per-recipe ingredient warnings.
6. Add English/Spanish translations and replay/log output that names the selected operation, consumed components, and returned/created items.

## Tests and acceptance

### Automated

- Catalog tests: `RecipesLibrary` contains exactly four Crafting recipes and three Combine recipes; every output and ingredient references a valid `ItemId`, and quantities are positive integers.
- Separate tests: all seven reverse options return exactly the original recipe ingredients, including Knife → Wood ×1 + Spike ×2 and Molotov → Bottle ×1 + Fuel ×1.
- Selector tests: all seven base recipes and their Separate options remain visible with missing ingredients; warnings appear and options remain selectable; available recipes show no shortage warning.
- Projection tests: same-turn pickups count for both actions; search-only items do not; known prior steals count for Crafting; earlier operations reserve their ingredients; failed earlier actions do not become guaranteed inventory.
- Requirement tests: Crafting is allowed in Workshop or with Dexterity 4, and warns otherwise.
- Server tests: combine consumes exact ingredients and creates the expected output; separate consumes one output and returns exact original ingredients; shortages, invalid recipe IDs, duplicates, and excess repetitions fail without partial inventory changes.
- Ordering tests: both actions see eligible items picked up earlier in the turn; Crafting can use a known item stolen earlier; later actions do not affect earlier ingredient checks.
- Privacy tests: selectors and warnings do not expose hidden items from other players.

### Manual acceptance

1. Select Crafting and verify only Knife, Bat, Axe, and Arrow appear with ingredients and shortage warnings.
2. Select Combine/Separate, choose Combine, and verify Silenced pistol, Molotov, and Nail bat appear.
3. Choose Separate and verify all seven reverse options appear; specifically verify Knife returns Wood ×1 and Spike ×2, and Molotov returns Bottle ×1 and Fuel ×1.
4. Select an operation while short an ingredient; verify its card remains selectable, then verify server rejects execution without consuming or granting anything if requirements remain unmet.
5. Plan a pickup before either action; verify selected visible components satisfy projected warnings and resolve correctly.
6. Verify Crafting warns outside Workshop unless Dexterity 4 is owned.
7. Verify extra Combine/Separate executions can select different operations and account for ingredients spent or returned by earlier operations.
8. Repeat in English and Spanish and verify result logs match consumed and returned/created items.
