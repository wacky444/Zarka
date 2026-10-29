# Crafting and Combine/Separate Plan

## Goal

Implement two item-creation actions: **Crafting** (`fabricate`) and **Combine/Separate** (`manipulate`). Use these English labels in the UI while retaining existing action IDs. 

Clarify the fundamental mechanical distinction between both actions:
- **Crafting (`fabricate`)**: Represents utilizing tools and scrap available in the environment/workshop. It **does not consume inventory items / primary ingredients**. It can only be executed at the **Workshop** tile or with the **Dexterity 4** skill ("MacGyver").
- **Combine/Separate (`manipulate`)**: Represents field assembly and disassembly. It can be performed anywhere on the map, but **requires and consumes specific inventory items** matching the creation recipes from the item catalog.

## Rules and action order

Both actions are secondary actions:

- **Combine/Separate (`manipulate`)**:
  - Cost: 1 energy, Cooldown: 3.
  - Extra executions: +1 energy per extra execution (up to 3 extras, allowing up to 4 operations total).
  - Action order: 6 (sub-order 3), executing after **Pick Up** (6.1) and **Search** (6.2).
  - Location/Skill requirement: None (can be executed anywhere).
  - Ingredients: Consumes specific inventory items.

- **Crafting (`fabricate`)**:
  - Cost: 3 energy, Cooldown: 3, Base Experience reward: +2 XP.
  - Extra executions: None (single craft per execution).
  - Action order: 14 (sub-order 0), executing after **Steal** (order 13).
  - Location/Skill requirement: Requires being at the **Workshop** tile unless the player has the **Dexterity 4** skill.
  - Ingredients: **None consumed from inventory**. Synthesizes items directly from the workshop/environment.

Keep the server's existing action order authoritative. Recheck requirements when each action executes.

## Catalogs and recipe definitions

Build both selectors from [RecipesLibrary.ts](file:///e:/Dev/ZarkaGit/shared/src/RecipesLibrary.ts) and export from [index.ts](file:///e:/Dev/ZarkaGit/shared/src/index.ts).

### 1. Crafting catalog (`fabricate`)

Crafting allows producing exactly these 10 items without consuming player inventory items:

| Item ID | Item Name | Inventory Ingredients | Location / Skill Requirement |
| --- | --- | --- | --- |
| `pistol` | Pistol | None (0) | Workshop or Dexterity 4 |
| `bullet` | Bullet | None (0) | Workshop or Dexterity 4 |
| `molotov` | Molotov | None (0) | Workshop or Dexterity 4 |
| `bat` | Bat | None (0) | Workshop or Dexterity 4 |
| `axe` | Axe | None (0) | Workshop or Dexterity 4 |
| `knife` | Knife | None (0) | Workshop or Dexterity 4 |
| `harpoon` | Harpoon | None (0) | Workshop or Dexterity 4 |
| `arrow` | Arrow | None (0) | Workshop or Dexterity 4 |
| `trap` | Trap | None (0) | Workshop or Dexterity 4 |
| `c4` | C4 | None (0) | Workshop or Dexterity 4 |

> [!NOTE]
> Items like `nail_bat` and `suppressed_pistol` cannot be crafted via Crafting; they are exclusive to Combine/Separate. Conversely, items like `pistol`, `bullet`, `harpoon`, `trap`, and `c4` cannot be assembled via Combine/Separate.

### 2. Combine and Separate catalog (`manipulate`)

Combine/Separate is defined by the creation recipes from the item table.

#### Combine options (7 recipes)

The Combine selector shows exactly these seven recipes requiring inventory ingredients:

| Recipe ID | Output Item | Ingredients Consumed | Location Requirement |
| --- | --- | --- | --- |
| `knife` | Knife (`knife`) | Wood ×1, Spike ×2 | Anywhere |
| `bat` | Bat (`bat`) | Wood ×4 | Anywhere |
| `nail_bat` | Nail bat (`nail_bat`) | Bat ×1, Nails ×2 | Anywhere |
| `axe` | Axe (`axe`) | Wood ×3, Spike ×2 | Anywhere |
| `molotov` | Molotov (`molotov`) | Bottle ×1, Fuel ×1 | Anywhere |
| `arrow` | Arrow (`arrow`) | Wood ×1, Spike ×1 | Anywhere |
| `suppressed_pistol` | Silenced pistol (`suppressed_pistol`) | Pistol ×1, Silencer ×1 | Anywhere |

#### Separate options (7 recipes)

The Separate selector reverses the base recipes, consuming one output item and returning its exact components:

| Separate Option | Item Consumed | Components Returned |
| --- | --- | --- |
| Separate Knife | Knife ×1 | Wood ×1, Spike ×2 |
| Separate Bat | Bat ×1 | Wood ×4 |
| Separate Nail bat | Nail bat ×1 | Bat ×1, Nails ×2 |
| Separate Axe | Axe ×1 | Wood ×3, Spike ×2 |
| Separate Molotov | Molotov ×1 | Bottle ×1, Fuel ×1 |
| Separate Arrow | Arrow ×1 | Wood ×1, Spike ×1 |
| Separate Silenced pistol | Silenced pistol ×1 | Pistol ×1, Silencer ×1 |

Poison coating on melee weapons remains a separate operation as described in game rules, not part of standard item recipe catalog.

### Comparison summary

| Feature | Crafting (`fabricate`) | Combine/Separate (`manipulate`) |
| --- | --- | --- |
| **Energy cost** | 3 | 1 (+1 per extra execution, max 3 extras) |
| **Cooldown** | 3 | 3 |
| **Experience** | +2 XP | Base (0) |
| **Location / Skill** | Workshop tile OR Dexterity 4 | Anywhere |
| **Inventory ingredients** | None (does not consume items) | Required (consumes components) |
| **Outputs** | 10 items (Pistol, Bullet, Molotov, Bat, Axe, Knife, Harpoon, Arrow, Trap, C4) | 7 items (Knife, Bat, Nail bat, Axe, Molotov, Arrow, Silenced pistol) |
| **Reverse (Separate)** | No | Yes (disassembles all 7 recipes) |
| **Action order** | 14 (sub-order 0) | 6 (sub-order 3) |

## Selector and UI behavior

### Crafting selector
- Opens a product selector showing the 10 craftable items with icons and descriptions.
- **No ingredient shortage warnings**: Items do not require inventory components, so no "Missing X" warnings are displayed.
- Shows action-level requirement warning when the player is not currently at a Workshop and does not have Dexterity 4.
- Allows selection of one product to craft.

### Combine/Separate selector
- Opens with a choice/tab between **Combine** (7 recipes) and **Separate** (7 dismantles).
- Always displays all eligible recipes; does not hide uncraftable recipes.
- **Ingredient shortage warnings**: Uses projected inventory to show required vs available quantities (e.g., `Missing Spike ×1`). Shortages set `missingRequirement` in warning color without disabling selection (matching action selector UX).
- For Separate, shows the item required and returned parts, with a warning if the item is not carried.
- Supports up to 4 operations (1 base + up to 3 extra executions). Each repeat can choose a distinct operation.

## Projected inventory and authoritative validation

- **Projection scope**: Applies strictly to **Combine/Separate**, where carried inventory + items picked up earlier in turn (Pick Up 6.1) - items consumed by earlier operations are tracked.
- **Crafting validation**:
  - Server verifies: energy, cooldown, Workshop tile or Dexterity 4, character inventory weight capacity.
  - Grants the crafted item and awards +2 XP.
- **Combine/Separate validation**:
  - Server verifies: energy, cooldown, presence of required items in inventory.
  - Atomically consumes input items and grants output items (or vice-versa for Separate).
  - On failure, no items are consumed or granted, and a failed action replay event is recorded.

## Implementation work

1. Add [RecipesLibrary.ts](file:///e:/Dev/ZarkaGit/shared/src/RecipesLibrary.ts) defining:
   - `CRAFTABLE_ITEMS`: Array/record of the 10 item IDs craftable via `fabricate`.
   - `MANIPULATE_RECIPES`: Array/record of the 7 recipes with explicit `{ itemId, quantity }` inputs and outputs.
   - `SEPARATE_RECIPES`: Reversal helper derived from `MANIPULATE_RECIPES`.
2. Update [ActionLibrary.ts](file:///e:/Dev/ZarkaGit/shared/src/ActionLibrary.ts):
   - Set `experience: { base: 2 }` on `fabricate`.
   - Ensure descriptions and requirements reflect Workshop / Dexterity 4 requirement and 10 craftable items.
3. Build client selectors in `client/src/ui/`:
   - Crafting selector for `fabricate` (10 items, no ingredient warnings, checks Workshop / Dexterity 4).
   - Combine/Separate selector for `manipulate` (Combine tab with 7 recipes + Separate tab with 7 recipes, ingredient projections and warnings).
4. Implement server action handlers in `server/modules/src/match/actions/`:
   - `executeFabricate`: Checks Workshop / Dexterity 4, adds crafted item, grants +2 XP.
   - `executeManipulate`: Validates and executes Combine or Separate operations atomically.
5. Add client replay and log formatters in [CharacterPanelLogView.ts](file:///e:/Dev/ZarkaGit/client/src/ui/CharacterPanelLogView.ts) for both actions.

## Tests and acceptance

### Automated tests
- **Catalog validation**:
  - `CRAFTABLE_ITEMS` contains exactly the 10 specified items.
  - `MANIPULATE_RECIPES` contains exactly the 7 recipes with valid `ItemId`s and positive integers.
  - `SEPARATE_RECIPES` correctly inverses all 7 recipes.
- **Crafting tests**:
  - Allowed at Workshop or with Dexterity 4.
  - Rejected outside Workshop without Dexterity 4.
  - Does not deduct any items from inventory.
  - Grants selected item and +2 XP upon execution.
- **Combine/Separate tests**:
  - Combine consumes exact ingredient items and creates output.
  - Separate consumes output item and returns exact ingredients.
  - Fails cleanly without state mutation if items are missing.
  - Extra executions correctly chain inventory consumption and returns.

### Manual acceptance
1. Select Crafting: verify all 10 items appear without ingredient warnings; verify Workshop / Dexterity 4 warning displays outside Workshop when lacking Dexterity 4.
2. Select Combine/Separate: verify 7 Combine recipes show ingredient requirements and shortage warnings; verify 7 Separate options show dismantlable items.
3. Craft an item (e.g., Bat) at Workshop: verify no wood is deducted, bat is added, and +2 XP is awarded.
4. Combine an item (e.g., Bat with 4 Wood): verify 4 Wood are consumed and 1 Bat is created.
5. Separate an item: verify item is dismantled and original ingredients returned.

## Implementation task breakdown

Tasks 1–2 can start in parallel. Tasks 3–4 can run in parallel after them; Tasks 6–7 can run in parallel after Task 5.

1. [Shared recipe catalogs](CRAFTING_TASK_1.md)
2. [Action metadata and localized labels](CRAFTING_TASK_2.md)
3. [Crafting product selector](CRAFTING_TASK_3.md)
4. [Combine/Separate selector](CRAFTING_TASK_4.md)
5. [Connect selectors to action planning](CRAFTING_TASK_5.md)
6. [Authoritative Crafting resolution](CRAFTING_TASK_6.md)
7. [Authoritative Combine/Separate resolution](CRAFTING_TASK_7.md)
8. [Replay and log formatters](CRAFTING_TASK_8.md)
9. [End-to-end workflow validation](CRAFTING_TASK_9.md)
