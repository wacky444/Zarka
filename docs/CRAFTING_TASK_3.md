# Crafting Task 3: Build the Crafting Product Selector

## Goal

Build a reusable client selector for choosing one of the 10 Crafting products. Keep selector presentation separate from action submission so it can be tested and connected later.

## Dependencies

- Task 1: shared Crafting catalog.
- Task 2: action labels and metadata.

## Scope

- Add a focused component under `client/src/ui/` that renders catalog products with existing item icons and descriptions.
- Emit the selected `ItemId` through a callback; do not submit or persist an action from this component.
- Always show all 10 products. Do not show ingredient counts or inventory-shortage warnings.
- Show an advisory requirement warning unless the current character is at a Workshop or has `dexterity4`. Reuse the existing action-requirement logic where practical.
- Keep warnings informational; server execution remains authoritative.

## Acceptance

- Selector contains exactly the 10 Crafting products and returns the selected product ID.
- No product is marked as requiring or consuming carried ingredients.
- Workshop and Dexterity 4 each satisfy the location/skill warning; neither condition alone incorrectly blocks selection.
- Selector can be opened, closed, and reused without changing the action plan.

## Validation

- Add focused tests for catalog rendering data, selection callbacks, absence of ingredient warnings, and both requirement-satisfied cases.
- Run `npm run build` and `npm run lint` in `client/`; perform a visual smoke test at desktop and mobile panel sizes.
